const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG = "https://api.telegram.org/bot" + TOKEN;
const SITE = process.env.SITE_URL || "https://duallaunch.xyz";
const MIN_MCAP = Number(process.env.TG_MIN_MCAP || 15000);

async function tg(method, body) {
  const r = await fetch(TG + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}

function card(c) {
  const pct = Math.min(100, ((Number(c.raised || 0) / (c.goal || 1)) * 100));
  const chain = c.chain === "rh" ? "PONS" : "pump.fun";
  const pad = c.link || SITE;
  const mc = c.mcap ? "$" + Math.round(c.mcap).toLocaleString("en-US") : "—";
  const text =
    "<b>" + escapeHtml(c.symbol || "?") + "</b> · " + chain + "\n" +
    escapeHtml(c.name || "") + "\n" +
    "MC " + mc + " · " + pct.toFixed(0) + "% curve\n" +
    "<code>" + escapeHtml(c.address || "") + "</code>";
  return {
    text,
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

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
}

async function feed(src) {
  const r = await fetch(SITE + "/api/feed?src=" + (src || "all"));
  const j = await r.json();
  return (j.coins || []).filter((c) => Number(c.mcap || 0) >= MIN_MCAP);
}

function readBody(req) {
  let raw = req.body;
  if (raw == null) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }
  return raw;
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const q = req.query || {};
    if (q.ping && TOKEN && process.env.TG_PONS_CHAT) {
      const sent = await tg("sendMessage", {
        chat_id: process.env.TG_PONS_CHAT,
        text: "DualLaunch bot test — if you see this, PONS chat ID is correct."
      });
      res.status(200).json({ ok: true, version: "v3", hasToken: true, ping: sent });
      return;
    }
    res.status(200).json({ ok: true, version: "v4", bot: "DualLaunch", hasToken: !!TOKEN, last: globalThis.__dlLast || null });
    return;
  }
  if (!TOKEN) {
    res.status(200).json({ ok: false, error: "missing TELEGRAM_BOT_TOKEN" });
    return;
  }
  const update = readBody(req);
  globalThis.__dlLast = { at: Date.now(), keys: Object.keys(update || {}), text: (update.message || {}).text || (update.channel_post || {}).text || null };
  const msg = update.message || update.edited_message || update.channel_post;
  if (!msg || !msg.text) {
    res.status(200).json({ ok: true });
    return;
  }
  const chat = msg.chat.id;
  const text = String(msg.text || "").replace(/@\w+/g, "").trim();
  const low = text.toLowerCase();

  function tgLink(raw) {
    const s = String(raw || "").trim();
    if (/^https:\/\/t\.me\/[A-Za-z0-9_]+/i.test(s)) return s;
    return "";
  }

  try {
    if (low.startsWith("/start") || low.startsWith("/help") || low.startsWith("/rooms")) {
      const sent = await tg("sendMessage", {
        chat_id: chat,
        text:
          "DualLaunch is on.\n\n" +
          "/rooms — PONS / pump.fun / chat links\n" +
          "/new /pons /pump — coins above $" + MIN_MCAP.toLocaleString("en-US") + " MC\n" +
          SITE + "\n\nNot financial advice. We don't mint tokens."
      });
      const rows = [];
      const pons = tgLink(process.env.TG_PONS_LINK);
      const pump = tgLink(process.env.TG_PUMP_LINK);
      const chatL = tgLink(process.env.TG_CHAT_LINK);
      if (pons) rows.push([{ text: "PONS channel", url: pons }]);
      if (pump) rows.push([{ text: "pump.fun channel", url: pump }]);
      if (chatL) rows.push([{ text: "Community chat", url: chatL }]);
      rows.push([{ text: "Open DualLaunch", url: "https://www.duallaunch.xyz" }]);
      if (sent && sent.ok) {
        await tg("sendMessage", {
          chat_id: chat,
          text: "Rooms:",
          reply_markup: { inline_keyboard: rows }
        });
      } else {
        await tg("sendMessage", { chat_id: chat, text: "Bot got /start but Telegram rejected the first reply." });
      }
    } else if (low.startsWith("/pons") || low.startsWith("/pump") || low.startsWith("/new")) {
      const src = low.startsWith("/pons") ? "pons" : low.startsWith("/pump") ? "pump" : "all";
      const coins = await feed(src);
      coins.sort((a, b) => (b.created || 0) - (a.created || 0));
      const slice = coins.slice(0, 5);
      if (!slice.length) {
        await tg("sendMessage", { chat_id: chat, text: "No coins above the MC filter right now." });
      } else {
        for (const c of slice) {
          if (src === "pons" && c.chain !== "rh") continue;
          if (src === "pump" && c.chain !== "sol") continue;
          await tg("sendMessage", Object.assign({ chat_id: chat }, card(c)));
        }
      }
    }
  } catch (e) {
    await tg("sendMessage", { chat_id: chat, text: "Bot error. Try again." }).catch(() => {});
  }
  res.status(200).json({ ok: true });
};
