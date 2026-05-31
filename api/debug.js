module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const out = { tests:{}, architecture: {} };

  out.architecture = {
    flow: [
      "1. /api/scan?batch=N fetches CoinGecko /coins/markets?page=X (1 request for 100 coins)",
      "2. Gets current_price, price_change_24h, total_volume — ALL REAL-TIME",
      "3. Then fetches OHLC for each coin in the 8-coin slice",
      "4. Patches last OHLC candle with live price",
      "5. No parallel bursts — only 1 markets request + 8 ohlc per batch",
    ],
    old_bug: "coins.js fired 10 parallel requests at startup → immediate 429 → stale hardcoded prices"
  };

  // Test 1: markets page 1 (gets BTC, ETH, etc. — real-time)
  try {
    const t0 = Date.now();
    const r = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1&price_change_percentage=24h",
      { headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0"}, signal:AbortSignal.timeout(10000) }
    );
    const latency = Date.now()-t0;
    out.tests.markets = { status:r.status, latency_ms:latency, ok:r.ok };
    if (r.ok) {
      const d = await r.json();
      out.tests.markets.coins = d.slice(0,3).map(c=>({
        symbol:      c.symbol?.toUpperCase(),
        price:       c.current_price,
        change_24h:  c.price_change_percentage_24h?.toFixed(2)+"%",
        volume_24h:  c.total_volume,
        last_updated:c.last_updated,
        verdict:     "✓ REAL-TIME price"
      }));
    } else {
      out.tests.markets.error = await r.text().then(t=>t.slice(0,150));
    }
  } catch(e) {
    out.tests.markets = { ok:false, error:String(e).slice(0,200) };
  }

  // Test 2: BTC OHLC (historical candles for ICT)
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=14",
      { headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0"}, signal:AbortSignal.timeout(10000) }
    );
    out.tests.ohlc = { status:r.status, ok:r.ok };
    if (r.ok) {
      const d = await r.json();
      const last = d[d.length-1];
      out.tests.ohlc.candle_count   = d.length;
      out.tests.ohlc.last_date      = last ? new Date(last[0]).toISOString().slice(0,10) : null;
      out.tests.ohlc.last_ohlc_close= last?.[4];
      out.tests.ohlc.verdict        = "Used for ICT signals only — price display uses markets API";
    }
  } catch(e) {
    out.tests.ohlc = { ok:false, error:String(e).slice(0,200) };
  }

  // Test 3: Price accuracy comparison
  if (out.tests.markets.ok && out.tests.ohlc.ok) {
    const mktPrice  = out.tests.markets.coins?.[0]?.price;
    const ohlcClose = out.tests.ohlc.last_ohlc_close;
    if (mktPrice && ohlcClose) {
      const diffPct = Math.abs(mktPrice-ohlcClose)/mktPrice*100;
      out.tests.price_comparison = {
        markets_price:    mktPrice,
        ohlc_last_close:  ohlcClose,
        difference_pct:   diffPct.toFixed(2)+"%",
        verdict: diffPct > 0.5
          ? `⚠ ${diffPct.toFixed(2)}% diff — OHLC is stale, must use markets price`
          : `✓ Prices close (${diffPct.toFixed(2)}% diff)`,
      };
    }
  }

  res.json(out);
};
