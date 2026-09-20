const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG = "https://api.telegram.org/bot" + TOKEN;
const SITE = process.env.SITE_URL || "https://www.duallaunch.xyz";
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

function photosOf(c) {
  const a = c.address || "";
  const out = [];
  if (c.logo && /^https?:\/\//i.test(c.logo)) out.push(c.logo);
  if (a && c.chain === "sol") {
    out.push("https://dd.dexscreener.com/ds-data/tokens/solana/" + a + "/header.png");
    out.push("https://dd.dexscreener.com/ds-data/tokens/solana/" + a + ".png");
  }
  return out;
}

function payload(c) {
  const pct = Math.min(100, ((Number(c.raised || 0) / (c.goal || 1)) * 100));
  const chain = c.chain === "rh" ? "PONS" : "pump.fun";
  const pad = c.link || SITE;
  const dex = c.chain === "rh"
    ? "https://www.geckoterminal.com/robinhood/tokens/" + (c.address || "")
    : "https://dexscreener.com/solana/" + (c.address || "");
  const scan = c.chain === "rh"
    ? "https://robinhoodchain.blockscout.com/token/" + (c.address || "")
    : "https://solscan.io/token/" + (c.address || "");
  const ageMin = c.created ? Math.max(0, Math.round((Date.now() - Number(c.created)) / 60000)) : null;
  const caption =
    "🚀 <b>" + escapeHtml(c.symbol || "?") + "</b>  ·  " + chain + "\n" +
    escapeHtml(c.name || "") + "\n\n" +
    "💰 MC: <b>" + fmtUsd(c.mcap) + "</b>\n" +
    "📈 Curve: <b>" + pct.toFixed(0) + "%</b>\n" +
    "📊 Vol: " + escapeHtml(c.vol || "—") + "\n" +
    (ageMin != null ? "⏱ Age: " + ageMin + "m\n" : "") +
    "🔗 CA\n<code>" + escapeHtml(c.address || "") + "</code>\n\n" +
    "<i>Not financial advice. DualLaunch does not mint tokens.</i>";
  return {
    caption,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "DualLaunch", url: SITE },
          { text: chain, url: pad }
        ],
        [
          { text: "Chart", url: dex },
          { text: "Scan", url: scan }
        ]
      ]
    }
  };
}

module.exports = async function handler(req, res) {
  if (!TOKEN) {
    res.status(200).json({ ok: false, error: "missing TELEGRAM_BOT_TOKEN" });
    return;
  }
  try {
    const [ponsRes, pumpRes] = await Promise.all([
      fetch(SITE + "/api/feed?src=pons"),
      fetch(SITE + "/api/feed?src=pump")
    ]);
    const pons = ((await ponsRes.json()).coins || []).filter((c) => c.chain === "rh" && Number(c.mcap || 0) >= MIN_MCAP);
    const pump = ((await pumpRes.json()).coins || []).filter((c) => c.chain === "sol" && Number(c.mcap || 0) >= MIN_MCAP);
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
