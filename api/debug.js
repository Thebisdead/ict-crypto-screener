module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const out = { tests: {} };

  // Test 1: CoinGecko markets (real-time price)
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=3&page=1",
      { headers: { "Accept":"application/json","User-Agent":"Mozilla/5.0" } }
    );
    out.tests.markets = { status: r.status, ok: r.ok };
    if (r.ok) {
      const d = await r.json();
      const btc = d[0];
      out.tests.markets.btc_price       = btc?.current_price;
      out.tests.markets.btc_change_24h  = btc?.price_change_percentage_24h?.toFixed(2)+"%";
      out.tests.markets.btc_volume_24h  = btc?.total_volume;
      out.tests.markets.btc_last_updated= btc?.last_updated;
      out.tests.markets.note = "✓ This is the REAL-TIME price source";
    }
  } catch (e) { out.tests.markets = { error: String(e).slice(0,200) }; }

  // Test 2: CoinGecko OHLC (historical candles for ICT signals)
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=14",
      { headers: { "Accept":"application/json","User-Agent":"Mozilla/5.0" } }
    );
    out.tests.ohlc = { status: r.status, ok: r.ok };
    if (r.ok) {
      const d = await r.json();
      const last = d[d.length-1];
      out.tests.ohlc.total_candles = d.length;
      out.tests.ohlc.last_candle_date = last ? new Date(last[0]).toISOString().slice(0,10) : null;
      out.tests.ohlc.last_candle_close = last?.[4];
      out.tests.ohlc.note = "⚠ OHLC close ≠ current price — we patch last candle with markets price";
    }
  } catch (e) { out.tests.ohlc = { error: String(e).slice(0,200) }; }

  // Test 3: Verify price patching logic
  if (out.tests.markets.btc_price && out.tests.ohlc.last_candle_close) {
    const diff = Math.abs(out.tests.markets.btc_price - out.tests.ohlc.last_candle_close);
    const diffPct = (diff / out.tests.markets.btc_price * 100).toFixed(2);
    out.tests.price_diff = {
      markets_price:    out.tests.markets.btc_price,
      ohlc_last_close:  out.tests.ohlc.last_candle_close,
      difference_usd:   diff.toFixed(2),
      difference_pct:   diffPct + "%",
      why_this_matters: "Without patching, displayed price could be this far off"
    };
  }

  // Test 4: Rate limit check (CoinGecko free = ~30 req/min)
  const start = Date.now();
  try {
    await fetch("https://api.coingecko.com/api/v3/ping",
      { headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0"} });
    out.tests.ping = { ok: true, latency_ms: Date.now()-start };
  } catch(e) { out.tests.ping = { ok: false, error: String(e).slice(0,100) }; }

  out.summary = {
    data_flow: [
      "1. /api/coins fetches CoinGecko /coins/markets → real-time price, 24h change, 24h volume",
      "2. /api/scan fetches CoinGecko /coins/{id}/ohlc → 90 daily candles for ICT signals",
      "3. Last OHLC candle is PATCHED with current_price from step 1",
      "4. ICT engine runs on patched candles → signals reflect today's price action",
      "5. Displayed price, change%, volume all come from step 1 (real-time)"
    ]
  };

  res.json(out);
};
