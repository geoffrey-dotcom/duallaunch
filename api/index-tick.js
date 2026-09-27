const REPO = process.env.GITHUB_REPO || "geoffrey-dotcom/duallaunch";
const TOKEN = process.env.GITHUB_TOKEN || "";

async function readSnapshots() {
  if (!TOKEN) return { data: {}, sha: null };
  const r = await fetch("https://api.github.com/repos/" + REPO + "/contents/snapshots.json", {
    headers: { authorization: "Bearer " + TOKEN, accept: "application/vnd.github+json", "user-agent": "duallaunch" }
  });
  if (!r.ok) return { data: {}, sha: null };
  const file = await r.json();
  let data = {};
  try { data = JSON.parse(Buffer.from(file.content, "base64").toString("utf8")) || {}; } catch (e) { data = {}; }
  return { data, sha: file.sha };
}

async function writeSnapshots(data, sha) {
  const body = JSON.stringify({
    message: "index tick",
    content: Buffer.from(JSON.stringify(data)).toString("base64"),
    sha
  });
  const r = await fetch("https://api.github.com/repos/" + REPO + "/contents/snapshots.json", {
    method: "PUT",
    headers: { authorization: "Bearer " + TOKEN, accept: "application/vnd.github+json", "user-agent": "duallaunch", "content-type": "application/json" },
    body
  });
  return r.ok;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!TOKEN) return res.status(200).json({ ok: false, error: "GITHUB_TOKEN missing" });
  try {
    const origin = "https://www.duallaunch.xyz";
    const feedR = await fetch(origin + "/api/feed", { cache: "no-store" });
    const feedJ = await feedR.json();
    const coins = (feedJ.coins || feedJ.items || []).slice(0, 40);
    const now = Date.now();
    const { data, sha } = await readSnapshots();
    coins.forEach(function (c) {
      const id = c.id || ((c.chain || "sol") + "-" + String(c.address || "").toLowerCase());
      const px = Number(c.mcap || 0);
      if (!id || !px) return;
      if (!Array.isArray(data[id])) data[id] = [];
      const last = data[id][data[id].length - 1];
      if (last && now - last[0] < 50000) return;
      data[id].push([now, px]);
      if (data[id].length > 360) data[id] = data[id].slice(-360);
    });
    const ok = await writeSnapshots(data, sha);
    return res.status(200).json({ ok, n: coins.length, keys: Object.keys(data).length });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
