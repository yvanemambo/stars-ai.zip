// STARS AI — petit serveur pour Render.
// Sert la page (public/index.html) et relaie les messages vers l'IA :
//   - Claude (Anthropic) si ANTHROPIC_API_KEY est défini
//   - sinon Gemini (Google) si GEMINI_API_KEY est défini
// Aucune dépendance : Node 18+ suffit (fetch intégré).

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

// ---------- Réglages (modifiables dans Render > Environment) ----------
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const CLAUDE_MODEL = (process.env.CLAUDE_MODEL || "claude-haiku-5-5").trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-flash-latest").trim();
const MAX_TOKENS = Number(process.env.MAX_TOKENS) || 2048;
const PER_IP_PER_MINUTE = Number(process.env.PER_IP_PER_MINUTE) || 15;
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 500; // messages / jour pour tout le site
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";

// Modèles de secours si le modèle choisi n'existe plus (erreur 404).
const CLAUDE_FALLBACKS = ["claude-haiku-5-5", "claude-sonnet-5-5"];
const GEMINI_FALLBACKS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3-flash-preview"];

const provider = ANTHROPIC_API_KEY ? "claude" : GEMINI_API_KEY ? "gemini" : null;

function rules() {
  const tech = provider === "gemini"
    ? "STARS AI est propulsé par Gemini, un modèle de Google"
    : "STARS AI est propulsé par Claude, un modèle d'Anthropic";
  return `Tu es STARS AI, un assistant d'intelligence artificielle généraliste, chaleureux, clair et précis.
- Réponds dans la langue de l'utilisateur (français par défaut).
- Va droit au but ; développe quand la question le demande.
- Utilise du Markdown simple quand c'est utile : **gras**, listes, titres ###, blocs de code.
- Si on te demande qui tu es : tu es STARS AI. Si on te demande sur quelle technologie tu fonctionnes, dis honnêtement que ${tech}.
- Ne prétends jamais avoir fait une action que tu ne peux pas faire (naviguer sur internet, envoyer un message…).`;
}

// ---------- Limites anti-abus (en mémoire) ----------
const hits = new Map(); // ip -> [timestamps]
let day = new Date().toISOString().slice(0, 10);
let dayCount = 0;

function checkLimits(ip) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= DAILY_LIMIT) return "daily_limit";
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  if (list.length >= PER_IP_PER_MINUTE) { hits.set(ip, list); return "rate_limited"; }
  list.push(now); hits.set(ip, list);
  dayCount++;
  return null;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some(t => now - t < 60_000)) hits.delete(ip);
}, 5 * 60_000).unref();

// ---------- Nettoyage de la conversation ----------
function cleanMessages(raw) {
  if (!Array.isArray(raw)) return null;
  let msgs = raw
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content.slice(0, 12000) }))
    .filter(m => m.content.trim());
  msgs = msgs.slice(-20);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  // Fusionne les messages consécutifs du même rôle (exigé par les API).
  const merged = [];
  for (const m of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else merged.push({ ...m });
  }
  if (!merged.length || merged[merged.length - 1].role !== "user") return null;
  const total = merged.reduce((n, m) => n + m.content.length, 0);
  if (total > 60000) return "too_large";
  return merged;
}

// ---------- Lecture d'un flux SSE ----------
async function* sse(body) {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data && data !== "[DONE]") { try { yield JSON.parse(data); } catch {} }
      }
    }
  }
}

class UpstreamError extends Error {
  constructor(code, status, detail) { super(code); this.code = code; this.status = status; this.detail = detail; }
}

function codeFor(status) {
  if (status === 401 || status === 403) return "bad_key";
  if (status === 429) return "upstream_busy";
  if (status === 402) return "no_credit";
  return "upstream_error";
}

