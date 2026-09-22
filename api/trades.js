module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=3");
  const addr = String((req.query && req.query.addr) || "");
  const chain = String((req.query && req.query.chain) || "sol");
  if (!addr) { res.status(200).json({ ok: false, trades: [] }); return; }
  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  try {
    const net = chain === "rh" ? "robinhood" : "solana";
    const ds = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + encodeURIComponent(addr), {
      headers: { accept: "application/json" }
    });
    const dj = await ds.json();
    const want = String(addr).toLowerCase();
    const pairs = dj.pairs || [];
    const pair = pairs.find((p) => String((p.baseToken || {}).address || "").toLowerCase() === want) || pairs[0];
    const pool = pair && (pair.pairAddress || pair.address);
    const pairPrice = pair ? num(pair.priceUsd) : 0;
    let trades = [];
    if (pool) {
      const g = await fetch(
        "https://api.geckoterminal.com/api/v2/networks/" + net + "/pools/" + encodeURIComponent(pool) + "/trades?trade_volume_in_usd_greater_than=0",
        { headers: { accept: "application/json" } }
      );
      if (g.ok) {
        const gj = await g.json();
        trades = (gj.data || []).slice(0, 20).map((t) => {
          const a = t.attributes || {};
          const kind = String(a.kind || "").toLowerCase() === "sell" ? "sell" : "buy";
          const usd = num(a.volume_in_usd);
          // Gecko: buy = spend quote, receive base (meme). sell = spend meme, receive quote.
          let tokens = kind === "buy" ? num(a.to_token_amount) : num(a.from_token_amount);
          if (tokens > 1e12) tokens = tokens / 1e9;
          if (tokens <= 0 && pairPrice > 0 && usd > 0) tokens = usd / pairPrice;
          const price = tokens > 0 ? usd / tokens : pairPrice;
          return { kind, usd, tokens, price, at: a.block_timestamp || "" };
        });
      }
    }
    const tx = pair && pair.txns && pair.txns.h24 ? pair.txns.h24 : {};
    res.status(200).json({
      ok: true,
      mcap: pair ? num(pair.marketCap || pair.fdv) : 0,
      vol: pair && pair.volume ? num(pair.volume.h24) : 0,
      buys: tx.buys || 0,
      sells: tx.sells || 0,
      price: pairPrice,
      pair: pool || "",
      trades
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e), trades: [] });
  }
};
