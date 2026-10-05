/**
 * DualLaunch index worker, build 9.
 * Copies the pump.fun and PONS coin indexes into our Neon table.
 * No DexScreener. No Birdeye.
 *
 * Their displayed market cap is usd_market_cap / marketCapUsd.
 * Recomputing it from raw reserves was ~20x off, which is why the board disagreed.
 *
 * Env: DATABASE_URL required. SOLANA_RPC optional, not used by this build.
 * Run from the index/ folder: node worker.js
 */
const { Pool } = require("pg");

const DB = process.env.DATABASE_URL;
if (!DB) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false }, max: 2 });
const INITIAL_REAL_TOKEN = 793100000000000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getJson(url) {
  const r = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "DualLaunchIndex/9" },
    signal: AbortSignal.timeout(12000)
  });
  if (!r.ok) throw new Error(r.status + " " + url);
  return r.json();
}

function ipfs(u) {
  const s = String(u || "");
  if (s.startsWith("ipfs://")) return "https://ipfs.io/ipfs/" + s.slice(7);
  return s;
}

function pumpCurve(t) {
  if (t.complete) return 100;
  const real = Number(t.real_token_reserves || 0);
  if (!real) return 0;
  return Math.max(0, Math.min(100, (1 - real / INITIAL_REAL_TOKEN) * 100));
}

async function upsert(row) {
  await pool.query(
    `insert into tokens (id, chain, address, name, symbol, logo, description, twitter, telegram, website,
        created_at, graduated, curve_pct, price_usd, mcap_usd, last_trade_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, coalesce($11::timestamptz, now()), $12, $13, $14, $15, coalesce($16::timestamptz, now()), now())
     on conflict (id) do update set
       name = coalesce(nullif(excluded.name, ''), tokens.name),
       symbol = coalesce(nullif(excluded.symbol, ''), tokens.symbol),
       logo = coalesce(nullif(excluded.logo, ''), tokens.logo),
       description = coalesce(nullif(excluded.description, ''), tokens.description),
       twitter = coalesce(nullif(excluded.twitter, ''), tokens.twitter),
       telegram = coalesce(nullif(excluded.telegram, ''), tokens.telegram),
       website = coalesce(nullif(excluded.website, ''), tokens.website),
       graduated = excluded.graduated,
       curve_pct = excluded.curve_pct,
       price_usd = excluded.price_usd,
       mcap_usd = excluded.mcap_usd,
       last_trade_at = coalesce(excluded.last_trade_at, tokens.last_trade_at),
       updated_at = now()`,
    [
      row.id, row.chain, row.address, row.name || null, row.symbol || null, row.logo || null,
      row.desc || null, row.twitter || null, row.telegram || null, row.website || null,
      row.createdAt || null, row.graduated, row.curvePct, row.priceUsd, row.mcapUsd, row.lastTrade || null
    ]
  );
}

async function syncPump() {
  const pages = [0, 50, 100];
  const seen = new Set();
  let n = 0;
  for (const offset of pages) {
    const rows = await getJson(
      "https://frontend-api-v3.pump.fun/coins?offset=" + offset + "&limit=50&sort=last_trade_timestamp&order=DESC&includeNsfw=false"
    );
    const list = Array.isArray(rows) ? rows : [];
    for (const t of list) {
      const mint = t.mint;
      if (!mint || seen.has(mint)) continue;
      seen.add(mint);
      const mcap = Number(t.usd_market_cap || 0);
      const created = t.created_timestamp ? new Date(Number(t.created_timestamp)).toISOString() : null;
      const last = t.last_trade_timestamp ? new Date(Number(t.last_trade_timestamp)).toISOString() : created;
      await upsert({
        id: "sol-" + mint,
        chain: "sol",
        address: mint,
        name: t.name || "",
        symbol: t.symbol || "",
        logo: ipfs(t.image_uri || ""),
        desc: t.description || "",
        twitter: t.twitter || "",
        telegram: t.telegram || "",
        website: t.website || "",
        createdAt: created,
        lastTrade: last,
        graduated: !!t.complete,
        curvePct: pumpCurve(t),
        priceUsd: mcap ? mcap / 1e9 : 0,
        mcapUsd: mcap
      });
      n++;
    }
  }
  console.log("pump saved", n);
}

async function syncPons() {
  const j = await getJson("https://www.ponsfamily.com/api/pons-launches?explore=1&sort=newest&age=all&page=1&includeGraduated=true");
  const items = []
    .concat((j.active && j.active.items) || [])
    .concat((j.graduated && j.graduated.items) || []);
  let n = 0;
  for (const t of items) {
    const addr = String(t.token || "");
    if (!addr.startsWith("0x")) continue;
    const mcap = Number(t.marketCapUsd || 0);
    const curve = t.graduated ? 100 : Math.max(0, Math.min(100, Number(t.graduationProgressPct || 0)));
    await upsert({
      id: "rh-" + addr.toLowerCase(),
      chain: "rh",
      address: addr,
      name: t.name || "",
      symbol: String(t.symbol || "").replace(/^\$/, ""),
      logo: ipfs(t.logo || ""),
      desc: t.description || "",
      twitter: t.twitter || "",
      telegram: t.telegram || "",
      website: t.website || "",
      createdAt: t.launchedAt || null,
      lastTrade: t.latestBuyAt || t.launchedAt || null,
      graduated: !!t.graduated,
      curvePct: curve,
      priceUsd: Number(t.priceUsd || 0),
      mcapUsd: mcap
    });
    n++;
  }
  console.log("pons saved", n);
}

async function tick() {
  try { await syncPump(); } catch (e) { console.error("pump", e.message); }
  try { await syncPons(); } catch (e) { console.error("pons", e.message); }
}

async function main() {
  await pool.query("select 1");
  console.log("index worker up build 9");
  for (;;) {
    await tick();
    await sleep(20000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
