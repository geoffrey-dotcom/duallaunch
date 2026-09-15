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

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, bot: "DualLaunch" });
    return;
  }
  if (!TOKEN) {
    res.status(200).json({ ok: false, error: "missing TELEGRAM_BOT_TOKEN" });
    return;
  }
  const update = req.body || {};
  const msg = update.message || update.channel_post;
  if (!msg || !msg.text) {
    res.status(200).json({ ok: true });
    return;
  }
  const chat = msg.chat.id;
  const text = String(msg.text || "").trim();
  const low = text.toLowerCase();

  try {
    if (low.startsWith("/start") || low.startsWith("/help")) {
      await tg("sendMessage", {
        chat_id: chat,
        text:
          "DualLaunch alerts\nPONS + pump.fun. We don't mint tokens. Not financial advice.\n\n" +
          "/new — latest above $" + MIN_MCAP.toLocaleString("en-US") + " MC\n" +
          "/pons — PONS only\n" +
          "/pump — pump.fun only\n" +
          SITE,
        reply_markup: {
          keyboard: [["/new", "/pons"], ["/pump", "/help"]],
          resize_keyboard: true
        }
      });
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
