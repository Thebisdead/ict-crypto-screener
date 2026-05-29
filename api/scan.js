// ─────────────────────────────────────────────────────────────────────────────
// Crypto ICT Screener – scan.js
// FIX: Uses /coins/markets current_price (real-time) for the display price
//      Uses /coins/{id}/ohlc for historical OHLCV (ICT signal detection only)
//      Last candle is patched with today's current_price so signals are current
// ─────────────────────────────────────────────────────────────────────────────

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
  if (!sl.length) return (candles[0]?.close || 1) * 0.03;
  return sl.reduce((a,b)=>a+b,0) / sl.length;
}

function calcAvgVol(candles, period = 20) {
  const s = candles.slice(-period);
  return s.reduce((a,c)=>a+c.volume,0) / (s.length || 1);
}

function pivotHighs(c, n = 3) {
  const out = [];
  for (let i = n; i < c.length - n; i++) {
    let ok = true;
    for (let j = i-n; j <= i+n; j++) { if(j!==i && c[j].high >= c[i].high){ok=false;break;} }
    if (ok) out.push(i);
  }
  return out;
}

function pivotLows(c, n = 3) {
  const out = [];
  for (let i = n; i < c.length - n; i++) {
    let ok = true;
    for (let j = i-n; j <= i+n; j++) { if(j!==i && c[j].low <= c[i].low){ok=false;break;} }
    if (ok) out.push(i);
  }
  return out;
}

function bullOB(c, atr, lb=40, dm=0.8) {
  for (let i=c.length-1; i>=Math.max(1,c.length-lb); i--) {
    if (c[i].close-c[i].open < atr*dm) continue;
    for (let j=i-1; j>=Math.max(0,i-4); j--)
      if (c[j].close < c[j].open) return {high:c[j].high, low:c[j].low};
  }
  return null;
}

function bearOB(c, atr, lb=40, dm=0.8) {
  for (let i=c.length-1; i>=Math.max(1,c.length-lb); i--) {
    if (c[i].open-c[i].close < atr*dm) continue;
    for (let j=i-1; j>=Math.max(0,i-4); j--)
      if (c[j].close > c[j].open) return {high:c[j].high, low:c[j].low};
  }
  return null;
}

function bullFVG(c, atr, lb=40) {
  const e = c.length-1;
  for (let i=e; i>=Math.max(2,e-lb); i--) {
    const bot=c[i-2].high, top=c[i].low;
    if (top<=bot || top-bot<atr*0.1) continue;
    let ok=true;
    for (let k=i+1;k<=e;k++) if(c[k].close<bot){ok=false;break;}
    if (ok) return {top, bot};
  }
  return null;
}

function bearFVG(c, atr, lb=40) {
  const e = c.length-1;
  for (let i=e; i>=Math.max(2,e-lb); i--) {
    const top=c[i-2].low, bot=c[i].high;
    if (bot>=top || top-bot<atr*0.1) continue;
    let ok=true;
    for (let k=i+1;k<=e;k++) if(c[k].close>top){ok=false;break;}
    if (ok) return {top, bot};
  }
  return null;
}

function bullMSB(c, phIdxs, win=20) {
  const e = c.length-1;
  for (const idx of [...phIdxs].reverse()) {
    const lv = c[idx].high;
    for (let i=idx+1;i<=e;i++) if(c[i].close>lv){if(i>=e-win)return lv;break;}
  }
  return null;
}

function bearMSB(c, plIdxs, win=20) {
  const e = c.length-1;
  for (const idx of [...plIdxs].reverse()) {
    const lv = c[idx].low;
    for (let i=idx+1;i<=e;i++) if(c[i].close<lv){if(i>=e-win)return lv;break;}
  }
  return null;
}

function bullLS(c, plIdxs, win=20) {
  const e = c.length-1;
  for (const idx of plIdxs) {
    if (idx>e-win) continue;
    const lv = c[idx].low;
    for (let i=idx+1;i<=e;i++)
      if(c[i].low<lv && c[i].close>lv && i>=e-win) return true;
  }
  return false;
}

function bearLS(c, phIdxs, win=20) {
  const e = c.length-1;
  for (const idx of phIdxs) {
    if (idx>e-win) continue;
    const lv = c[idx].high;
    for (let i=idx+1;i<=e;i++)
      if(c[i].high>lv && c[i].close<lv && i>=e-win) return true;
  }
  return false;
}

function bullOTE(c, plIdxs, phIdxs) {
  if (!plIdxs.length||!phIdxs.length) return false;
  const pL=plIdxs[plIdxs.length-1], pH=phIdxs[phIdxs.length-1];
  if (pL>=pH) return false;
  const rng=c[pH].high-c[pL].low; if(rng<=0) return false;
  const p=c[c.length-1].close;
  return p>=(c[pH].high-rng*0.786)*0.998 && p<=(c[pH].high-rng*0.618)*1.002;
}

