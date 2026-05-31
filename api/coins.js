// Lightweight info endpoint — returns category list + total count
// Real-time prices are now fetched DIRECTLY in scan.js (not here)
// This file exists so /api/debug and the frontend can get metadata
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    info: "Prices fetched per-batch in /api/scan (CoinGecko /coins/markets, real-time)",
    total: 1000,
    pages: 10,
    batchSize: 8,
    source: "CoinGecko free API — no key needed",
    categories: [
      "Mega Cap","Large Cap","Mid Cap","Small Cap",
      "Layer 1","Layer 2","DeFi","AI","Meme","Gaming","RWA","CEX Token"
    ],
  });
};
