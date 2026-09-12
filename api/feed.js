module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=4, stale-while-revalidate=12");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const limit = Math.min(Number(req.query.limit) || 30, 50);

  try {
    const [ponsRes, pumpRes] = await Promise.all([
      fetch("https://www.ponsfamily.com/api/pons-launches", { headers: { accept: "application/json" } }),
      fetch(
        "https://frontend-api-v3.pump.fun/coins?offset=0&limit=" + limit + "&sort=created_timestamp&order=DESC&includeNsfw=false",
        { headers: { accept: "application/json" } }
      )
    ]);
    const ponsRaw = ponsRes.ok ? await ponsRes.json() : [];
    const pumpRaw = pumpRes.ok ? await pumpRes.json() : [];
    const ponsList = Array.isArray(ponsRaw) ? ponsRaw : [];
    ponsList.sort((a, b) => new Date(b.launchedAt || 0) - new Date(a.launchedAt || 0));

    const ipfs = (u) => {
      if (!u) return "";
      const s = String(u);
      if (s.startsWith("ipfs://")) return "https://cloudflare-ipfs.com/ipfs/" + s.slice(7).replace(/^ipfs\//, "");
      if (s.includes("/ipfs/")) return s;
      return s;
    };

    const pons = ponsList.slice(0, limit).map((t) => {
      const pct = Number(t.graduationProgressPct || 0);
      const goal = Number(t.graduationThresholdEth) || 4.2;
      const addr = t.token || "";
      return {
        id: "rh-" + String(addr).toLowerCase(),
        name: t.name || "Unnamed",
        symbol: String(t.symbol || "?").toUpperCase(),
        chain: "rh",
        raised: t.pairedPrincipalEth != null ? Number(t.pairedPrincipalEth) : (pct / 100) * goal,
        goal,
        vol: t.marketCapUsd != null ? "$" + Math.round(t.marketCapUsd).toLocaleString() : "—",
        mcap: Number(t.marketCapUsd || 0),
        created: new Date(t.launchedAt || Date.now()).getTime(),
        desc: t.description || "",
        logo: ipfs(t.logo),
        address: addr,
        graduated: !!t.graduated || pct >= 100,
        link: addr ? "https://www.ponsfamily.com/launchpad/" + addr : "https://www.ponsfamily.com/launchpad",
        chart: addr ? "https://dexscreener.com/robinhood/" + addr : ""
      };
    });

    const pump = (Array.isArray(pumpRaw) ? pumpRaw : []).slice(0, limit).map((t) => {
      const mint = t.mint || "";
      return {
        id: "sol-" + mint,
        name: t.name || "Unnamed",
        symbol: String(t.symbol || "?").toUpperCase(),
        chain: "sol",
        raised: t.complete ? 85 : Number(t.real_sol_reserves || 0) / 1e9,
        goal: 85,
        vol: t.usd_market_cap ? "$" + Math.round(t.usd_market_cap).toLocaleString() : "—",
        mcap: Number(t.usd_market_cap || 0),
        created: Number(t.created_timestamp || Date.now()),
        desc: t.description || "",
        logo: t.image_uri || "",
        address: mint,
        graduated: !!t.complete,
        link: mint ? "https://pump.fun/coin/" + mint : "https://pump.fun/",
        chart: mint ? "https://dexscreener.com/solana/" + mint : ""
      };
    });

    res.status(200).json({ ok: true, coins: pons.concat(pump) });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e), coins: [] });
  }
};
