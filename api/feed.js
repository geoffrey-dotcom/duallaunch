const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1
});

const INITIAL_REAL_TOKEN = 793100000000000;

function usd(v) {
  v = Number(v || 0);
  if (!v) return "—";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + Math.round(v).toLocaleString("en-US");
  return "$" + v.toFixed(2);
}

function ipfs(u) {
  const s = String(u || "");
  if (!s) return "";
  if (s.startsWith("ipfs://")) return "https://ipfs.io/ipfs/" + s.slice(7);
  return s;
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
    logo: ipfs(t.logo || ""),
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

async function getJson(url) {
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "DualLaunch/1.0" },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

function pumpCurve(t) {
  if (t.complete) return 100;
  const real = Number(t.real_token_reserves || 0);
  if (!real) return Number(t.bonding_curve_progress || 0);
  return Math.max(0, Math.min(100, (1 - real / INITIAL_REAL_TOKEN) * 100));
}

function fromPump(t) {
  const mint = t.mint || t.address;
  if (!mint) return null;
  const mcap = Number(t.usd_market_cap || 0);
  const curvePct = pumpCurve(t);
  const created = Number(t.created_timestamp || Date.now());
  return {
    id: "sol-" + mint,
    name: t.name || "Unnamed",
    symbol: String(t.symbol || "?").toUpperCase(),
    chain: "sol",
    raised: (curvePct / 100) * 85,
    goal: 85,
    curvePct,
    vol: mcap ? usd(mcap) : "—",
    mcap,
    created,
    desc: t.description || "",
    logo: ipfs(t.image_uri || ""),
    address: mint,
    twitter: t.twitter || "",
    telegram: t.telegram || "",
    website: t.website || "",
    lastTrade: Number(t.last_trade_timestamp || created),
    volume: mcap,
    priceUsd: mcap ? mcap / 1e9 : 0,
    graduated: !!t.complete,
    link: "https://pump.fun/coin/" + mint
  };
}

function fromPons(t) {
  const addr = t.token || t.address;
  if (!addr) return null;
  const curvePct = Math.max(0, Math.min(100, Number(t.graduationProgressPct || 0)));
  const mcap = Number(t.marketCapUsd || 0);
  const created = new Date(t.launchedAt || Date.now()).getTime();
  return {
    id: "rh-" + String(addr).toLowerCase(),
    name: t.name || "Unnamed",
    symbol: String(t.symbol || "?").replace(/^\$/, "").toUpperCase(),
    chain: "rh",
    raised: (curvePct / 100) * Number(t.graduationThresholdEth || 4.2),
    goal: Number(t.graduationThresholdEth || 4.2),
    curvePct: t.graduated ? 100 : curvePct,
    vol: mcap ? usd(mcap) : "—",
    mcap,
    created,
    desc: t.description || "",
    logo: ipfs(t.logo || ""),
    address: addr,
    twitter: t.twitter || "",
    telegram: t.telegram || "",
    website: t.website || "",
    lastTrade: t.latestBuyAt ? new Date(t.latestBuyAt).getTime() : created,
    volume: Number(t.liquidityUsd || mcap || 0),
    priceUsd: Number(t.priceUsd || 0),
    graduated: !!t.graduated,
    link: "https://www.ponsfamily.com/launchpad/" + addr
  };
}

function overlay(base, extra) {
  if (!extra) return base;
  const name = extra.name && extra.name !== "Unnamed" ? extra.name : base.name;
  const symbol = extra.symbol && extra.symbol !== "?" ? extra.symbol : base.symbol;
  const mcap = extra.mcap || base.mcap;
  const curvePct = extra.curvePct || base.curvePct;
  return Object.assign({}, base, {
    name,
    symbol,
    logo: extra.logo || base.logo,
    mcap,
    vol: mcap ? usd(mcap) : base.vol,
    curvePct,
    raised: curvePct ? (curvePct / 100) * (extra.goal || base.goal || 85) : base.raised,
    goal: extra.goal || base.goal,
    desc: extra.desc || base.desc,
    twitter: extra.twitter || base.twitter,
    telegram: extra.telegram || base.telegram,
    website: extra.website || base.website,
    graduated: extra.graduated || base.graduated,
    priceUsd: mcap ? mcap / 1e9 : (extra.priceUsd || base.priceUsd || 0)
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=8, stale-while-revalidate=20");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({ ok: false, coins: [], error: "DATABASE_URL missing" });
  }
  const src = String((req.query && req.query.src) || "all");
  const chains = src === "pons" ? ["rh"] : src === "pump" ? ["sol"] : ["rh", "sol"];
  const warnings = [];
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
    const byId = {};
    const coins = q.rows.map((row) => {
      const c = rowToCoin(row);
      byId[c.id] = c;
      return c;
    });

    const [pumpNew, pumpHot, pons] = await Promise.all([
      chains.includes("sol") ? getJson("https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false") : null,
      chains.includes("sol") ? getJson("https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=last_trade_timestamp&order=DESC&includeNsfw=false") : null,
      chains.includes("rh") ? getJson("https://www.ponsfamily.com/api/pons-launches?explore=1&sort=newest&age=all&page=1&includeGraduated=true") : null
    ]);
    if (!pumpNew) warnings.push("pump names unavailable");
    if (!pons) warnings.push("pons board unavailable");

    for (const raw of [].concat(pumpNew || [], pumpHot || [])) {
      const extra = fromPump(raw);
      if (!extra) continue;
      if (byId[extra.id]) byId[extra.id] = overlay(byId[extra.id], extra);
      else { byId[extra.id] = extra; coins.push(extra); }
    }
    const ponsItems = []
      .concat((pons && pons.active && pons.active.items) || [])
      .concat((pons && pons.graduated && pons.graduated.items) || []);
    for (const raw of ponsItems) {
      const extra = fromPons(raw);
      if (!extra) continue;
      if (byId[extra.id]) byId[extra.id] = overlay(byId[extra.id], extra);
      else { byId[extra.id] = extra; coins.push(extra); }
    }

    const out = Object.values(byId)
      .filter((c) => chains.includes(c.chain))
      .sort((a, b) => (b.lastTrade || b.created || 0) - (a.lastTrade || a.created || 0))
      .slice(0, 240);
    res.status(200).json({
      ok: true,
      coins: out,
      counts: {
        pons: out.filter((c) => c.chain === "rh").length,
        pump: out.filter((c) => c.chain === "sol").length
      },
      source: "duallaunch-index+pads",
      warnings
    });
  } catch (e) {
    res.status(200).json({ ok: false, coins: [], error: String(e.message || e) });
  }
};
