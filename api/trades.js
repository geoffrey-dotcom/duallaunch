module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=5");
  const addr = String((req.query && req.query.addr) || "");
  const chain = String((req.query && req.query.chain) || "sol");
  if (!addr) { res.status(200).json({ ok: false, trades: [] }); return; }
  try {
    const net = chain === "rh" ? "robinhood" : "solana";
    const ds = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + encodeURIComponent(addr), {
      headers: { accept: "application/json" }
    });
    const dj = await ds.json();
    const want = chain === "rh" ? "robinhood" : "solana";
    const pair = (dj.pairs || []).find((p) => String(p.chainId || "").toLowerCase().includes(want.replace("robinhood", "robin"))) || (dj.pairs || [])[0];
    const pool = pair && (pair.pairAddress || pair.address);
    let trades = [];
    if (pool) {
      const g = await fetch("https://api.geckoterminal.com/api/v2/networks/" + net + "/pools/" + encodeURIComponent(pool) + "/trades?trade_volume_in_usd_greater_than=0", {
        headers: { accept: "application/json" }
      });
      if (g.ok) {
        const gj = await g.json();
        trades = (gj.data || []).slice(0, 20).map((t) => {
          const a = t.attributes || {};
          return {
            kind: a.kind || a.tx_type || "",
            usd: Number(a.volume_in_usd || a.price_in_usd || 0),
            tokens: Number(a.from_token_amount || a.to_token_amount || 0),
            price: Number(a.price_to_in_usd || a.price_from_in_usd || 0),
            at: a.block_timestamp || ""
          };
        });
      }
    }
    const tx = pair && pair.txns && pair.txns.h24 ? pair.txns.h24 : {};
    res.status(200).json({
      ok: true,
      mcap: pair ? Number(pair.marketCap || pair.fdv || 0) : 0,
      vol: pair && pair.volume && pair.volume.h24 ? pair.volume.h24 : 0,
      buys: tx.buys || 0,
      sells: tx.sells || 0,
      price: pair ? Number(pair.priceUsd || 0) : 0,
      pair: pool || "",
      trades
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e), trades: [] });
  }
};
