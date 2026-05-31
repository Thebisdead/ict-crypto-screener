// ─────────────────────────────────────────────────────────────────────────────
// Crypto ICT Screener — scan.js  (architecture v3)
//
// ROOT CAUSE OF WRONG DATA (previous version):
//   coins.js fired 10 parallel CoinGecko requests → instant 429 rate limit
//   → fell back to hardcoded stale prices → users saw wrong prices
//
// NEW ARCHITECTURE — no pre-loading, no internal HTTP calls:
//   Each batch request to /api/scan?batch=N:
//   1. Fetches one page of /coins/markets (100 coins, 1 request) → REAL prices
//   2. For each coin in the slice, fetches /coins/{id}/ohlc → ICT candles
//   3. Patches last OHLC candle with the live price from step 1
//   4. Runs ICT engine and returns results
//
// This way: 1 markets request + N ohlc requests per batch, no rate limit spike
// ─────────────────────────────────────────────────────────────────────────────

const STABLECOINS = new Set([
  "tether","usd-coin","dai","binance-usd","true-usd","pax-dollar","frax",
  "usdd","fdusd","paypal-usd","staked-ether","wrapped-steth","rocket-pool-eth",
  "coinbase-wrapped-staked-eth","wrapped-bitcoin","first-digital-usd",
  "ethena-usde","mountain-protocol-usdm","usual","bridged-usdc-polygon-pos-bridge",
]);

// ── Category classifier ───────────────────────────────────────────────────────
function classify(id, rank) {
  const map = {
    "Layer 1":   ["bitcoin","ethereum","solana","binancecoin","cardano","avalanche-2",
                  "polkadot","near","cosmos","algorand","tron","aptos","sui","sei-network",
                  "celestia","injective-protocol","the-open-network","internet-computer",
                  "fantom","flow","mina-protocol","neo","vechain","hedera-hashgraph",
                  "kaspa","theta-token","filecoin","eos","litecoin","bitcoin-cash",
                  "ethereum-classic","monero","stellar","ripple"],
    "Layer 2":   ["arbitrum","optimism","polygon","immutable-x","starknet","base",
                  "zksync","mantle","linea","scroll","blast-2","mode"],
    "DeFi":      ["uniswap","aave","compound-governance-token","maker","curve-dao-token",
                  "synthetix-network-token","yearn-finance","pancakeswap-token","sushiswap",
                  "balancer","1inch","lido-dao","jupiter-exchange-solana","raydium",
                  "jito-governance-token","orca","dydx","gmx","pendle","hyperliquid"],
    "AI":        ["fetch-ai","singularitynet","ocean-protocol","render-token","akash-network",
                  "bittensor","worldcoin-wld","io","grass","nosana","virtual-protocol",
                  "artificial-superintelligence-alliance"],
    "Meme":      ["dogecoin","shiba-inu","pepe","floki","bonk","dogwifcoin","popcat",
                  "book-of-meme","cat-in-a-dogs-world","brett","mog-coin","fartcoin",
                  "pnut","goat","neiro-on-eth"],
    "Gaming":    ["axie-infinity","decentraland","the-sandbox","gala","illuvium","beam-2",
                  "wax","enjincoin","ronin","pixels","catizen","notcoin"],
    "RWA":       ["chainlink","the-graph","band-protocol","api3","pyth-network",
                  "ondo-finance","goldfinch","maple","centrifuge"],
    "CEX Token": ["binancecoin","crypto-com-chain","kucoin-shares","okb","gate",
                  "bitget-token","huobi-token","bybit-token"],
  };
  for (const [cat, ids] of Object.entries(map)) {
    if (ids.includes(id)) return cat;
  }
  if (rank <= 20)  return "Mega Cap";
  if (rank <= 100) return "Large Cap";
  if (rank <= 300) return "Mid Cap";
  return "Small Cap";
}

// ── ICT Engine ────────────────────────────────────────────────────────────────
function calcATR(candles, period = 14) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i-1].close),
      Math.abs(candles[i].low  - candles[i-1].close)
    ));
  }
  const sl = trs.slice(-period);
  return sl.length ? sl.reduce((a,b)=>a+b,0)/sl.length : (candles[0]?.close||1)*0.03;
}

function calcAvgVol(candles, period = 20) {
  const s = candles.slice(-period);
  return s.reduce((a,c)=>a+c.volume,0) / (s.length||1);
}

function pivotHighs(c, n=3) {
  const out=[];
  for (let i=n; i<c.length-n; i++) {
    let ok=true;
    for (let j=i-n;j<=i+n;j++) if(j!==i&&c[j].high>=c[i].high){ok=false;break;}
    if(ok) out.push(i);
  }
  return out;
}

