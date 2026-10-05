const UPSTREAM = "https://duallaunch-fix-buddy.lovable.app/api/public/candles";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=8, stale-while-revalidate=20");

  const q = req.query || {};
  const id = q.id || "";
  const chain = q.chain || "";
  const addr = q.token || q.addr || "";
  let tokenId = id.includes("-") ? id : chain && addr ? `${chain}-${addr}` : "";
  if (tokenId.startsWith("rh-")) to
