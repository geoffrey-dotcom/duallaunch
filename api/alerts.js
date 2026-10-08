const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG = "https://api.telegram.org/bot" + TOKEN;
const SITE = process.env.SITE_URL || "https://duallaunch.xyz";
const MIN_MCAP = Number(process.env.TG_MIN_MCAP || 15000);
const PONS_CHAT = process.env.TG_PONS_CHAT || "";
const PUMP_CHAT = process.env.TG_PUMP_CHAT || "";
const GROUP = process.env.TG_GROUP_CHAT || "";
const PONS_THREAD = process.env.TG_PONS_THREAD || "";
const PUMP_THREAD = process.env.TG_PUMP_THREAD || "";

const seen = globalThis.__dlSeen || (globalThis.__dlSeen = new Set());

async function tg(method, body) {
  const r = await fetch(TG + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
}

function fmtUsd(n) {
  const v = Number(n || 0);
  if (!v) return "—";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + Math.round(v);
}

function fmtChange(v) {
  const n = Number(v || 0);
  const arrow = n > 0 ? "🟢" : n < 0 ? "🔴" : "⚪";
  return (n > 0 ? "+" : "") + n.toFixed(1) + "% " + arrow;
}

function curveBar(pct) {
  const filled = Math.round(Math.min(100, Math.max(0, pct)) / 12.5);
  return "🟩".repeat(filled) + "⬜".repeat(8 - filled) + " " + pct.toFixed(0) + "%";
}

function photosOf(c) {
  const out = [];
  if (c.logo && /^https?:\/\//i.test(c.logo)) out.push(c.logo);
  out.push(SITE + "/logo.jpg");
  return out;
}

function tokenUrl(c) {
  return SITE + "/token/" + encodeURIComponent(c.id || "");
}

function payload(c) {
  const pct = Math.min(100, ((Number(c.raised || 0) / (c.goal || 1)) * 100));
  const chain = c.chain === "rh" ? "PONS · Robinhood Chain" : "pump.fun · Solana";
  const scan = c.chain === "rh"
    ? "https://robinhoodchain.blockscout.com/token/" + (c.address || "")
    : "https://solscan.io/token/" + (c.address || "");
  const ageMin = c.created ? Math.max(0, Math.round((Date.now() - Number(c.created)) / 60000)) : null;
  const ch5 = c.change5m != null ? fmtChange(c.change5m) : null;
  const ch1 = c.change1h != null ? fmtChange(c.change1h) : null;
  const caption =
    "🚀 <b>NEW " + escapeHtml(chain.split(" · ")[0].toUpperCase()) + " RUNNER</b> ⚡\n\n" +
    "<b>$" + escapeHtml(c.symbol || "?") + "</b> — " + escapeHtml(c.name || "") + "\n" +
    "<i>" + escapeHtml(chain) + "</i>\n\n" +
    "💰 <b>Market Cap:</b> <code>" + fmtUsd(c.mcap) + "</code>\n" +
    "📈 <b>Curve:</b> " + curveBar(pct) + "\n" +
    (ch5 || ch1 ? "📊 <b>Changes:</b> " + (ch5 ? "5m: " + ch5 : "") + (ch5 && ch1 ? " | " : "") + (ch1 ? "1h: " + ch1 : "") + "\n" : "") +
    "📊 <b>Volume:</b> " + escapeHtml(c.vol || "—") + "\n" +
    (ageMin != null ? "⏱ <b>Age:</b> " + ageMin + "m\n" : "") +
    "\n📋 <b>Contract</b> <i>(tap to copy)</i>:\n<code>" + escapeHtml(c.address || "") + "</code>\n\n" +
    "<i>Not financial advice. DualLaunch does not mint tokens.</i>";
  return {
    caption,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⚡ Trade on DualLaunch", url: tokenUrl(c) }
        ],
        [
          { text: "📊 Chart & Safety Audit", url: tokenUrl(c) },
          { text: "🔍 Scan", url: scan }
        ]
      ]
    }
  };
}

async function getFeed(src) {
  try {
    const r = await fetch(SITE + "/api/public/feed?src=" + src);
    if (r.ok) return await r.json();
  } catch (e) {}
  try {
    const r2 = await fetch("https://duallaunch-fix-buddy.lovable.app/api/public/feed?src=" + src);
    if (r2.ok) return await r2.json();
  } catch (e) {}
  return { ok: false, coins: [] };
}

module.exports = async function handler(req, res) {
  if (!TOKEN) {
    res.status(200).json({ ok: false, error: "missing TELEGRAM_BOT_TOKEN" });
    return;
  }
  try {
    const [ponsData, pumpData] = await Promise.all([
      getFeed("pons"),
      getFeed("pump")
    ]);
    const pons = (ponsData.coins || []).filter((c) => c.chain === "rh" && Number(c.mcap || 0) >= MIN_MCAP);
    const pump = (pumpData.coins || []).filter((c) => c.chain === "sol" && Number(c.mcap || 0) >= MIN_MCAP);
    const force = String((req.query && req.query.force) || "") === "1";
    if (force) seen.clear();
    const freshAge = Date.now() - 45 * 60 * 1000;
    let posted = 0;
    async function push(list, chat, thread) {
      if (!chat) return;
      for (const c of list) {
        if (!c.id || seen.has(c.id)) continue;
        if ((c.created || 0) < freshAge) continue;
        seen.add(c.id);
        const extra = payload(c);
        if (thread) extra.message_thread_id = Number(thread);
        extra.chat_id = chat;
        let sent = false;
        for (const pic of photosOf(c)) {
          const r = await tg("sendPhoto", Object.assign({ photo: pic }, extra));
          if (r && r.ok) { sent = true; break; }
        }
        if (!sent) {
          extra.text = extra.caption;
          await tg("sendMessage", extra);
        }
        posted++;
      }
    }
    if (GROUP && PONS_THREAD) await push(pons, GROUP, PONS_THREAD);
    else await push(pons, PONS_CHAT);
    if (GROUP && PUMP_THREAD) await push(pump, GROUP, PUMP_THREAD);
    else await push(pump, PUMP_CHAT);
    res.status(200).json({ ok: true, posted, seen: seen.size });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