function pivotLows(c, n=3) {
  const out=[];
  for (let i=n; i<c.length-n; i++) {
    let ok=true;
    for (let j=i-n;j<=i+n;j++) if(j!==i&&c[j].low<=c[i].low){ok=false;break;}
    if(ok) out.push(i);
  }
  return out;
}

const bullOB=(c,atr,lb=40,dm=0.8)=>{
  for(let i=c.length-1;i>=Math.max(1,c.length-lb);i--){
    if(c[i].close-c[i].open<atr*dm)continue;
    for(let j=i-1;j>=Math.max(0,i-4);j--)
      if(c[j].close<c[j].open)return{high:c[j].high,low:c[j].low};
  }return null;};

const bearOB=(c,atr,lb=40,dm=0.8)=>{
  for(let i=c.length-1;i>=Math.max(1,c.length-lb);i--){
    if(c[i].open-c[i].close<atr*dm)continue;
    for(let j=i-1;j>=Math.max(0,i-4);j--)
      if(c[j].close>c[j].open)return{high:c[j].high,low:c[j].low};
  }return null;};

const bullFVG=(c,atr,lb=40)=>{
  const e=c.length-1;
  for(let i=e;i>=Math.max(2,e-lb);i--){
    const bot=c[i-2].high,top=c[i].low;
    if(top<=bot||top-bot<atr*0.1)continue;
    let ok=true;for(let k=i+1;k<=e;k++)if(c[k].close<bot){ok=false;break;}
    if(ok)return{top,bot};
  }return null;};

const bearFVG=(c,atr,lb=40)=>{
  const e=c.length-1;
  for(let i=e;i>=Math.max(2,e-lb);i--){
    const top=c[i-2].low,bot=c[i].high;
    if(bot>=top||top-bot<atr*0.1)continue;
    let ok=true;for(let k=i+1;k<=e;k++)if(c[k].close>top){ok=false;break;}
    if(ok)return{top,bot};
  }return null;};

const bullMSB=(c,ph,win=20)=>{
  const e=c.length-1;
  for(const idx of [...ph].reverse()){
    const lv=c[idx].high;
    for(let i=idx+1;i<=e;i++)if(c[i].close>lv){if(i>=e-win)return lv;break;}
  }return null;};

const bearMSB=(c,pl,win=20)=>{
  const e=c.length-1;
  for(const idx of [...pl].reverse()){
    const lv=c[idx].low;
    for(let i=idx+1;i<=e;i++)if(c[i].close<lv){if(i>=e-win)return lv;break;}
  }return null;};

const bullLS=(c,pl,win=20)=>{
  const e=c.length-1;
  for(const idx of pl){
    if(idx>e-win)continue;const lv=c[idx].low;
    for(let i=idx+1;i<=e;i++)if(c[i].low<lv&&c[i].close>lv&&i>=e-win)return true;
  }return false;};

const bearLS=(c,ph,win=20)=>{
  const e=c.length-1;
  for(const idx of ph){
    if(idx>e-win)continue;const lv=c[idx].high;
    for(let i=idx+1;i<=e;i++)if(c[i].high>lv&&c[i].close<lv&&i>=e-win)return true;
  }return false;};

const bullOTE=(c,pl,ph)=>{
  if(!pl.length||!ph.length)return false;
  const pL=pl[pl.length-1],pH=ph[ph.length-1];
  if(pL>=pH)return false;
  const rng=c[pH].high-c[pL].low;if(rng<=0)return false;
  const p=c[c.length-1].close;
  return p>=(c[pH].high-rng*0.786)*0.998&&p<=(c[pH].high-rng*0.618)*1.002;};

const bearOTE=(c,pl,ph)=>{
  if(!pl.length||!ph.length)return false;
  const pL=pl[pl.length-1],pH=ph[ph.length-1];
  if(pH>=pL)return false;
  const rng=c[pH].high-c[pL].low;if(rng<=0)return false;
  const p=c[c.length-1].close;
  return p>=(c[pL].low+rng*0.618)*0.998&&p<=(c[pL].low+rng*0.786)*1.002;};

function fmtP(v) {
  if(!v&&v!==0)return 0;
  if(v>=10000)return +v.toFixed(2);
  if(v>=1)return +v.toFixed(4);
  if(v>=0.01)return +v.toFixed(6);
  return +v.toPrecision(4);
}

