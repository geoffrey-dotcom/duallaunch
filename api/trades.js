res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=15");

  const q = req.query || {};
  const addr = q.addr || q.token || "";
  const chain = q.chain === "rh" ? "rh" : "sol";

  if (!addr || addr.length > 70) {
    return res.status(200).json({ ok: false, trades: [] });
  }

  try {
    const url = `${UPSTREAM}?chain=${chain}&addr=${encodeURIComponent(addr)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(200).json({ ok: false, trades: [], error: String(e?.message || e) });
  }
}
