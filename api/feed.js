module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const limit = Math.min(Number(req.query.limit) || 40, 80);

  try {
    const [ponsRes, pumpRes] = await Promise.all([
      fetch("https://www.ponsfamily.com/api/pons-launches", {
        headers: { accept: "application/json" }
      }),
      fetch(
        "https://frontend-api-v3.pump.fun/coins?offset=0&limit=" +
          limit +
          "&sort=created_timestamp&order=DESC&includeNsfw=false",
        { headers: { accept: "application/json" } }
      )
    ]);

    const ponsRaw = ponsRes.ok ? await ponsRes.json() : [];
    const pumpRaw = pumpRes.ok ? await pumpRes.json() : [];

    const ponsList = Array.isArray(ponsRaw) ? ponsRaw : [];
    ponsList.sort((a, b) => new Date(b.launchedAt || 0) - new Date(a.launchedAt || 0));

    const pons = ponsList.slice(0, limit).map((t) => {
      const pct = Number(t.graduationProgressPct || 0);
      const goal = Number(t.graduationThresholdEth) || 4.2;
      const raised =
        t.pairedPrincipalEth != null
          ? Number(t.pairedPrincipalEth)
          : (pct / 100) * goal;
      return {
        id: "rh-" + String(t.token || "").toLowerCase(),
        name: t.name || "Unnamed",
        symbol: String(t.symbol || "?").toUpperCase(),
        chain: "rh",
        raised,
        goal,
        chg: 0,
        vol: t.marketCapUsd != null ? "$" + Math.round(t.marketCapUsd).toLocaleString() : "—",
        desc: t.description || "",
        logo: t.logo || "",
        address: t.token,
        pool: t.pool,
        graduated: !!t.graduated || pct >= 100,
        link: t.token ? "https://www.ponsfamily.com/launchpad" : "https://www.ponsfamily.com/launchpad",
        trade: t.token
          ? "https://dexscreener.com/robinhoodchain/" + t.token
          : "https://www.ponsfamily.com/launchpad"
      };
    });

    const pumpList = Array.isArray(pumpRaw) ? pumpRaw : [];
    const pump = pumpList.slice(0, limit).map((t) => {
      const sol = Number(t.real_sol_reserves || 0) / 1e9;
      const goal = 85;
      return {
        id: "sol-" + t.mint,
        name: t.name || "Unnamed",
        symbol: String(t.symbol || "?").toUpperCase(),
        chain: "sol",
        raised: t.complete ? goal : sol,
        goal,
        chg: 0,
        vol: t.usd_market_cap
          ? "$" + Math.round(t.usd_market_cap).toLocaleString()
          : t.market_cap
            ? String(Math.round(t.market_cap)) + " SOL MC"
            : "—",
        desc: t.description || "",
        logo: t.image_uri || "",
        address: t.mint,
        pool: t.bonding_curve,
        graduated: !!t.complete,
        link: t.mint ? "https://pump.fun/coin/" + t.mint : "https://pump.fun/",
        trade: t.mint ? "https://pump.fun/coin/" + t.mint : "https://pump.fun/"
      };
    });

    res.status(200).json({
      ok: true,
      ponsCount: ponsList.length,
      pumpCount: pumpList.length,
      coins: pons.concat(pump)
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e), coins: [] });
  }
};
