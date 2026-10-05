module.exports = async (req, res) => {
  const q = req.url.split("?")[1] || "";
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  try {
    const r = await fetch("https://duallaunch-fix-buddy.lovable.app/api/public/trades?" + q);
    res.status(200).send(await r.text());
  } catch (e) {
    res.status(200).send('{"ok":false,"candles":[],"trades":[]}');
  }
};
