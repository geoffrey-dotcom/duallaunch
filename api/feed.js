module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=4, stale-while-revalidate=12");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const hdr = { accept: "application/json" };

  try {
    const pumpQs = (sort, offset) =>
      "https://frontend-api-v3.pump.fun/coins?offset=" + offset +
      "&limit=50&sort=" + sort + "&order=DESC&includeNsfw=false";

    const ponsExplore = (sort, page) =>
      "https://www.ponsfamily.com/api/pons-launches?explore=1&sort=" +
      sort + "&age=all&page=" + page + "&includeGraduated=true";

    const jobs = [
      fetch(ponsExplore("newest", 1), { headers: hdr }),
      fetch(ponsExplore("newest", 2), { headers: hdr }),
      fetch(ponsExplore("newest", 3), { headers: hdr }),
      fetch(ponsExplore("recentBuys", 1), { headers: hdr }),
      fetch(ponsExplore("recentBuys", 2), { headers: hdr }),
      fetch(ponsExplore("marketCap", 1), { headers: hdr }),
      fetch(pumpQs("created_timestamp", 0), { headers: hdr }),
      fetch(pumpQs("created_timestamp", 50), { headers: hdr }),
      fetch(pumpQs("created_timestamp", 100), { headers: hdr }),
      fetch(pumpQs("last_trade_timestamp", 0) + "&complete=false", { headers: hdr }),
      fetch(pumpQs("last_trade_timestamp", 50) + "&complete=false", { headers: hdr }),
      fetch(pumpQs("market_cap", 0) + "&complete=false", { headers: hdr })
    ];
    const settled = await Promise.all(jobs.map((p) => p.catch(() => null)));
    const [p1,p2,p3,pb1,pb2,pmc, pn0,pn50,pn100, ph0,ph50, pmc2] = settled;

    const flattenPons = (raw) => {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      const a = (((raw.active || {}).items) || []);
      const g = (((raw.graduated || {}).items) || []);
      return a.concat(g);
    };

    const read = async (r) => (r && r.ok ? r.json() : null);
    const ponsList = []
      .concat(flattenPons(await read(p1)))
      .concat(flattenPons(await read(p2)))
      .concat(flattenPons(await read(p3)))
      .concat(flattenPons(await read(pb1)))
      .concat(flattenPons(await read(pb2)))
      .concat(flattenPons(await read(pmc)));

    const pumpRaw = []
      .concat(await read(pn0) || [])
      .concat(await read(pn50) || [])
      .concat(await read(pn100) || [])
      .concat(await read(ph0) || [])
      .concat(await read(ph50) || [])
      .concat(await read(pmc2) || []);

    const ipfs = (u) => {
      if (!u) return "";
      const s = String(u);
      if (s.startsWith("ipfs://")) return "https://w3s.link/ipfs/" + s.slice(7).replace(/^ipfs\//, "");
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
      const launched = new Date(t.launchedAt || Date.now()).getTime();
      return {
        id: "rh-" + String(addr).toLowerCase(),
        name: t.name || "Unnamed",
        symbol: String(t.symbol || "?").toUpperCase(),
        chain: "rh",
        raised,
        goal,
        vol: t.marketCapUsd != null ? "$" + Math.round(t.marketCapUsd).toLocaleString() : "—",
        mcap: Number(t.marketCapUsd || 0),
        created: launched,
        desc: t.description || "",
        logo: ipfs(t.logo),
        address: addr,
        twitter: t.twitter || (t.socials && t.socials.twitter) || "",
        telegram: t.telegram || (t.socials && t.socials.telegram) || "",
        website: t.website || (t.socials && t.socials.website) || "",
        lastTrade: t.latestBuyAt ? new Date(t.latestBuyAt).getTime() : launched,
        volume: Number(t.liquidityUsd || t.marketCapUsd || 0),
        graduated,
        link: addr ? "https://www.ponsfamily.com/launchpad/" + addr : "https://www.ponsfamily.com/launchpad",
        chart: addr ? "https://dexscreener.com/robinhood/" + addr : ""
      };
    };

    const mapPump = (t) => {
      const mint = t.mint || "";
      const realSol = Number(t.real_sol_reserves || 0) / 1e9;
      let created = Number(t.created_timestamp || Date.now());
      if (created < 1e12) created *= 1000;
      const ageMs = Date.now() - created;
      const usd = Number(t.usd_market_cap || 0);
      const graduated = !!t.complete || realSol >= 85 || (ageMs > 14 * 86400000 && usd > 50000);
      let raised = Math.min(85, Math.max(0, realSol));
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
        created,
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

    const seenP = new Set();
    const pons = [];
    ponsList.forEach((t) => {
      const c = mapPons(t);
      if (!c.address || seenP.has(c.id)) return;
      seenP.add(c.id);
      pons.push(c);
    });

    const seenS = new Set();
    const pump = [];
    (Array.isArray(pumpRaw) ? pumpRaw : []).forEach((t) => {
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
