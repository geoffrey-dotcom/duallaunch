module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
  if (req.method === "OPTIONS") return res.status(200).end();
  const q = req.query || {};
  const token = String(q.token || q.address || "").trim();
  const chain = String(q.chain || "sol").toLowerCase();
  if (!token) return res.status(400).json({ ok: false, error: "token required" });
  const net = chain === "rh" || chain === "robinhood" ? "robinhood" : "solana";
  try {
    const poolsR = await fetch(
      "https://api.geckoterminal.com/api/v2/networks/" + net + "/tokens/" + encodeURIComponent(token) + "/pools",
      { headers: { accept: "application/json" } }
    );
    const poolsJ = await poolsR.json();
    const pool = ((poolsJ.data || [])[0] || {}).id || "";
    const poolAddr = pool.includes("_") ? pool.split("_").slice(1).join("_") : pool;
    if (!poolAddr) return res.status(200).json({ ok: true, candles: [], note: "no pool" });
    const ohlR = await fetch(
      "https://api.geckoterminal.com/api/v2/networks/" + net + "/pools/" + encodeURIComponent(poolAddr) + "/ohlcv/minute?aggregate=5&limit=80",
      { headers: { accept: "application/json" } }
    );
    const ohlJ = await ohlR.json();
    const raw = (((ohlJ.data || {}).attributes || {}).ohlcv_list) || [];
    const candles = raw.map(function (row) {
      return {
        t: Number(row[0]) * 1000,
        o: Number(row[1]),
        h: Number(row[2]),
        l: Number(row[3]),
        c: Number(row[4]),
        v: Number(row[5] || 0)
      };
    }).filter(function (c) { return c.h > 0; });
    return res.status(200).json({ ok: true, network: net, pool: poolAddr, candles: candles });
  } catch (e) {
    return res.status(200).json({ ok: false, candles: [], error: String(e.message || e) });
  }
};