function bearOTE(c, plIdxs, phIdxs) {
  if (!plIdxs.length||!phIdxs.length) return false;
  const pL=plIdxs[plIdxs.length-1], pH=phIdxs[phIdxs.length-1];
  if (pH>=pL) return false;
  const rng=c[pH].high-c[pL].low; if(rng<=0) return false;
  const p=c[c.length-1].close;
  return p>=(c[pL].low+rng*0.618)*0.998 && p<=(c[pL].low+rng*0.786)*1.002;
}

// Smart price formatter for crypto (handles $0.000001 to $100,000)
function fmtP(v) {
  if (!v && v !== 0) return 0;
  if (v >= 1000) return +v.toFixed(2);
  if (v >= 1)    return +v.toFixed(4);
  if (v >= 0.01) return +v.toFixed(6);
  return +v.toPrecision(4);
}

function analyzeICT(coin, candles) {
  if (!candles || candles.length < 20) return null;

  // ── CRITICAL FIX: Use real-time currentPrice from markets API ──────────────
  // OHLC candles only go up to yesterday's close. We MUST override with the
  // live price from /coins/markets so users see accurate current price.
  const livePrice = coin.currentPrice;
  const prev      = candles[candles.length - 2];

  // Patch the last candle with live price for correct ICT signal calculation
  const patchedCandles = [...candles];
  const lastIdx = patchedCandles.length - 1;
  const lastCandle = { ...patchedCandles[lastIdx] };
  if (livePrice && livePrice > 0) {
    // Update close to live price; also update high/low if live is outside range
    lastCandle.close = livePrice;
    lastCandle.high  = Math.max(lastCandle.high, livePrice);
    lastCandle.low   = Math.min(lastCandle.low, livePrice);
  }
  patchedCandles[lastIdx] = lastCandle;

  const price     = livePrice || lastCandle.close;
  const atr       = calcATR(patchedCandles);
  const avgVol    = calcAvgVol(patchedCandles);

  // ── CRITICAL FIX: Use 24h change from markets API, not OHLC calc ──────────
  // OHLC yesterday-close vs today-open is NOT the same as 24h change
  const changePct = coin.changePct24h || 0;

  // ── CRITICAL FIX: Use 24h volume from markets API ────────────────────────
  const volume24h = coin.volume24h || 0;
  const volRatio  = avgVol > 0 ? volume24h / avgVol : 1;

  const phIdxs = pivotHighs(patchedCandles, 3);
  const plIdxs = pivotLows(patchedCandles, 3);

  const bOB  = bullOB(patchedCandles, atr);
  const bFVG = bullFVG(patchedCandles, atr);
  const bMSB = bullMSB(patchedCandles, phIdxs);
  const bLS  = bullLS(patchedCandles, plIdxs);
  const bOTE = bullOTE(patchedCandles, plIdxs, phIdxs);
  const rOB  = bearOB(patchedCandles, atr);
  const rFVG = bearFVG(patchedCandles, atr);
  const rMSB = bearMSB(patchedCandles, plIdxs);
  const rLS  = bearLS(patchedCandles, phIdxs);
  const rOTE = bearOTE(patchedCandles, plIdxs, phIdxs);

  const bScore=(bOB?2:0)+(bFVG?2:0)+(bMSB?2:0)+(bLS?1.5:0)+(bOTE?1:0);
  const rScore=(rOB?2:0)+(rFVG?2:0)+(rMSB?2:0)+(rLS?1.5:0)+(rOTE?1:0);
  const MIN = 1.5;
  if (bScore < MIN && rScore < MIN) return null;

  let bias, sigs=[], score;
  if (bScore >= rScore && bScore >= MIN) {
    bias='bullish'; score=bScore;
    if(bOB) sigs.push("OB"); if(bFVG) sigs.push("FVG"); if(bMSB) sigs.push("MSB");
    if(bLS) sigs.push("LS"); if(bOTE) sigs.push("OTE");
  } else {
    bias='bearish'; score=rScore;
    if(rOB) sigs.push("OB"); if(rFVG) sigs.push("FVG"); if(rMSB) sigs.push("MSB");
    if(rLS) sigs.push("LS"); if(rOTE) sigs.push("OTE");
  }
  if (volRatio >= 1.5) score = Math.min(8.5, score + 0.5);
  const strength = Math.max(1, Math.min(10, Math.round((score/8.5)*10)));

  const obZ  = bias==='bullish' ? bOB  : rOB;
  const fvZ  = bias==='bullish' ? bFVG : rFVG;
  const msL  = bias==='bullish' ? bMSB : rMSB;

  let entry=price, stop, target;
  if (bias==='bullish') {
    stop   = obZ ? obZ.low - atr*0.5
           : plIdxs.length ? patchedCandles[plIdxs[plIdxs.length-1]].low - atr*0.3
           : price - atr*2;
    target = entry + (entry - stop) * 2.5;
  } else {
    stop   = obZ ? obZ.high + atr*0.5
           : phIdxs.length ? patchedCandles[phIdxs[phIdxs.length-1]].high + atr*0.3
           : price + atr*2;
    target = entry - (stop - entry) * 2.5;
  }
  const rr = Math.abs(entry-stop) > 0 ? Math.abs(target-entry)/Math.abs(entry-stop) : 0;

  const parts=[];
  if(sigs.includes("OB"))  parts.push("Order Block");
  if(sigs.includes("FVG")) parts.push("open FVG");
  if(sigs.includes("MSB")) parts.push("structure break");
  if(sigs.includes("LS"))  parts.push("liquidity sweep");
  if(sigs.includes("OTE")) parts.push("OTE zone");

  return {
    id:          coin.id,
    symbol:      coin.symbol,
    name:        coin.name,
    rank:        coin.rank,
    category:    coin.category,
    // ← Real-time price from CoinGecko markets API
    price:       fmtP(price),
    changePct:   +changePct.toFixed(2),
    // ← Real 24h volume from markets API
    volume:      Math.round(volume24h),
    avgVolume:   Math.round(avgVol),
    volRatio:    +volRatio.toFixed(2),
    high24h:     fmtP(coin.high24h),
    low24h:      fmtP(coin.low24h),
    lastUpdated: coin.lastUpdated,
    signals:     sigs,
    strength,
    bias,
    description: `${bias==='bullish'?'Bullish':'Bearish'}: ${parts.join(', ')}.`,
    obHigh:   obZ?.high  ?? null,
    obLow:    obZ?.low   ?? null,
    fvgTop:   fvZ?.top   ?? null,
    fvgBot:   fvZ?.bot   ?? null,
    msbLevel: msL        ?? null,
    entry:    fmtP(entry),
    stop:     fmtP(stop),
    target:   fmtP(target),
    rr:       +rr.toFixed(2),
    atr:      fmtP(atr),
    candleCount: patchedCandles.length,
  };
}

