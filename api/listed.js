const REPO = process.env.GITHUB_REPO || "geoffrey-dotcom/duallaunch";
const TOKEN = process.env.GITHUB_TOKEN || "";
const RAW = "https://raw.githubusercontent.com/" + REPO + "/main/listed.json";

async function readList() {
  const r = await fetch(RAW + "?t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

async function githubFile() {
  const r = await fetch("https://api.github.com/repos/" + REPO + "/contents/listed.json", {
    headers: { authorization: "Bearer " + TOKEN, accept: "application/vnd.github+json", "user-agent": "duallaunch" }
  });
  if (!r.ok) return null;
  return r.json();
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method === "GET") {
    res.status(200).json({ ok: true, coins: await readList() });
    return;
  }
  if (req.method !== "POST") {
    res.status(200).json({ ok: false, error: "method" });
    return;
  }
  if (!TOKEN) {
    res.status(200).json({ ok: false, error: "Set GITHUB_TOKEN on Vercel to save public listings." });
    return;
  }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const c = body && body.coin ? body.coin : body;
  const addr = String((c && c.address) || "").trim();
  if (addr.length < 20) {
    res.status(200).json({ ok: false, error: "Need a contract address." });
    return;
  }
  const file = await githubFile();
  let list = [];
  if (file && file.content) {
    try { list = JSON.parse(Buffer.from(file.content, "base64").toString("utf8")); } catch (e) { list = []; }
  }
  if (!Array.isArray(list)) list = [];
  const id = String(c.id || ((c.chain === "rh" ? "rh-" : "sol-") + addr.toLowerCase()));
  const next = {
    id,
    name: String(c.name || "Token").slice(0, 64),
    symbol: String(c.symbol || "?").slice(0, 16),
    chain: c.chain === "rh" ? "rh" : "sol",
    address: addr,
    logo: String(c.logo || "").slice(0, 300),
    twitter: String(c.twitter || "").slice(0, 200),
    telegram: String(c.telegram || "").slice(0, 200),
    website: String(c.website || "").slice(0, 200),
    desc: String(c.desc || "").slice(0, 400),
    listed: true,
    created: Date.now(),
    mcap: Number(c.mcap || 0),
    vol: c.vol || "—",
    raised: 0,
    goal: c.chain === "rh" ? 4.2 : 85,
    link: c.link || "",
    chart: c.chart || ""
  };
  list = [next].concat(list.filter((x) => x.id !== id)).slice(0, 200);
  const put = await fetch("https://api.github.com/repos/" + REPO + "/contents/listed.json", {
    method: "PUT",
    headers: { authorization: "Bearer " + TOKEN, accept: "application/vnd.github+json", "user-agent": "duallaunch", "content-type": "application/json" },
    body: JSON.stringify({
      message: "list " + next.symbol,
      content: Buffer.from(JSON.stringify(list, null, 2)).toString("base64"),
      sha: file && file.sha
    })
  });
  const out = await put.json();
  res.status(200).json({ ok: !!out.content, coin: next, error: out.message || null });
};
