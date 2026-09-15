const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG = "https://api.telegram.org/bot" + TOKEN;
const SITE = process.env.SITE_URL || "https://duallaunch.xyz";
const MIN_MCAP = Number(process.env.TG_MIN_MCAP || 15000);
const PONS_CHAT = process.env.TG_PONS_CHAT || "";
const PUMP_CHAT = process.env.TG_PUMP_CHAT || "";

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

function card(c) {
  const pct = Math.min(100, ((Number(c.raised || 0) / (c.goal || 1)) * 100));
  const chain = c.chain === "rh" ? "PONS" : "pump.fun";
  const pad = c.link || SITE;
  const mc = c.mcap ? "$" + Math.round(c.mcap).toLocaleString("en-US") : "—";
  return {
    text:
      "<b>" + escapeHtml(c.symbol || "?") + "</b> · " + chain + "\n" +
      escapeHtml(c.name || "") + "\n" +
      "MC " + mc + " · " + pct.toFixed(0) + "% curve\n" +
      "<code>" + escapeHtml(c.address || "") + "</code>",
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[
        { text: "DualLaunch", url: SITE },
        { text: chain, url: pad }
      ]]
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
    async function push(list, chat) {
      if (!chat) return;
      for (const c of list) {
        if (!c.id || seen.has(c.id)) continue;
        if ((c.created || 0) < freshAge) continue;
        seen.add(c.id);
        await tg("sendMessage", Object.assign({ chat_id: chat }, card(c)));
        posted++;
      }
    }
    await push(pons, PONS_CHAT);
    await push(pump, PUMP_CHAT);
    res.status(200).json({ ok: true, posted, seen: seen.size });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
