// ─────────────────────────────────────────────────────────────────────────────
// /api/coins — Returns top 1000 coins with CURRENT market data
// CoinGecko /coins/markets gives: current_price, 24h_change, volume, market_cap
// This is the real-time snapshot used to inject into scan results
// ─────────────────────────────────────────────────────────────────────────────

const CACHE = { data: null, ts: 0 };
const TTL   = 5 * 60 * 1000; // 5 min cache (CoinGecko updates ~every 60s)

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300");

  if (CACHE.data && Date.now() - CACHE.ts < TTL) {
    return res.json(CACHE.data);
  }

  // CoinGecko free: 100 per page, 10 pages = 1000 coins
  // Each page request returns current_price, price_change_24h, total_volume
  const pages = [1,2,3,4,5,6,7,8,9,10];

  try {
    const results = await Promise.all(
      pages.map(async (page) => {
        const url = `https://api.coingecko.com/api/v3/coins/markets` +
          `?vs_currency=usd&order=market_cap_desc&per_page=100&page=${page}` +
          `&sparkline=false&price_change_percentage=24h`;
        const r = await fetch(url, {
          headers: { "Accept":"application/json","User-Agent":"Mozilla/5.0" }
        });
        if (!res.ok && r.status === 429) throw new Error("Rate limited");
        if (!r.ok) return [];
        return r.json();
      })
    );

    const coins = results
      .flat()
      .filter(c => c && c.id && c.symbol)
      // Skip stablecoins — no ICT signals on pegged assets
      .filter(c => !["usdt","usdc","dai","busd","tusd","usdp","frax","usdd",
                     "fdusd","pyusd","steth","wsteth","reth","cbeth","wbtc",
                     "weeth","susde","usde","paxg","usds","first-digital-usd",
                     "ethena-usde","mountain-protocol-usdm","ondo-us-dollar-yield"
                    ].includes(c.id))
      .map(c => ({
        id:           c.id,
        symbol:       c.symbol.toUpperCase(),
        name:         c.name,
        rank:         c.market_cap_rank || 999,
        // ← These are the REAL-TIME values from markets API
        currentPrice:     c.current_price,
        changePct24h:     c.price_change_percentage_24h || 0,
        volume24h:        c.total_volume || 0,
        marketCap:        c.market_cap || 0,
        high24h:          c.high_24h || 0,
        low24h:           c.low_24h || 0,
        lastUpdated:      c.last_updated,
        category:         getCategory(c.id, c.symbol.toUpperCase(), c.market_cap_rank),
      }));

    const payload = {
      coins,
      total:   coins.length,
      fetched: new Date().toISOString(),
    };

    CACHE.data = payload;
    CACHE.ts   = Date.now();
    return res.json(payload);

  } catch (e) {
    // Return fallback if CoinGecko is unavailable
    if (CACHE.data) return res.json({ ...CACHE.data, stale: true });
    return res.json({ coins: FALLBACK, total: FALLBACK.length, fallback: true });
  }
};

function getCategory(id, sym, rank) {
  const cats = {
    "Layer 1":  ["bitcoin","ethereum","solana","binancecoin","cardano","avalanche-2",
                 "polkadot","near","cosmos","algorand","tron","aptos","sui","sei-network",
                 "celestia","injective-protocol","the-open-network","internet-computer",
                 "fantom","flow","mina-protocol","neo","vechain","hedera-hashgraph",
                 "kaspa","theta-token","filecoin","eos","bitcoin-sv","litecoin",
                 "bitcoin-cash","ethereum-classic","monero","stellar","ripple"],
    "Layer 2":  ["arbitrum","optimism","polygon","immutable-x","starknet","base",
                 "zksync","mantle","linea","scroll","blast-2","mode","zora"],
    "DeFi":     ["uniswap","aave","compound-governance-token","maker","curve-dao-token",
                 "synthetix-network-token","yearn-finance","pancakeswap-token","sushiswap",
                 "balancer","1inch","convex-finance","frax-share","lido-dao","jupiter-exchange-solana",
                 "raydium","jito-governance-token","orca","marinade","dydx","gmx","gains-network",
                 "pendle","eigen-layer","ethena","usual","fluid-protocol","hyperliquid"],
    "AI":       ["fetch-ai","singularitynet","ocean-protocol","artificial-superintelligence-alliance",
                 "render-token","akash-network","bittensor","worldcoin-wld","io","grass",
                 "nosana","myshell","neiro-on-eth","griffain","cookie-dao","virtual-protocol",
                 "aixbt","arc","flock-io","allora-network"],
    "Meme":     ["dogecoin","shiba-inu","pepe","floki","bonk","dogwifcoin","popcat",
                 "book-of-meme","cat-in-a-dogs-world","brett","maga","mog-coin","neiro",
                 "landwolf","sundog","keanu-inu","fartcoin","pnut","based-brett","goat"],
    "Gaming":   ["axie-infinity","decentraland","the-sandbox","gala","illuvium","beam-2",
                 "wax","enjincoin","ronin","treasure-dao","bigtime","pixels","portal",
                 "catizen","hamster-kombat","notcoin","blum"],
    "RWA":      ["chainlink","the-graph","band-protocol","api3","dia-data","pyth-network",
                 "ondo-finance","goldfinch","maple","centrifuge","realtoken","propy",
                 "landshare","lofty-ai"],
    "CEX Token":["binancecoin","crypto-com-chain","kucoin-shares","okb","gate","bitget-token",
                 "huobi-token","mexc-global","bybit-token","bingx"],
  };
  for (const [cat, ids] of Object.entries(cats)) {
    if (ids.includes(id)) return cat;
  }
  if (rank <= 20)  return "Mega Cap";
  if (rank <= 100) return "Large Cap";
  if (rank <= 300) return "Mid Cap";
  return "Small Cap";
}

// Minimal fallback — top 20 by market cap
const FALLBACK = [
  {id:"bitcoin",symbol:"BTC",name:"Bitcoin",rank:1,currentPrice:104000,changePct24h:0,volume24h:0,marketCap:0,high24h:0,low24h:0,lastUpdated:null,category:"Mega Cap"},
  {id:"ethereum",symbol:"ETH",name:"Ethereum",rank:2,currentPrice:3800,changePct24h:0,volume24h:0,marketCap:0,high24h:0,low24h:0,lastUpdated:null,category:"Mega Cap"},
  {id:"solana",symbol:"SOL",name:"Solana",rank:3,currentPrice:185,changePct24h:0,volume24h:0,marketCap:0,high24h:0,low24h:0,lastUpdated:null,category:"Layer 1"},
  {id:"binancecoin",symbol:"BNB",name:"BNB",rank:4,currentPrice:660,changePct24h:0,volume24h:0,marketCap:0,high24h:0,low24h:0,lastUpdated:null,category:"CEX Token"},
  {id:"ripple",symbol:"XRP",name:"XRP",rank:5,currentPrice:2.4,changePct24h:0,volume24h:0,marketCap:0,high24h:0,low24h:0,lastUpdated:null,category:"Large Cap"},
];