function analyzeICT(coin, candles) {
  if(!candles||candles.length<20) return null;

  // Patch last candle with LIVE price from markets API
  const live = coin.currentPrice;
  const c = [...candles];
  const li = c.length-1;
  c[li] = {
    ...c[li],
    close:  live,
    high:   Math.max(c[li].high, live),
    low:    Math.min(c[li].low,  live),
    // inject real 24h volume into last candle so avgVol calc uses it
    volume: coin.volume24h || c[li].volume,
  };

  const price    = live;
  const atr      = calcATR(c);
  const avgVol   = calcAvgVol(c);
  // volRatio: today's 24h vol vs 20-day average
  const volRatio = avgVol>0 ? (coin.volume24h||0)/avgVol : 1;
  const ph = pivotHighs(c,3), pl = pivotLows(c,3);

  const bOB=bullOB(c,atr),rOB=bearOB(c,atr);
  const bFVG=bullFVG(c,atr),rFVG=bearFVG(c,atr);
  const bMSB=bullMSB(c,ph),rMSB=bearMSB(c,pl);
  const bLS=bullLS(c,pl),rLS=bearLS(c,ph);
  const bOTE=bullOTE(c,pl,ph),rOTE=bearOTE(c,pl,ph);

  const bs=(bOB?2:0)+(bFVG?2:0)+(bMSB?2:0)+(bLS?1.5:0)+(bOTE?1:0);
  const rs=(rOB?2:0)+(rFVG?2:0)+(rMSB?2:0)+(rLS?1.5:0)+(rOTE?1:0);
  const MIN=1.5;
  if(bs<MIN&&rs<MIN) return null;

  let bias,sigs=[],score;
  if(bs>=rs&&bs>=MIN){
    bias='bullish';score=bs;
    if(bOB)sigs.push("OB");if(bFVG)sigs.push("FVG");if(bMSB)sigs.push("MSB");
    if(bLS)sigs.push("LS");if(bOTE)sigs.push("OTE");
  } else {
    bias='bearish';score=rs;
    if(rOB)sigs.push("OB");if(rFVG)sigs.push("FVG");if(rMSB)sigs.push("MSB");
    if(rLS)sigs.push("LS");if(rOTE)sigs.push("OTE");
  }
  if(volRatio>=1.5) score=Math.min(8.5,score+0.5);
  const strength=Math.max(1,Math.min(10,Math.round((score/8.5)*10)));

  const obZ=bias==='bullish'?bOB:rOB;
  const fvZ=bias==='bullish'?bFVG:rFVG;
  const msL=bias==='bullish'?bMSB:rMSB;

  let entry=price,stop,target;
  if(bias==='bullish'){
    stop=obZ?obZ.low-atr*0.5:pl.length?c[pl[pl.length-1]].low-atr*0.3:price-atr*2;
    target=entry+(entry-stop)*2.5;
  } else {
    stop=obZ?obZ.high+atr*0.5:ph.length?c[ph[ph.length-1]].high+atr*0.3:price+atr*2;
    target=entry-(stop-entry)*2.5;
  }
  const rr=Math.abs(entry-stop)>0?Math.abs(target-entry)/Math.abs(entry-stop):0;
  const parts=[];
  if(sigs.includes("OB"))parts.push("Order Block");
  if(sigs.includes("FVG"))parts.push("open FVG");
  if(sigs.includes("MSB"))parts.push("structure break");
  if(sigs.includes("LS"))parts.push("liquidity sweep");
  if(sigs.includes("OTE"))parts.push("OTE zone");

  return {
    id:coin.id, symbol:coin.symbol, name:coin.name,
    rank:coin.rank, category:coin.category,
    price:        fmtP(price),       // ← LIVE from markets API
    changePct:    +coin.changePct24h.toFixed(2),  // ← LIVE 24h change
    volume:       Math.round(coin.volume24h||0),   // ← LIVE 24h volume
    avgVolume:    Math.round(avgVol),
    volRatio:     +volRatio.toFixed(2),
    high24h:      fmtP(coin.high24h||0),
    low24h:       fmtP(coin.low24h||0),
    lastUpdated:  coin.lastUpdated,
    signals:sigs, strength, bias,
    description:`${bias==='bullish'?'Bullish':'Bearish'}: ${parts.join(', ')}.`,
    obHigh:obZ?.high??null, obLow:obZ?.low??null,
    fvgTop:fvZ?.top??null,  fvgBot:fvZ?.bot??null,
    msbLevel:msL??null,
    entry:fmtP(entry), stop:fmtP(stop), target:fmtP(target),
    rr:+rr.toFixed(2), atr:fmtP(atr),
    candleCount:c.length,
  };
}

