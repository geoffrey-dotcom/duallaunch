// DualLaunch index v1: candles from public pool trades.
// Deploy as Vercel serverless: /api/candles?chain=sol&address=MINT
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
  const address = String((req.query && req.query.address) || "");
  const chain = String((req.query && req.query.chain) || "sol");
  if (!address) return res.status(200).json({ ok: false, error: "address required", candles: [] });
  try {
    const url = chain === "rh"
      ? "https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/" + address + "/pools"
      : "https://api.dexscreener.com/latest/dex/tokens/" + address;
    const r = await fetch(url, { headers: { accept: "application/json" } });
    const data = await r.json();
    const pair = chain === "rh"
      ? (((data.data || [])[0] || {}).attributes || {})
      : ((data.pairs || [])[0] || {});
    res.status(200).json({
      ok: true,
      chain,
      address,
      priceUsd: pair.priceUsd || pair.base_token_price_usd || null,
      mcap: pair.marketCap || pair.fdv || pair.market_cap_usd || null,
      change24: (pair.priceChange && pair.priceChange.h24) || pair.price_change_percentage || null,
      note: "v1 reads pool snapshot. Full candles need a worker that stores each swap."
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e), candles: [] });
  }
};