// ---------- Claude (Anthropic) ----------
async function callClaude(messages, signal) {
  const models = [CLAUDE_MODEL, ...CLAUDE_FALLBACKS.filter(m => m !== CLAUDE_MODEL)];
  for (const model of models) {
    const res = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, stream: true, system: rules(), messages })
    });
    if (res.ok) return { res, model };
    const detail = await res.text().catch(() => "");
    if (res.status === 404) { console.warn(`[claude] modèle ${model} introuvable, essai suivant`); continue; }
    const low = detail.toLowerCase();
    if (res.status === 400 && (low.includes("credit balance") || low.includes("billing"))) throw new UpstreamError("no_credit", res.status, detail);
    throw new UpstreamError(codeFor(res.status), res.status, detail);
  }
  throw new UpstreamError("upstream_error", 404, "Aucun modèle Claude disponible");
}

async function* streamClaude(res) {
  for await (const ev of sse(res.body)) {
    if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") yield { t: ev.delta.text };
    else if (ev.type === "message_delta" && ev.delta?.stop_reason === "max_tokens") yield { truncated: true };
    else if (ev.type === "message_delta" && ev.delta?.stop_reason === "refusal") yield { refused: true };
    else if (ev.type === "error") throw new UpstreamError(ev.error?.type === "overloaded_error" ? "upstream_busy" : "upstream_error", 500, JSON.stringify(ev.error));
  }
}

