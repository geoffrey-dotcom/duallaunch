module.exports = async (req, res) => {
  const q = req.url.split("?")[1] || "";
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "s-maxage=8, stale-while-revalidate=20");
  try {
    const r = await fetch("https://duallaunch-fix-buddy.lovable.app/api/public/feed?" + q);
    res.status(200).send(await r.text());
  } catch (e) {
    res.status(200).send('{"ok":false,"coins":[]}');
  }
};
