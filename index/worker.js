/**
 * DualLaunch index worker.
 * Chain is the source. No DexScreener, no Birdeye.
 *
 * Env, set on the host, never in git:
 *   DATABASE_URL   Neon connection string
 *   SOLANA_RPC     https://mainnet.helius-rpc.com/?api-key=...
 *   SOLANA_WSS     wss://mainnet.helius-rpc.com/?api-key=...
 *   RH_RPC         https://rpc.mainnet.chain.robinhood.com
 *
 * Run: npm install && npm start
 */
const { Connection, PublicKey } = require("@solana/web3.js");
const { Pool } = require("pg");

const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PONS_V2 = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
const TOKEN_LAUNCHED = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";
const INITIAL_REAL_TOKEN = 793_100_000_000_000n;
const SOL_USD_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const ETH_USD_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

const RPC = process.env.SOLANA_RPC;
const WSS = process.env.SOLANA_WSS || "";
const RH = process.env.RH_RPC || "https://rpc.mainnet.chain.robinhood.com";
const DB = process.env.DATABASE_URL;

if (!RPC || !DB) {
  console.error("SOLANA_RPC and DATABASE_URL are required");
  process.exit(1);
}

const connection = new Connection(RPC, { wsEndpoint: WSS || undefined, commitment: "confirmed" });
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });

const quotes = { sol: 0, eth: 0, at: 0 };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function quoteUsd() {
  if (Date.now() - quotes.at < 30000 && quotes.sol) return quotes;
  try {
    const url = "https://hermes.pyth.network/v2/updates/price/latest?ids[]=" + SOL_USD_ID + "&ids[]=" + ETH_USD_ID;
    const r = await fetch(url);
    const text = await r.text();
    if (text.startsWith("{")) {
      const j = JSON.parse(text);
      for (const row of j.parsed || []) {
        const px = Number(row.price.price) * Math.pow(10, Number(row.price.expo));
        const id = String(row.id || "");
        if (id.includes(SOL_USD_ID.slice(2))) quotes.sol = px;
        if (id.includes(ETH_USD_ID.slice(2))) quotes.eth = px;
      }
    }
  } catch (e) {}
  if (!quotes.sol) {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum&vs_currencies=usd");
    const text = await r.text();
    if (text.startsWith("{")) {
      const j = JSON.parse(text);
      if (j.solana) quotes.sol = Number(j.solana.usd);
      if (j.ethereum) quotes.eth = Number(j.ethereum.usd);
    }
  }
  quotes.at = Date.now();
  return quotes;
}

function curvePda(mint) {
  return PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP)[0];
}

function decodeCurve(buf) {
  if (!buf || buf.length < 49) return null;
  let o = 8;
  const u64 = () => {
    const v = buf.readBigUInt64LE(o);
    o += 8;
    return v;
  };
  const virtualToken = u64();
  const virtualSol = u64();
  const realToken = u64();
  const realSol = u64();
  const supply = u64();
  const complete = buf[o] === 1;
  return { virtualToken, virtualSol, realToken, realSol, supply, complete };
}

async function readCurve(mint) {
  const pda = curvePda(mint);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  const c = decodeCurve(Buffer.from(info.data));
  if (!c) return null;
  const priceSol = Number(c.virtualSol) / Number(c.virtualToken);
  const left = Number(c.realToken) / Number(INITIAL_REAL_TOKEN);
  const curvePct = c.complete ? 100 : Math.max(0, Math.min(100, (1 - left) * 100));
  const supplyUi = Number(c.supply) / 1e6;
  return { pda: pda.toBase58(), priceSol, curvePct, supplyUi, complete: c.complete, realSol: c.realSol };
}

async function cursor(name) {
  const q = await pool.query("select value from cursors where name = $1", [name]);
  return q.rows[0] ? q.rows[0].value : "";
}

async function setCursor(name, value) {
  await pool.query(
    "insert into cursors (name, value, updated_at) values ($1, $2, now()) on conflict (name) do update set value = $2, updated_at = now()",
    [name, value]
  );
}

async function upsertToken(row) {
  await pool.query(
    `insert into tokens (id, chain, address, name, symbol, curve, created_at, graduated, curve_pct, price_usd, mcap_usd, last_trade_at, updated_at)
     values ($1,$2,$3,$4,$5,$6, coalesce($7::timestamptz, now()), $8, $9, $10, $11, now(), now())
     on conflict (id) do update set
       graduated = excluded.graduated,
       curve_pct = excluded.curve_pct,
       price_usd = excluded.price_usd,
       mcap_usd = excluded.mcap_usd,
       curve = coalesce(excluded.curve, tokens.curve),
       name = coalesce(tokens.name, excluded.name),
       symbol = coalesce(tokens.symbol, excluded.symbol),
       last_trade_at = now(),
       updated_at = now()`,
    [row.id, row.chain, row.address, row.name || null, row.symbol || null, row.curve || null, row.createdAt || null, row.graduated, row.curvePct, row.priceUsd, row.mcapUsd]
  );
}

