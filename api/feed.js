module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=4, stale-while-revalidate=12");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const limit = Math.min(Number(req.query.limit) || 30, 50);

  try {
    const pumpQs = (sort) =>
      "https://frontend-api-v3.pump.fun/coins?offset=0&limit=" +
      limit +
      "&sort=" +
      sort +
      "&order=DESC&includeNsfw=false";

    const [ponsRes, pumpNewRes, pumpHotRes] = await Promise.all([
      fetch("https://www.ponsfamily.com/api/pons-launches", { headers: { accept: "application/json" } }),
      fetch(pumpQs("created_timestamp"), { headers: { accept: "application/json" } }),
      fetch(pumpQs("last_trade_timestamp") + "&complete=false", { headers: { accept: "application/json" } })
    ]);

    const ponsRaw = ponsRes.ok ? await ponsRes.json() : [];
    const pumpNew = pumpNewRes.ok ? await pumpNewRes.json() : [];
    const pumpHot = pumpHotRes.ok ? await pumpHotRes.json() : [];
    const ponsList = Array.isArray(ponsRaw) ? ponsRaw : [];

    const ipfs = (u) => {
      if (!u) return "";
      const s = String(u);
      if (s.startsWith("ipfs://")) return "https://cloudflare-ipfs.com/ipfs/" + s.slice(7).replace(/^ipfs\//, "");
      return s;
    };

    const mapPons = (t) => {
      const apiPct = t.graduationProgressPct;
      const goal = Number(t.graduationThresholdEth) || 4.2;
      let raised = Number(t.pairedPrincipalEth);
      let pct = Number(apiPct);
      const graduated = !!t.graduated || pct >= 100;
      if (!Number.isFinite(raised) || raised <= 0) {
        if (Number.isFinite(pct) && pct > 0) raised = (pct / 100) * goal;
        else if (t.marketCapUsd) raised = Math.min(goal * 0.99, (Number(t.marketCapUsd) / 3500) * goal);
        else raised = 0;
      }
      if (!Number.isFinite(pct)) pct = graduated ? 100 : Math.min(99, (raised / goal) * 100);
      const addr = t.token || "";
      return {
        id: "rh-" + String(addr).toLowerCase(),
        name: t.name || "Unnamed",
        symbol: String(t.symbol || "?").toUpperCase(),
        chain: "rh",
        raised,
        goal,
        vol: t.marketCapUsd != null ? "$" + Math.round(t.marketCapUsd).toLocaleString() : "—",
        mcap: Number(t.marketCapUsd || 0),
        created: new Date(t.latestBuyAt || t.launchedAt || Date.now()).getTime(),
        desc: t.description || "",
        logo: ipfs(t.logo),
        address: addr,
        twitter: t.twitter || (t.socials && t.socials.twitter) || "",
        telegram: t.telegram || (t.socials && t.socials.telegram) || "",
        website: t.website || (t.socials && t.socials.website) || "",
        lastTrade: t.latestBuyAt ? new Date(t.latestBuyAt).getTime() : new Date(t.launchedAt || Date.now()).getTime(),
        volume: Number(t.liquidityUsd || t.marketCapUsd || 0),
        graduated,
        link: addr ? "https://www.ponsfamily.com/launchpad/" + addr : "https://www.ponsfamily.com/launchpad",
        chart: addr ? "https://dexscreener.com/robinhood/" + addr : ""
      };
    };

    const mapPump = (t) => {
      const mint = t.mint || "";
      const realSol = Number(t.real_sol_reserves || 0) / 1e9;
      const mcSol = Number(t.market_cap || 0);
      const graduated = !!t.complete;
      let raised = realSol;
      if (raised < 0.05 && mcSol > 0) raised = Math.min(84, mcSol);
      if (graduated) raised = 85;
      return {
        id: "sol-" + mint,
        name: t.name || "Unnamed",
        symbol: String(t.symbol || "?").toUpperCase(),
        chain: "sol",
        raised,
        goal: 85,
        vol: t.usd_market_cap ? "$" + Math.round(t.usd_market_cap).toLocaleString() : "—",
        mcap: Number(t.usd_market_cap || 0),
        created: Number(t.created_timestamp || Date.now()),
        desc: t.description || "",
        logo: t.image_uri || "",
        address: mint,
        twitter: t.twitter || "",
        telegram: t.telegram || "",
        website: t.website || "",
        lastTrade: Number(t.last_trade_timestamp || t.created_timestamp || Date.now()),
        volume: Number(t.usd_market_cap || t.market_cap || 0),
        graduated,
        link: mint ? "https://pump.fun/coin/" + mint : "https://pump.fun/",
        chart: mint ? "https://dexscreener.com/solana/" + mint : ""
      };
    };

    const ponsLive = ponsList.filter((t) => !t.graduated && Number(t.graduationProgressPct || 0) < 100);
    ponsLive.sort((a, b) => Number(b.marketCapUsd || 0) - Number(a.marketCapUsd || 0));
    const ponsNew = ponsList
      .slice()
      .sort((a, b) => new Date(b.launchedAt || 0) - new Date(a.launchedAt || 0))
      .slice(0, limit);

    const seenP = new Set();
    const pons = [];
    ponsLive.slice(0, limit).concat(ponsNew).forEach((t) => {
      const c = mapPons(t);
      if (!c.address || seenP.has(c.id)) return;
      seenP.add(c.id);
      pons.push(c);
    });

    const seenS = new Set();
    const pump = [];
    (Array.isArray(pumpHot) ? pumpHot : [])
      .concat(Array.isArray(pumpNew) ? pumpNew : [])
      .forEach((t) => {
        const c = mapPump(t);
        if (!c.address || seenS.has(c.id)) return;
        seenS.add(c.id);
        pump.push(c);
      });

    res.status(200).json({ ok: true, coins: pons.concat(pump) });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e), coins: [] });
  }
};
