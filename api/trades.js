const UPSTREAM = "https://duallaunch-fix-buddy.lovable.app/api/public/trades";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=15");

  const q = req.query || {};
  const addr = q.addr || q.token || "";
  const chain = q.chain === "rh" ? "rh" : "sol";

  if (!addr || addr.length > 70) {
    return res.status(200).json({ ok: false, trades: [] });
