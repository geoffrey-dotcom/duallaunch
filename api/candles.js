const REPO = process.env.GITHUB_REPO || "geoffrey-dotcom/duallaunch";
const TOKEN = process.env.GITHUB_TOKEN || "";

function bucketsFromSeries(points) {
  if (!points || points.length < 2) return [];
  const step = 5 * 60 * 1000;
  const map = {};
  points.forEach(function (p) {
    const t = Math.floor(Number(p[0]) / step) * step;
    const v = Number(p[1]);
    if (!v) return;
    if (!map[t]) map[t] = { t, o: v, h: v, l: v, c: v };
    else {
      map[t].h = Math.max(map[t].h, v);
      map[t].l = Math.min(map[t].l, v);
      map[t].c = v;
    }
  });
  return Object.keys(map).sort().map(function (k) { return map[k]; });
}

async function geckoCandles(net, token) {
  const poolsR = await fetch(
    "https://api.geckoterminal.com/api/v2/networks/" + net + "/tokens/" + encodeURIComponent(token) + "/pools",
    { headers: { accept: "application/json" } }
  );
  const poolsJ = await poolsR.json();
  const pool = ((poolsJ.data || [])[0] || {}).id || "";
  const poolAddr = pool.includes("_") ? pool.split("_").slice(1).join("_") : pool;
  if (!poolAddr) return [];
  const urls = ["/ohlcv/minute?aggregate=5&limit=100", "/ohlcv/hour?aggregate=1&limit=80"];
  for (let i = 0; i < urls.length; i++) {
    const ohlR = await fetch(
      "https://api.geckoterminal.com/api/v2/networks/" + net + "/pools/" + encodeURIComponent(poolAddr) + urls[i],
      { headers: { accept: "application/json" } }
    );
    const ohlJ = await ohlR.json();
    const raw = (((ohlJ.data || {}).attributes || {}).ohlcv_list) || [];
    const candles = raw.map(function (row) {
      return {
        t: Number(row[0]) > 1e12 ? Number(row[0]) : Number(row[0]) * 1000,
        o: Number(row[1]),
        h: Number(row[2]),
        l: Number(row[3]),
        c: Number(row[4])
      };
    }).filter(function (c) { return c.h > 0 && c.c > 0; });
    if (candles.length > 2) return candles.sort(function (a, b) { return a.t - b.t; });
  }
  return [];
}

async function ownSeries(id, token) {
  try {
    const url = TOKEN
      ? "https://api.github.com/repos/" + REPO + "/contents/snapshots.json"
      : "https://raw.githubusercontent.com/" + REPO + "/main/snapshots.json";
    const headers = TOKEN
      ? { authorization: "Bearer " + TOKEN, accept: "application/vnd.github+json", "user-agent": "duallaunch" }
      : { "user-agent": "duallaunch" };
    const r = await fetch(url, { headers });
    if (!r.ok) return [];
    const j = await r.json();
    const data = TOKEN && j.content ? JSON.parse(Buffer.from(j.content, "base64").toString("utf8")) : j;
    const key = Object.keys(data || {}).find(function (k) {
      return k === id || String(k).toLowerCase().indexOf(String(token).toLowerCase()) >= 0;
    });
    return key ? data[key] : [];
  } catch (e) { return []; }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=45");
  const q = req.query || {};
  const token = String(q.token || q.address || "").trim();
  const chain = String(q.chain || "sol").toLowerCase();
  const id = String(q.id || "");
  if (!token) return res.status(400).json({ ok: false, candles: [] });
  const net = chain === "rh" || chain === "robinhood" ? "robinhood" : "solana";
  try {
    const own = bucketsFromSeries(await ownSeries(id, token));
    let gecko = [];
    try { gecko = await geckoCandles(net, token); } catch (e) { gecko = []; }
    const candles = own.length >= 3 ? own : gecko;
    return res.status(200).json({ ok: true, source: own.length >= 3 ? "duallaunch" : (gecko.length ? "gecko" : "none"), candles });
  } catch (e) {
    return res.status(200).json({ ok: false, candles: [] });
  }
};
