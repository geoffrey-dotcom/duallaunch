module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=8, stale-while-revalidate=20");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const src = String((req.query && req.query.src) || "all");
  const wantPons = src !== "pump";
  const wantPump = src !== "pons";
  const warnings = [];
  const hdr = { accept: "application/json", "user-agent": "DualLaunch/1.0" };

  const ipfs = (u) => {
    if (!u) return "";
    const s = String(u);
    const cid = (s.match(/ipfs\/([^/?#]+)/) || s.match(/^ipfs:\/\/([^/?#]+)/) || [])[1];
    if (cid) return "https://w3s.link/ipfs/" + cid;
    if (s.startsWith("ipfs://")) return "https://w3s.link/ipfs/" + s.slice(7).replace(/^ipfs\//, "");
    return s;
  };
  const usd = (v) => {
    v = Number(v || 0);
    if (!v) return "—";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return "$" + Math.round(v).toLocaleString();
    return "$" + v.toFixed(2);
  };
  async function getJson(url, label) {
    try {
      const r = await fetch(url, { headers: hdr });
      if (!r.ok) {
        warnings.push(label + " " + r.status);
        return null;
      }
      return await r.json();
    } catch (e) {
      warnings.push(label + " " + String(e.message || e));
      return null;
    }
  }
  function flattenPons(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    const bag = [];
    const push = (x) => { if (Array.isArray(x)) bag.push.apply(bag, x); };
    push(raw.items);
    push(raw.launches);
    push(raw.tokens);
    push(raw.data);
    if (raw.active) push(raw.active.items || raw.active.launches || raw.active);
    if (raw.graduated) push(raw.graduated.items || raw.graduated.launches || raw.graduated);
    if (raw.result) return flattenPons(raw.result);
    return bag;
  }
  function mapPons(t) {
    const addr = t.token || t.address || t.ca || "";
    if (!addr) return null;
    const apiPct = Number(t.graduationProgressPct != null ? t.graduationProgressPct : t.progress);
    let goal = Number(t.graduationThresholdEth || 4.2);
    if (!Number.isFinite(goal) || goal <= 0 || goal > 50) goal = 4.2;
    let pct = Number.isFinite(apiPct) ? Math.max(0, Math.min(100, apiPct)) : 0;
    const graduated = !!t.graduated || !!t.complete || pct >= 100;
    if (graduated) pct = 100;
    const launched = new Date(t.launchedAt || t.createdAt || Date.now()).getTime();
    const mcap = Number(t.marketCapUsd || t.marketCap || 0);
    return {
      id: "rh-" + String(addr).toLowerCase(),
      name: t.name || "Unnamed",
      symbol: String(t.symbol || "?").toUpperCase(),
      chain: "rh",
      raised: (pct / 100) * goal,
      goal,
      curvePct: pct,
      vol: mcap ? usd(mcap) : "—",
      mcap,
      created: launched,
      desc: t.description || "",
      logo: ipfs(t.logo || t.image || t.imageUrl || (t.metadata && t.metadata.image) || ""),
      address: addr,
      twitter: t.twitter || (t.socials && t.socials.twitter) || "",
      telegram: t.telegram || (t.socials && t.socials.telegram) || "",
      website: t.website || (t.socials && t.socials.website) || "",
      lastTrade: t.latestBuyAt ? new Date(t.latestBuyAt).getTime() : launched,
      volume: Number(t.liquidityUsd || mcap || 0),
      graduated,
      link: "https://www.ponsfamily.com/launchpad/" + addr
    };
  }
  function mapPump(t) {
    const mint = t.mint || t.address || "";
    if (!mint) return null;
    const created = Number(t.created_timestamp || Date.now());
    const graduated = !!t.complete;
    const curvePct = graduated ? 100 : Math.max(0, Math.min(100, Number(t.bonding_curve_progress || t.progress || 0)));
    const mcap = Number(t.usd_market_cap || 0);
    return {
      id: "sol-" + mint,
      name: t.name || "Unnamed",
      symbol: String(t.symbol || "?").toUpperCase(),
      chain: "sol",
      raised: graduated ? 85 : (curvePct / 100) * 85,
      goal: 85,
      curvePct,
      vol: mcap ? usd(mcap) : "—",
      mcap,
      created,
      desc: t.description || "",
      logo: t.image_uri || "",
      address: mint,
      twitter: t.twitter || "",
      telegram: t.telegram || "",
      website: t.website || "",
      lastTrade: Number(t.last_trade_timestamp || created),
      volume: mcap,
      graduated,
      link: "https://pump.fun/coin/" + mint
    };
  }
  async function loadPons() {
    const pages = [
      "https://www.ponsfamily.com/api/pons-launches?explore=1&sort=newest&age=all&page=1&includeGraduated=true",
      "https://www.ponsfamily.com/api/pons-launches?explore=1&sort=recentBuys&age=all&page=1&includeGraduated=true",
      "https://www.ponsfamily.com/api/pons-launches?explore=1&sort=marketCap&age=all&page=1&includeGraduated=true"
    ];
    const raws = await Promise.all(pages.map((u, i) => getJson(u, "pons" + (i + 1))));
    const seen = {};
    const out = [];
    raws.forEach((raw) => {
      flattenPons(raw).forEach((t) => {
        const c = mapPons(t);
        if (!c || seen[c.id]) return;
        seen[c.id] = 1;
        out.push(c);
      });
    });
    return out;
  }
  async function loadPump() {
    const urls = [
      "https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false",
      "https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=last_trade_timestamp&order=DESC&includeNsfw=false"
    ];
    const raws = await Promise.all(urls.map((u, i) => getJson(u, "pump" + (i + 1))));
    const seen = {};
    const out = [];
    raws.forEach((raw) => {
      const list = Array.isArray(raw) ? raw : (raw && (raw.coins || raw.items || raw.data)) || [];
      list.forEach((t) => {
        const c = mapPump(t);
        if (!c || seen[c.id]) return;
        seen[c.id] = 1;
        out.push(c);
      });
    });
    return out;
  }
  async function dexFill(coins) {
    const need = coins.filter((c) => !c.mcap).slice(0, 40);
    for (let i = 0; i < need.length; i += 20) {
      const chunk = need.slice(i, i + 20).map((c) => c.address);
      try {
        const r = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + chunk.join(","));
        const j = await r.json();
        (j.pairs || []).forEach((p) => {
          const addr = String((p.baseToken && p.baseToken.address) || "").toLowerCase();
          const hit = coins.find((c) => String(c.address).toLowerCase() === addr);
          if (!hit) return;
          const mc = Number(p.marketCap || p.fdv || 0);
          if (mc && !hit.mcap) { hit.mcap = mc; hit.vol = usd(mc); }
          if (p.priceUsd) hit.priceUsd = Number(p.priceUsd);
          if (p.priceChange && p.priceChange.h24 != null) hit.chg24 = Number(p.priceChange.h24);
        });
      } catch (e) {
        warnings.push("dex " + String(e.message || e));
      }
    }
    return coins;
  }

  const pons = wantPons ? await loadPons() : [];
  const pump = wantPump ? await loadPump() : [];
  if (!pons.length && wantPons) warnings.push("pons empty");
  if (!pump.length && wantPump) warnings.push("pump empty");
  let coins = pons.concat(pump);
  coins = await dexFill(coins);
  coins.sort((a, b) => (b.created || 0) - (a.created || 0));
  res.status(200).json({ ok: true, coins, counts: { pons: pons.length, pump: pump.length }, warnings });
};
