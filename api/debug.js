module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const out = {};

  try {
    // Test 1: CoinGecko coins/markets
    const r1 = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1",
      { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" } }
    );
    out.markets_status = r1.status;
    out.markets_ok = r1.ok;
    if (r1.ok) {
      const d = await r1.json();
      out.markets_count = d.length;
      out.top1 = d[0] ? { id: d[0].id, symbol: d[0].symbol, price: d[0].current_price } : null;
    } else {
      out.markets_error = await r1.text().then(t=>t.slice(0,200));
    }

    // Test 2: OHLCV for BTC
    const r2 = await fetch(
      "https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=14",
      { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" } }
    );
    out.ohlc_status = r2.status;
    out.ohlc_ok = r2.ok;
    if (r2.ok) {
      const d = await r2.json();
      out.ohlc_rows = d.length;
      out.ohlc_last = d[d.length-1]
        ? { date: new Date(d[d.length-1][0]).toISOString().slice(0,10), close: d[d.length-1][4] }
        : null;
    } else {
      out.ohlc_error = await r2.text().then(t=>t.slice(0,200));
    }

  } catch (e) {
    out.error = String(e).slice(0, 300);
  }

  res.json(out);
};