// ---------- Gemini (Google) ----------
async function callGemini(messages, signal) {
  const models = [GEMINI_MODEL, ...GEMINI_FALLBACKS.filter(m => m !== GEMINI_MODEL)];
  const contents = messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  for (const model of models) {
    const res = await fetch(`${GEMINI_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: rules() }] },
        contents,
        generationConfig: { maxOutputTokens: MAX_TOKENS }
      })
    });
    if (res.ok) return { res, model };
    const detail = await res.text().catch(() => "");
    if (res.status === 404) { console.warn(`[gemini] modèle ${model} introuvable, essai suivant`); continue; }
    if (res.status === 400 && /api key not valid|api_key_invalid/i.test(detail)) throw new UpstreamError("bad_key", 401, detail);
    throw new UpstreamError(codeFor(res.status), res.status, detail);
  }
  throw new UpstreamError("upstream_error", 404, "Aucun modèle Gemini disponible");
}

async function* streamGemini(res) {
  for await (const ev of sse(res.body)) {
    if (ev.error) throw new UpstreamError("upstream_error", ev.error.code || 500, JSON.stringify(ev.error));
    if (ev.promptFeedback?.blockReason) { yield { refused: true }; continue; }
    const c = ev.candidates?.[0];
    if (!c) continue;
    for (const p of c.content?.parts || []) if (p.text && !p.thought) yield { t: p.text };
    if (c.finishReason === "MAX_TOKENS") yield { truncated: true };
    else if (c.finishReason === "SAFETY" || c.finishReason === "PROHIBITED_CONTENT") yield { refused: true };
  }
}

// ---------- HTTP ----------
function json(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}

async function readBody(req, limit = 200_000) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error("too_large"); chunks.push(c); }
  return Buffer.concat(chunks).toString("utf8");
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (typeof fwd === "string" && fwd.split(",")[0].trim()) || req.socket.remoteAddress || "?";
}

async function handleChat(req, res) {
  if (!provider) return json(res, 503, { code: "no_key" });

  let payload;
  try { payload = JSON.parse(await readBody(req)); }
  catch (e) { return json(res, e.message === "too_large" ? 413 : 400, { code: e.message === "too_large" ? "too_large" : "bad_request" }); }

  const messages = cleanMessages(payload?.messages);
  if (messages === "too_large") return json(res, 413, { code: "too_large" });
  if (!messages) return json(res, 400, { code: "bad_request" });

  const limited = checkLimits(clientIp(req));
  if (limited) return json(res, 429, { code: limited });

  const ac = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ac.abort(); });

  let upstream;
  try {
    upstream = provider === "claude" ? await callClaude(messages, ac.signal) : await callGemini(messages, ac.signal);
  } catch (e) {
    if (ac.signal.aborted) return;
    console.error(`[${provider}]`, e.code || e.message, e.status || "", (e.detail || "").slice(0, 500));
    return json(res, 502, { code: e.code || "upstream_error" });
  }

  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "x-accel-buffering": "no"
  });
  const send = obj => res.write(JSON.stringify(obj) + "\n");
  let truncated = false, refused = false, any = false;
  try {
    const gen = provider === "claude" ? streamClaude(upstream.res) : streamGemini(upstream.res);
    for await (const ev of gen) {
      if (ev.t) { any = true; send({ t: ev.t }); }
      if (ev.truncated) truncated = true;
      if (ev.refused) refused = true;
    }
    if (refused && !any) send({ error: "refused" });
    else if (!any) send({ error: "empty_completion" });
    send({ done: true, truncated });
  } catch (e) {
    if (!ac.signal.aborted) {
      console.error(`[${provider}] flux`, e.code || e.message, (e.detail || "").slice(0, 500));
      send({ error: e.code || "upstream_error" });
    }
  } finally {
    res.end();
  }
}

let indexHtml = null;
async function page() {
  if (!indexHtml || process.env.NODE_ENV === "development") indexHtml = await readFile(path.join(__dirname, "public", "index.html"));
  return indexHtml;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
      return res.end(await page());
    }
    if (req.method === "GET" && url.pathname === "/healthz") return json(res, 200, { ok: true });
    if (req.method === "GET" && url.pathname === "/api/status") {
      return json(res, 200, { ready: !!provider, provider, model: provider === "claude" ? CLAUDE_MODEL : provider === "gemini" ? GEMINI_MODEL : null });
    }
    if (req.method === "POST" && url.pathname === "/api/chat") return await handleChat(req, res);
    json(res, 404, { code: "not_found" });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { code: "server_error" }); else res.end();
  }
});

// Vérifie la clé au démarrage et écrit le résultat dans les journaux Render (sans jamais afficher la clé).
async function selfCheck() {
  try {
    if (provider === "gemini") {
      const r = await fetch(`${GEMINI_BASE_URL}/v1beta/models?pageSize=200`, { headers: { "x-goog-api-key": GEMINI_API_KEY } });
      const body = await r.text();
      if (!r.ok) return console.error(`[vérif] Clé Gemini REFUSÉE (HTTP ${r.status}) : ${body.slice(0, 300)}`);
      const names = (JSON.parse(body).models || []).map(m => m.name.replace("models/", ""));
      const flash = names.filter(n => n.includes("flash")).slice(0, 12);
      console.log(`[vérif] Clé Gemini OK — ${names.length} modèles. Flash : ${flash.join(", ")}`);
      const model = names.includes(GEMINI_MODEL) ? GEMINI_MODEL : GEMINI_FALLBACKS.find(m => names.includes(m)) || GEMINI_MODEL;
      const g = await fetch(`${GEMINI_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Réponds seulement : OK" }] }], generationConfig: { maxOutputTokens: 400 } })
      });
      const gb = await g.text();
      if (!g.ok) return console.error(`[vérif] Gemini ne répond pas (HTTP ${g.status}) : ${gb.slice(0, 300)}`);
      const txt = (JSON.parse(gb).candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || "").join("").trim();
      console.log(`[vérif] Gemini (${model}) répond : « ${txt.slice(0, 60)} »`);
    } else if (provider === "claude") {
      const r = await fetch(`${ANTHROPIC_BASE_URL}/v1/models`, { headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } });
      const body = await r.text();
      if (!r.ok) return console.error(`[vérif] Clé Claude REFUSÉE (HTTP ${r.status}) : ${body.slice(0, 300)}`);
      const names = (JSON.parse(body).data || []).map(m => m.id);
      console.log(`[vérif] Clé Claude OK — modèles : ${names.slice(0, 12).join(", ")}`);
    }
  } catch (e) {
    console.error("[vérif] Impossible de joindre l'IA :", e.message);
  }
}

server.listen(PORT, () => {
  console.log(`STARS AI en ligne sur le port ${PORT} — IA : ${provider ? provider + " (" + (provider === "claude" ? CLAUDE_MODEL : GEMINI_MODEL) + ")" : "AUCUNE CLÉ (ajoute ANTHROPIC_API_KEY ou GEMINI_API_KEY)"}`);
  if (provider && process.env.SKIP_SELF_CHECK !== "1") selfCheck();
});
