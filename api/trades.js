const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1
});

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=15");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const addr = String((req.query && (req.query.addr || req.query.token)) || "");
  const chain = String((req.query && req.query.chain) || "sol");
  const tokenId = chain + "-" + (chain === "rh" ? addr.toLowerCase() : addr);
  if (!process.env.DATABASE_URL || !addr) {
    return res.status(200).json({ ok: false, trades: [] });
  }
  try {
    const token = await pool.query(
      "select price_usd, mcap_usd from tokens where id = $1",
      [tokenId]
    );
    const row = token.rows[0] || {};
    const q = await pool.query(
      `select side, price_usd, block_time
       from trades
       where token_id = $1
       order by block_time desc
       limit 30`,
      [tokenId]
    );
    const counts = await pool.query(
      `select side, count(*)::int n
       from trades
       where token_id = $1 and block_time > now() - interval '24 hours'
       group by side`,
      [tokenId]
    );
    const buys = (counts.rows.find((r) => r.side === "buy") || {}).n || 0;
    const sells = (counts.rows.find((r) => r.side === "sell") || {}).n || 0;
    res.status(200).json({
      ok: true,
      source: "duallaunch-index",
      mcap: Number(row.mcap_usd || 0),
      price: Number(row.price_usd || 0),
      buys,
      sells,
      trades: q.rows.map((t) => ({
        kind: t.side,
        usd: null,
        tokens: null,
        price: Number(t.price_usd || 0),
        at: t.block_time
      }))
    });
  } catch (e) {
    res.status(200).json({ ok: false, trades: [], error: String(e.message || e) });
  }
};