// ── Fetch one page of /coins/markets (100 coins, REAL-TIME) ──────────────────
async function fetchMarkets(page) {
  const url = `https://api.coingecko.com/api/v3/coins/markets` +
    `?vs_currency=usd&order=market_cap_desc&per_page=100&page=${page}` +
    `&sparkline=false&price_change_percentage=24h`;
  const r = await fetch(url, {
    headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0"},
    signal: AbortSignal.timeout(15000),
  });
  if(r.status===429) throw Object.assign(new Error("rate_limited"),{status:429});
  if(!r.ok) throw new Error(`markets ${r.status}`);
  const data = await r.json();
  return data
    .filter(c => c && c.id && !STABLECOINS.has(c.id))
    .map(c => ({
      id:           c.id,
      symbol:       (c.symbol||"").toUpperCase(),
      name:         c.name,
      rank:         c.market_cap_rank||999,
      currentPrice: c.current_price,          // ← REAL-TIME
      changePct24h: c.price_change_percentage_24h||0, // ← REAL-TIME
      volume24h:    c.total_volume||0,         // ← REAL-TIME
      high24h:      c.high_24h||0,
      low24h:       c.low_24h||0,
      lastUpdated:  c.last_updated,
      category:     classify(c.id, c.market_cap_rank),
    }));
}

// ── Fetch 90-day daily OHLC for ICT signal detection ─────────────────────────
async function fetchOHLC(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=90`;
  const r = await fetch(url, {
    headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0"},
    signal: AbortSignal.timeout(12000),
  });
  if(r.status===429) throw Object.assign(new Error("rate_limited"),{status:429});
  if(!r.ok) return null;
  const data = await r.json();
  if(!Array.isArray(data)||data.length<20) return null;
  return data.map(d=>({
    date:  new Date(d[0]).toISOString().slice(0,10),
    open:  d[1], high:d[2], low:d[3], close:d[4],
    volume:0, // OHLC has no volume; we use markets vol in analyzeICT
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────
// Batch layout: 10 pages × 100 coins = 1000 coins
// Each page = 1 markets request (100 coins) + up to BATCH_SIZE ohlc requests
const PAGE_SIZE   = 100;  // CoinGecko page size
const BATCH_SIZE  = 8;    // coins per scan batch (OHLC requests per batch)
const TOTAL_PAGES = 10;   // = 1000 coins

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","no-store");

  // meta: tell frontend how many total batches to expect
  if (req.query.meta !== undefined) {
    return res.json({ total: TOTAL_PAGES * PAGE_SIZE, batchSize: BATCH_SIZE });
  }

  const batchNum  = parseInt(req.query.batch ?? "0", 10);
  // Which markets page does this batch belong to?
  const coinsPerPage   = PAGE_SIZE;
  const batchesPerPage = Math.ceil(coinsPerPage / BATCH_SIZE);
  const pageIdx   = Math.floor(batchNum / batchesPerPage) + 1; // 1-indexed
  const withinPage = batchNum % batchesPerPage;
  const sliceStart = withinPage * BATCH_SIZE;
  const sliceEnd   = sliceStart + BATCH_SIZE;

  if (pageIdx > TOTAL_PAGES) {
    return res.json({ results:[], done:true });
  }

  // Step 1: fetch the markets page — gets REAL-TIME prices for 100 coins
  let pageCoins;
  try {
    pageCoins = await fetchMarkets(pageIdx);
  } catch(e) {
    const rl = e.message==="rate_limited";
    return res.json({ results:[], done:false, rateLimited:rl,
      _error: rl ? "CoinGecko rate limited" : e.message });
  }

  // Step 2: grab our 8-coin slice from this page
  const slice = pageCoins.slice(sliceStart, sliceEnd);
  if (!slice.length) {
    const done = batchNum >= Math.ceil((TOTAL_PAGES * PAGE_SIZE) / BATCH_SIZE) - 1;
    return res.json({ results:[], done });
  }

  // Step 3: fetch OHLC for each coin in slice (for ICT signal detection)
  const settled = await Promise.allSettled(
    slice.map(async coin => {
      try {
        const candles = await fetchOHLC(coin.id);
        if (!candles) return null;
        return analyzeICT(coin, candles);
      } catch(e) {
        if(e.message==="rate_limited") throw e;
        return null;
      }
    })
  );

  const results = settled
    .filter(r => r.status==="fulfilled" && r.value!==null)
    .map(r => r.value);

  const errors     = settled.filter(r=>r.status==="rejected").length;
  const nulls      = settled.filter(r=>r.status==="fulfilled"&&r.value===null).length;
  const rateLimited= settled.some(r=>r.status==="rejected"&&r.reason?.message==="rate_limited");
  const totalBatches = TOTAL_PAGES * batchesPerPage;
  const done       = batchNum >= totalBatches - 1;

  return res.json({
    results, done, rateLimited,
    _debug:{ batchNum, pageIdx, withinPage, fetched:slice.length,
             signals:results.length, errors, nulls },
  });
};
