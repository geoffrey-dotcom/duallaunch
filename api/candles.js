const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1
});

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=8, stale-while-revalidate=20");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const id = String((req.query && (req.query.id || req.query.token || req.query.addr)) || "");
  const chain = String((req.query && req.query.chain) || "");
  const tokenId = id.includes("-") ? id : (chain && id ? chain + "-" + id : "");
  if (!process.env.DATABASE_URL || !tokenId) {
    return res.status(200).json({ ok: false, candles: [], error: "missing id" });
  }
  try {
    const q = await pool.query(
      `select extract(epoch from ts) * 1000 as t, open, high, low, close, volume_usd
       from candles
       where token_id = $1 and tf = '1m'
       order by ts asc
       limit 240`,
      [tokenId]
    );
    const candles = q.rows.map((r) => ({
      t: Number(r.t),
      o: Number(r.open),
      h: Number(r.high),
      l: Number(r.low),
      c: Number(r.close),
      v: Number(r.volume_usd || 0)
    }));
    res.status(200).json({ ok: true, candles, source: "duallaunch-index" });
  } catch (e) {
    res.status(200).json({ ok: false, candles: [], error: String(e.message || e) });
  }
};