async function addTrade(row) {
  await pool.query(
    `insert into trades (token_id, chain, tx, log_index, side, quote_amount, token_amount, price_usd, usd, block_time)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (chain, tx, log_index) do nothing`,
    [row.tokenId, row.chain, row.tx, row.logIndex, row.side, row.quote, row.tokens, row.priceUsd, row.usd, row.at]
  );
  const bucket = new Date(Math.floor(new Date(row.at).getTime() / 60000) * 60000).toISOString();
  await pool.query(
    `insert into candles (token_id, tf, ts, open, high, low, close, volume_usd)
     values ($1, '1m', $2, $3, $3, $3, $3, $4)
     on conflict (token_id, tf, ts) do update set
       high = greatest(candles.high, excluded.high),
       low = least(candles.low, excluded.low),
       close = excluded.close,
       volume_usd = candles.volume_usd + excluded.volume_usd`,
    [row.tokenId, bucket, row.priceUsd || 0, row.usd || 0]
  );
}

function asBase58(k) {
  if (!k) return "";
  if (typeof k === "string") return k;
  if (typeof k.toBase58 === "function") return k.toBase58();
  if (k.pubkey && typeof k.pubkey.toBase58 === "function") return k.pubkey.toBase58();
  return "";
}

function txKeys(tx) {
  const msg = tx.transaction.message;
  const loaded = tx.meta && tx.meta.loadedAddresses;
  if (typeof msg.getAccountKeys === "function") {
    const accountKeys = msg.getAccountKeys({ accountKeysFromLookups: loaded });
    const out = [];
    for (let i = 0; i < accountKeys.length; i++) out.push(asBase58(accountKeys.get(i)));
    return out.filter(Boolean);
  }
  return (msg.accountKeys || []).map(asBase58).filter(Boolean);
}

function findPumpMint(tx) {
  const keys = txKeys(tx);
  const set = new Set(keys);
  for (const k of keys) {
    try {
      const pda = curvePda(new PublicKey(k)).toBase58();
      if (set.has(pda)) return k;
    } catch (e) {}
  }
  return "";
}

async function handlePumpSig(sig) {
  const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 1 });
  if (!tx || !tx.meta) return;
  const logs = tx.meta.logMessages || [];
  const kind = logs.some((l) => l.includes("Instruction: Create"))
    ? "create"
    : logs.some((l) => l.includes("Instruction: Buy"))
      ? "buy"
      : logs.some((l) => l.includes("Instruction: Sell"))
        ? "sell"
        : "";
  if (!kind) return;
  const mintKey = findPumpMint(tx);
  if (!mintKey) return;
  let mint;
  try { mint = new PublicKey(mintKey); } catch { return; }
  const curve = await readCurve(mint);
  if (!curve) return;
  const q = await quoteUsd();
  const priceUsd = curve.priceSol * q.sol;
  const mcapUsd = priceUsd * curve.supplyUi;
  const id = "sol-" + mintKey;
  const at = new Date((tx.blockTime || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  await upsertToken({
    id,
    chain: "sol",
    address: mintKey,
    curve: curve.pda,
    createdAt: kind === "create" ? at : null,
    graduated: curve.complete,
    curvePct: curve.curvePct,
    priceUsd,
    mcapUsd
  });
  if (kind !== "create") {
    await addTrade({
      tokenId: id,
      chain: "sol",
      tx: sig,
      logIndex: 0,
      side: kind,
      quote: Number(curve.realSol) / 1e9,
      tokens: null,
      priceUsd,
      usd: null,
      at
    });
  }
}

async function pollPump() {
  const seen = await cursor("sol-sig");
  const sigs = await connection.getSignaturesForAddress(PUMP, { limit: 25 });
  const fresh = [];
  for (const s of sigs) {
    if (s.signature === seen) break;
    fresh.push(s.signature);
  }
  fresh.reverse();
  for (const sig of fresh) {
    try { await handlePumpSig(sig); } catch (e) { console.error("pump", sig, e.message); }
    await setCursor("sol-sig", sig);
  }
  if (fresh.length) console.log("pump", fresh.length);
}

async function rh(method, params) {
  const r = await fetch(RH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "rh rpc");
  return j.result;
}

async function pollPons() {
  const latest = parseInt(await rh("eth_blockNumber", []), 16);
  const from = Number(await cursor("rh-block")) || Math.max(0, latest - 20);
  if (from >= latest) return;
  const to = Math.min(latest, from + 20);
  const logs = await rh("eth_getLogs", [{
    address: PONS_V2,
    fromBlock: "0x" + from.toString(16),
    toBlock: "0x" + to.toString(16),
    topics: [TOKEN_LAUNCHED]
  }]);
  for (const log of logs) {
    const token = "0x" + String(log.topics[1] || "").slice(-40);
    if (token.length !== 42) continue;
    await upsertToken({
      id: "rh-" + token,
      chain: "rh",
      address: token,
      graduated: false,
      curvePct: 0,
      priceUsd: 0,
      mcapUsd: 0
    });
  }
  await setCursor("rh-block", String(to));
  if (logs.length) console.log("pons", logs.length);
}

async function tick() {
  await pollPump();
  try { await pollPons(); } catch (e) { console.error("pons", e.message); }
}

async function main() {
  await pool.query("select 1");
  console.log("index worker up build 4");
  for (;;) {
    try { await tick(); } catch (e) { console.error("tick", e.message); }
    await sleep(8000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