// ── CoinGecko OHLC fetch ──────────────────────────────────────────────────────
// Returns daily candles for ICT signal detection (not for price display)
async function fetchOHLC(coinId) {
  // days=90 returns daily candles (~90 bars) — ideal for daily ICT
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=90`;
  const res = await fetch(url, {
    headers: { "Accept":"application/json","User-Agent":"Mozilla/5.0" }
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("rate_limited");
    return null;
  }
  const data = await res.json();
  // Format: [[timestamp_ms, open, high, low, close], ...]
  if (!Array.isArray(data) || data.length < 20) return null;

  // Build candles — volume is not in OHLC endpoint; set to 0 (we use markets vol)
  return data.map(d => ({
    date:   new Date(d[0]).toISOString().slice(0, 10),
    open:   d[1],
    high:   d[2],
    low:    d[3],
    close:  d[4],
    volume: 0, // OHLC endpoint has no volume; we inject 24h vol from markets
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const batchSize = 5;

  // Resolve base URL for internal API calls
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const base  = `${proto}://${host}`;

  // meta endpoint
  if (req.query.meta !== undefined) {
    try {
      const r    = await fetch(`${base}/api/coins`, { headers:{"Accept":"application/json"} });
      const data = await r.json();
      return res.json({ total: data.coins?.length || 100, batchSize });
    } catch {
      return res.json({ total: 100, batchSize });
    }
  }

  // Fetch live coin list (includes currentPrice, changePct24h, volume24h)
  let coins = [];
  try {
    const r    = await fetch(`${base}/api/coins`, { headers:{"Accept":"application/json"} });
    const data = await r.json();
    coins = data.coins || [];
  } catch (e) {
    return res.json({ results:[], done:true, _error:"Could not fetch coin list: "+e.message });
  }

  const batch = parseInt(req.query.batch ?? "0", 10);
  const slice = coins.slice(batch * batchSize, (batch + 1) * batchSize);
  if (!slice.length) return res.json({ results:[], done:true });

  const settled = await Promise.allSettled(
    slice.map(async (coin) => {
      try {
        // Skip coins without live price (shouldn't happen but guard anyway)
        if (!coin.currentPrice || coin.currentPrice <= 0) return null;

        const candles = await fetchOHLC(coin.id);
        if (!candles) return null;
        return analyzeICT(coin, candles);
      } catch (e) {
        if (e.message === "rate_limited") throw e; // propagate rate limit up
        return null;
      }
    })
  );

  const results = settled
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  const errors    = settled.filter(r => r.status === 'rejected').length;
  const nulls     = settled.filter(r => r.status === 'fulfilled' && r.value === null).length;
  const rateLimited = settled.some(r => r.status === 'rejected' && r.reason?.message === 'rate_limited');

  return res.json({
    results,
    done:        (batch + 1) * batchSize >= coins.length,
    rateLimited,
    _debug:      { batch, fetched: slice.length, signals: results.length, errors, nulls },
  });
};
