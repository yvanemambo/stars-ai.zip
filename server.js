  let upstream;
  let prov = provider;
  const voice = payload?.voice === true;
  const guide = guideFor(messages);
  try {
    try {
      upstream = prov === "claude" ? await callClaude(messages, ac.signal, user?.name, voice, guide) : await callGemini(messages, ac.signal, user?.name, voice, guide);
    } catch (e) {
      if (ac.signal.aborted || prov !== "claude" || !GEMINI_API_KEY) throw e;
      console.error(`[secours] Claude a échoué (${e.code || e.message}), bascule sur Gemini`);
      prov = "gemini";
      upstream = await callGemini(messages, ac.signal, user?.name, voice, guide);
      console.log("[secours] Gemini utilisé");
    }
  } catch (e) {
    if (ac.signal.aborted) return;
    console.error(`[${prov}]`, e.code || e.message, e.status || "", (e.detail || "").slice(0, 300));
    return json(res, 502, { code: e.code || "upstream_error" });
  }

  res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" });
  const send = obj => res.write(JSON.stringify(obj) + "\n");
  let truncated = false, refused = false, any = false;
  try {
    const gen = prov === "claude" ? streamClaude(upstream.res) : streamGemini(upstream.res);
