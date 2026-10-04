/**
 * DualLaunch index worker — chain is the source, not DexScreener / Birdeye.
 *
 * Solana: pump program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
 *   bonding-curve PDA = ["bonding-curve", mint]
 *   priceSol = virtualSolReserves / virtualTokenReserves
 *   curvePct = 1 - realTokenReserves / 793_100_000_000_000
 *
 * Robinhood (4663): Pons V2 factory 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e
 *   TokenLaunched topic0 0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607
 *   graduation threshold 4.2 ETH (native quote). Post-grad pool is Uniswap v4
 *   behind hook 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044.
 *
 * Quote USD comes from Pyth, not from a market site.
 * This file is the loop. Wire pg + rpc clients before it writes rows.
 */

const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const PONS_V2 = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
const TOKEN_LAUNCHED = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";
const PUMP_INITIAL_REAL_TOKEN = 793_100_000_000_000n; // 6 decimals

function pumpPriceSol(virtualSol, virtualToken) {
  if (!virtualToken) return 0;
  return Number(virtualSol) / Number(virtualToken);
}

function pumpCurvePct(realTokenReserves) {
  const left = Number(realTokenReserves) / Number(PUMP_INITIAL_REAL_TOKEN);
  return Math.max(0, Math.min(100, (1 - left) * 100));
}

function mcapUsd(priceQuote, quoteUsd, supplyUi) {
  return priceQuote * quoteUsd * supplyUi;
}

// Feed response the site already expects, filled from our tables.
function toFeedCoin(row) {
  return {
    id: row.id,
    name: row.name || "Unnamed",
    symbol: String(row.symbol || "?").toUpperCase(),
    chain: row.chain,
    curvePct: Number(row.curve_pct || 0),
    mcap: Number(row.mcap_usd || 0),
    volume: Number(row.vol_24h_usd || 0),
    created: row.created_at ? new Date(row.created_at).getTime() : 0,
    lastTrade: row.last_trade_at ? new Date(row.last_trade_at).getTime() : 0,
    logo: row.logo || "",
    address: row.address,
    graduated: !!row.graduated,
    priceUsd: Number(row.price_usd || 0),
    link: row.chain === "rh"
      ? "https://www.ponsfamily.com/launchpad/" + row.address
      : "https://pump.fun/coin/" + row.address
  };
}

module.exports = {
  PUMP,
  PONS_V2,
  TOKEN_LAUNCHED,
  pumpPriceSol,
  pumpCurvePct,
  mcapUsd,
  toFeedCoin
};
