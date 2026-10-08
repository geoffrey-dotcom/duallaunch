// DualLaunch Telegram alerts: New launch, Runner, Almost graduating and Graduated.
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG = "https://api.telegram.org/bot" + TOKEN;
const SITE = process.env.SITE_URL || "https://duallaunch.xyz";
const MIN_MCAP = Number(process.env.TG_MIN_MCAP || 15000);
const MIN_NEW_MCAP = Number(process.env.TG_MIN_NEW_MCAP || 6000);
const MAX_PER_RUN = Number(process.env.TG_MAX_PER_RUN || 8);
const PONS_CHAT = process.env.TG_PONS_CHAT || "";
const PUMP_CHAT = process.env.TG_PUMP_CHAT || "";
const GROUP = process.env.TG_GROUP_CHAT || "";
const PONS_THREAD = process.env.TG_PONS_THREAD || "";
const PUMP_THREAD = process.env.TG_PUMP_THREAD || "";

const seen = globalThis.__dlSeen2 || (globalThis.__dlSeen2 = new Set());

async function tg(method, body) {
  const r = await fetch(TG + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
function usd(n) {
  const v = Number(n || 0);
  if (!v) return "—";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + Math.round(v);
}
function change(v) {
  const n = Number(v || 0);
  return (n > 0 ? "+" : "") + n.toFixed(1) + "% " + (n > 0 ? "🟢" : n < 0 ? "🔴" : "⚪");
}
function bar(pct) {
  const p = Math.min(100, Math.max(0, Number(pct || 0)));
  const f = Math.round(p / 12.5);
  return "🟩".repeat(f) + "⬜".repeat(8 - f) + " " + p.toFixed(0) + "%";
}
const ageMin = (c) => (c.created ? Math.max(0, Math.round((Date.now() - Number(c.created)) / 60000)) : null);
const fmtAge = (m) => (m == null ? "—" : m < 60 ? m + "m" : m < 1440 ? Math.floor(m / 60) + "h" : Math.floor(m / 1440) + "d");
const curve = (c) => (c.curvePct != null ? Number(c.curvePct) : Math.min(100, (Number(c.raised || 0) / (c.goal || 1)) * 100));

// Decide which alert (if any) a coin deserves. Order = priority.
function kindOf(c) {
  const age = ageMin(c);
  const recent = c.lastTrade ? Date.now() - Number(c.lastTrade) < 30 * 60000 : true;
  if (c.graduated && recent && age != null && age < 24 * 60) return "graduated";
  if (!c.graduated && curve(c) >= 80 && recent) return "graduating";
  if (Number(c.mcap || 0) >= MIN_MCAP && Number(c.change1h || 0) >= 50 && recent) return "runner";
  if (age != null && age <= 15 && Number(c.mcap || 0) >= MIN_NEW_MCAP) return "new";
  return null;
}
const TITLES = {
  new: "🆕 <b>NEW LAUNCH</b>",
  runner: "🚀 <b>RUNNER</b>",
  graduating: "🔥 <b>ALMOST GRADUATING</b>",
  graduated: "🎓 <b>GRADUATED</b>",
};

function payload(c, kind) {
  const chain = c.chain === "rh" ? "PONS · Robinhood Chain" : "pump.fun · Solana";
  const scan = c.chain === "rh" ? "https://robinhoodchain.blockscout.com/token/" + (c.address || "") : "https://solscan.io/token/" + (c.address || "");
  const url = SITE + "/token/" + encodeURIComponent(c.id || "");
  const lines = [
    TITLES[kind] + " · <i>" + esc(chain) + "</i>",
    "",
    "<b>$" + esc(c.symbol || "?") + "</b> — " + esc(c.name || ""),
    "",
    "💰 <b>Market Cap:</b> <code>" + usd(c.mcap) + "</code>",
    c.graduated ? "📈 <b>Curve:</b> completed ✅" : "📈 <b>Curve:</b> " + bar(curve(c)),
    "📊 <b>Changes:</b> 5m: " + change(c.change5m) + " | 1h: " + change(c.change1h),
    "💵 <b>Volume:</b> " + esc(c.vol || usd(c.volume)),
    "⏱ <b>Age:</b> " + fmtAge(ageMin(c)),
    "",
    "📋 <b>Contract</b> <i>(tap to copy)</i>:",
    "<code>" + esc(c.address || "") + "</code>",
    "",
    "<i>Check the Safety Audit before you trade. Not financial advice.</i>",
  ];
  const row2 = [{ text: "🛡 Safety Audit", url }, { text: "🔍 Explorer", url: scan }];
  if (c.twitter && /^https?:\/\//.test(c.twitter)) row2.push({ text: "🐦 X", url: c.twitter });
  return {
    caption: lines.join("\n"),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "⚡ Trade on DualLaunch", url }], row2] },
  };
}

async function getFeed(src) {
  for (const base of [SITE, "https://duallaunch-fix-buddy.lovable.app"]) {
    try {
      const r = await fetch(base + "/api/public/feed?src=" + src);
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  return { coins: [] };
}

module.exports = async function handler(req, res) {
  if (!TOKEN) return res.status(200).json({ ok: false, error: "missing TELEGRAM_BOT_TOKEN" });
  try {
    const [ponsData, pumpData] = await Promise.all([getFeed("pons"), getFeed("pump")]);
    if (String((req.query && req.query.force) || "") === "1") seen.clear();
    let posted = 0;
    const counts = { new: 0, runner: 0, graduating: 0, graduated: 0 };
    async function push(list, chat, thread) {
      if (!chat) return;
      for (const c of list) {
        if (posted >= MAX_PER_RUN) return;
        const kind = kindOf(c);
        if (!kind || !c.id) continue;
        const key = kind + ":" + c.id;
        if (seen.has(key)) continue;
        seen.add(key);
        const msg = payload(c, kind);
        msg.chat_id = chat;
        if (thread) msg.message_thread_id = Number(thread);
        let sent = false;
        if (c.logo && /^https?:\/\//i.test(c.logo)) {
          const r = await tg("sendPhoto", Object.assign({ photo: c.logo }, msg));
          sent = !!(r && r.ok);
        }
        if (!sent) {
          const m = Object.assign({}, msg, { text: msg.caption, disable_web_page_preview: true });
          delete m.caption;
          await tg("sendMessage", m);
        }
        posted++;
        counts[kind]++;
      }
    }
    const pons = (ponsData.coins || []).filter((c) => c.chain === "rh");
    const pump = (pumpData.coins || []).filter((c) => c.chain === "sol");
    if (GROUP && PONS_THREAD) await push(pons, GROUP, PONS_THREAD); else await push(pons, PONS_CHAT);
    if (GROUP && PUMP_THREAD) await push(pump, GROUP, PUMP_THREAD); else await push(pump, PUMP_CHAT);
    res.status(200).json({ ok: true, posted, counts, seen: seen.size });
  } catch (e) {
    res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
};
