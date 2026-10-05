const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1
});

function usd(v) {
  v = Number(v || 0);
  if (!v) return "—";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + Math.round(v).toLocaleString();
  return "$" + v.toFixed(2);
}

function rowToCoin(t) {
  const chain = t.chain === "rh" ? "rh" : "sol";
  const created = t.created_at ? new Date(t.created_at).getTime() : 0;
  const lastTrade = t.last_trade_at ? new Date(t.last_trade_at).getTime() : created;
  const mcap = Number(t.mcap_usd || 0);
  const curvePct = Number(t.curve_pct || 0);
  const goal = chain === "rh" ? 4.2 : 85;
  return {
    id: t.id,
    name: t.name || "Unnamed",
    symbol: String(t.symbol || "?").toUpperCase(),
    chain,
    raised: (curvePct / 100) * goal,
    goal,
    curvePct,
    vol: mcap ? usd(mcap) : "—",
    mcap,
    created,
    desc: t.description || "",
    logo: t.logo || "",
    address: t.address,
    twitter: t.twitter || "",
    telegram: t.telegram || "",
    website: t.website || "",
    lastTrade,
    volume: Number(t.vol_24h_usd || mcap || 0),
    priceUsd: Number(t.price_usd || 0),
    graduated: !!t.graduated || curvePct >= 100,
    link: chain === "rh"
      ? "https://www.ponsfamily.com/launchpad/" + t.address
      : "https://pump.fun/coin/" + t.address
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=8, stale-while-revalidate=20");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({ ok: false, coins: [], error: "DATABASE_URL missing" });
  }
  const src = String((req.query && req.query.src) || "all");
  const chains = src === "pons" ? ["rh"] : src === "pump" ? ["sol"] : ["rh", "sol"];
  try {
    const q = await pool.query(
      `select id, chain, address, name, symbol, logo, description, twitter, telegram, website,
              created_at, graduated, curve_pct, price_usd, mcap_usd, vol_24h_usd, last_trade_at
       from tokens
       where chain = any($1::text[])
       order by last_trade_at desc nulls last
       limit 240`,
      [chains]
    );
    const coins = q.rows.map(rowToCoin);
    res.status(200).json({
      ok: true,
      coins,
      counts: {
        pons: coins.filter((c) => c.chain === "rh").length,
        pump: coins.filter((c) => c.chain === "sol").length
      },
      source: "duallaunch-index",
      warnings: []
    });
  } catch (e) {
    res.status(200).json({ ok: false, coins: [], error: String(e.message || e) });
  }
};
