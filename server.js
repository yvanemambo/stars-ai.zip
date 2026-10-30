// STARS AI — petit serveur pour Render.
// - Sert la page (public/index.html)
// - Inscription : un code à 6 chiffres est envoyé par e-mail via un script Google (depuis le Gmail du propriétaire)
// - Relaie les messages vers l'IA : Claude (ANTHROPIC_API_KEY) ou Gemini (GEMINI_API_KEY)
// Aucune dépendance : Node 20+ suffit.

import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const env = k => (process.env[k] || "").trim();

// ---------- Réglages (modifiables dans Render > Environment) ----------
const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");
const GEMINI_API_KEY = env("GEMINI_API_KEY");
const CLAUDE_MODEL = env("CLAUDE_MODEL") || "claude-haiku-5-5";
const GEMINI_MODEL = env("GEMINI_MODEL") || "gemini-3-flash-preview";
const MAX_TOKENS = Number(env("MAX_TOKENS")) || 8192; // les corrections d'exercices peuvent être longues
const PER_MINUTE = Number(env("PER_IP_PER_MINUTE")) || 15;          // messages / minute / personne
const DAILY_LIMIT = Number(env("DAILY_LIMIT")) || 500;              // messages / jour pour tout le site
const FIRST_BYTE_TIMEOUT_MS = Number(env("FIRST_BYTE_TIMEOUT_MS")) || 40000;
const ANTHROPIC_BASE_URL = env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com";
const GEMINI_BASE_URL = env("GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com";

// Inscription
const MAIL_WEBHOOK_URL = env("MAIL_WEBHOOK_URL");       // URL /exec du script Google
const MAIL_WEBHOOK_SECRET = env("MAIL_WEBHOOK_SECRET"); // même valeur que SECRET dans le script
const AUTH_REQUIRED = env("AUTH_REQUIRED") ? env("AUTH_REQUIRED") !== "0" : !!MAIL_WEBHOOK_URL;
const SESSION_SECRET = env("SESSION_SECRET") || crypto.randomBytes(32).toString("hex");
const SESSION_DAYS = Number(env("SESSION_DAYS")) || 30;
const CODE_MINUTES = 10;
const CODE_ATTEMPTS = 5;
if (!env("SESSION_SECRET")) console.warn("[auth] SESSION_SECRET absent : les connexions seront perdues à chaque redémarrage.");

// Modèles de secours si le modèle choisi n'existe plus, est surchargé ou ne répond pas.
const CLAUDE_FALLBACKS = ["claude-haiku-5-5", "claude-sonnet-5-5"];
const GEMINI_FALLBACKS = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];

const provider = ANTHROPIC_API_KEY ? "claude" : GEMINI_API_KEY ? "gemini" : null;

function rules(name) {
  const tech = provider === "gemini"
    ? "STARS AI est propulsé par Gemini, un modèle de Google"
    : "STARS AI est propulsé par Claude, un modèle d'Anthropic";
  return `Tu es STARS AI, un assistant d'intelligence artificielle généraliste, chaleureux, clair et précis.
- Réponds dans la langue de l'utilisateur (français par défaut).
- Va droit au but ; développe quand la question le demande.
- Utilise du Markdown simple quand c'est utile : **gras**, listes, titres ###, blocs de code.
- Si on te demande qui tu es : tu es STARS AI. Si on te demande sur quelle technologie tu fonctionnes, dis honnêtement que ${tech}.
- Ne prétends jamais avoir fait une action que tu ne peux pas faire (naviguer sur internet, envoyer un message…).
- Tu peux voir les photos que l'utilisateur envoie (exercices, documents, schémas…).

Mode prof — quand on te donne un exercice (maths, physique-chimie, SVT, français, anglais, philo, etc.), tape ou en photo :
- Lis tout l'énoncé avec attention. Si une photo est floue ou qu'une partie est illisible, dis précisément ce que tu n'arrives pas à lire et demande une nouvelle photo, au lieu d'inventer.
- Explique comme un bon professeur, étape par étape : ce qu'on cherche, la méthode ou la règle utilisée, puis les calculs détaillés ligne par ligne.
- Donne le résultat final en **gras**, avec l'unité s'il y en a une. Traite chaque question de l'exercice dans l'ordre (1, 2, 3…).
- Écris les formules en texte lisible avec des symboles : x², x³, √, ×, ÷, ±, ≤, ≥, ≠, ≈, π, Δ, →, °. N'utilise JAMAIS de LaTeX (pas de $…$, pas de \\frac, pas de \\sqrt). Écris les fractions comme 3/4 ou (x + 1)/(x − 2).
- Utilise des méthodes du niveau de l'élève (collège ou lycée, programme francophone) quand c'est possible.
- Si l'élève demande seulement un indice ou de l'aide pour commencer, donne un indice sans la solution complète.
- À la fin d'un exercice résolu, propose en une phrase un exercice similaire pour s'entraîner, sans donner sa réponse.${name ? `\n\nL'utilisateur s'appelle ${name}. Tu peux l'appeler par son prénom de temps en temps, sans en abuser.` : ""}`;
}

// Combine l'annulation par le visiteur et un délai maximum.
function withTimeout(signal, ms) {
  const t = AbortSignal.timeout(ms);
  return signal && AbortSignal.any ? AbortSignal.any([signal, t]) : t;
}

// ---------- Limites anti-abus (en mémoire) ----------
const buckets = new Map(); // clé -> [timestamps]
function allow(key, max, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (list.length >= max) { buckets.set(key, list); return false; }
  list.push(now); buckets.set(key, list);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of buckets) if (!list.some(t => now - t < 3_600_000)) buckets.delete(k);
  for (const [k, v] of attempts) if (v.exp < now) attempts.delete(k);
}, 5 * 60_000).unref();

let day = new Date().toISOString().slice(0, 10);
let dayCount = 0;
function checkChatLimits(who) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= DAILY_LIMIT) return "daily_limit";
  if (!allow("chat:" + who, PER_MINUTE, 60_000)) return "rate_limited";
  dayCount++;
  return null;
}

// ---------- Jetons signés (code d'inscription + session) ----------
const b64 = s => Buffer.from(s).toString("base64url");
const unb64 = s => Buffer.from(s, "base64url").toString("utf8");
const sign = (kind, data) => crypto.createHmac("sha256", SESSION_SECRET).update(kind + "|" + data).digest("base64url");
function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function makeToken(kind, payload, extra = "") {
  const body = b64(JSON.stringify(payload));
  return body + "." + sign(kind, body + "|" + extra);
}
function readToken(kind, token, extra = "") {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, sign(kind, body + "|" + extra))) return null;
  try { const p = JSON.parse(unb64(body)); return p && p.x > Date.now() ? p : null; } catch { return null; }
}
function peekToken(token) {
  try { return JSON.parse(unb64(String(token).split(".")[0])); } catch { return null; }
}

const attempts = new Map(); // nonce -> { n, exp, used }

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function currentUser(req) {
  const p = readToken("sess", parseCookies(req).stars_session);
  return p ? { email: p.e, name: p.n } : null;
}
function sessionCookie(req, value, maxAgeSec) {
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `stars_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

// ---------- Envoi via le script Google ----------
async function callMailer(payload) {
  if (!MAIL_WEBHOOK_URL) throw new Error("mail_not_configured");
  const res = await fetch(MAIL_WEBHOOK_URL, {
    method: "POST",
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret: MAIL_WEBHOOK_SECRET, ...payload })
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`réponse inattendue du script Google (HTTP ${res.status}) — vérifie « Qui a accès : Tout le monde » : ${text.slice(0, 160).replace(/\s+/g, " ")}`); }
  if (!data.ok) throw new Error(data.error || "mail_failed");
  return data;
}

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;
function cleanName(s) {
  return String(s || "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/^[=+\-@]+/, "").trim().slice(0, 40);
}

async function authStart(req, res, ip) {
  if (!AUTH_REQUIRED) return json(res, 400, { code: "auth_disabled" });
  const body = await readJson(req);
  const email = String(body?.email || "").trim().toLowerCase();
  const name = cleanName(body?.name);
  if (!name) return json(res, 400, { code: "bad_name" });
  if (email.length > 254 || !EMAIL_RE.test(email)) return json(res, 400, { code: "bad_email" });
  if (!allow("start-ip:" + ip, 6, 10 * 60_000) || !allow("start-mail:" + email, 3, 10 * 60_000)) return json(res, 429, { code: "too_many_codes" });

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const payload = { e: email, n: name, x: Date.now() + CODE_MINUTES * 60_000, j: crypto.randomBytes(9).toString("base64url") };
  const token = makeToken("code", payload, code);
  try {
    await callMailer({ action: "send_code", email, name, code });
  } catch (e) {
    console.error("[auth] envoi du code impossible :", e.message);
    return json(res, 502, { code: e.message === "quota" ? "mail_quota" : "mail_failed" });
  }
  console.log(`[auth] code envoyé à ${email.replace(/^(.).*(@.*)$/, "$1***$2")}`);
  json(res, 200, { token, email });
}

async function authVerify(req, res, ip) {
  if (!allow("verify-ip:" + ip, 20, 10 * 60_000)) return json(res, 429, { code: "too_many_attempts" });
  const body = await readJson(req);
  const token = String(body?.token || "");
  const code = String(body?.code || "").replace(/\D/g, "");
  const peek = peekToken(token);
  if (!peek?.j || !peek?.x) return json(res, 400, { code: "bad_token" });
  if (peek.x < Date.now()) return json(res, 400, { code: "code_expired" });
  const a = attempts.get(peek.j) || { n: 0, exp: peek.x, used: false };
  if (a.used) return json(res, 400, { code: "code_used" });
  if (a.n >= CODE_ATTEMPTS) return json(res, 429, { code: "too_many_attempts" });
  const p = code.length === 6 ? readToken("code", token, code) : null;
  if (!p) {
    a.n++; attempts.set(peek.j, a);
    return json(res, 400, { code: "bad_code", left: Math.max(0, CODE_ATTEMPTS - a.n) });
  }
  a.used = true; attempts.set(peek.j, a);
  const sess = makeToken("sess", { e: p.e, n: p.n, x: Date.now() + SESSION_DAYS * 86_400_000 });
  res.setHeader("set-cookie", sessionCookie(req, sess, SESSION_DAYS * 86_400));
  callMailer({ action: "verified", email: p.e, name: p.n }).catch(e => console.warn("[auth] note dans la Google Sheet impossible :", e.message));
  console.log(`[auth] connexion de ${p.e.replace(/^(.).*(@.*)$/, "$1***$2")}`);
  json(res, 200, { email: p.e, name: p.n });
}

// ---------- Nettoyage de la conversation ----------
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGES_PER_MSG = 3;
const MAX_IMAGES_TOTAL = 6;
const MAX_IMAGE_B64 = 3_500_000; // ≈ 2,6 Mo par image
const PHOTO_ONLY_TEXT = "Voici une photo. Si c'est un exercice, lis l'énoncé et résous-le étape par étape.";

function cleanImages(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(i => i && IMAGE_TYPES.has(i.mime) && typeof i.data === "string" && i.data.length > 100 && i.data.length <= MAX_IMAGE_B64 && /^[A-Za-z0-9+/=]+$/.test(i.data))
    .slice(0, MAX_IMAGES_PER_MSG)
    .map(i => ({ mime: i.mime, data: i.data }));
}

function cleanMessages(raw) {
  if (!Array.isArray(raw)) return null;
  let msgs = raw
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content.slice(0, 12000), images: m.role === "user" ? cleanImages(m.images) : [] }))
    .filter(m => m.content.trim() || m.images.length);
  msgs = msgs.slice(-20);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const merged = [];
  for (const m of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      last.content = [last.content, m.content].filter(s => s.trim()).join("\n\n");
      last.images.push(...m.images);
    } else merged.push({ ...m, images: [...m.images] });
  }
  if (!merged.length || merged[merged.length - 1].role !== "user") return null;
  // Garde seulement les images les plus récentes.
  let budget = MAX_IMAGES_TOTAL;
  for (let i = merged.length - 1; i >= 0; i--) {
    const m = merged[i];
    if (m.images.length > budget) m.images = m.images.slice(m.images.length - budget);
    budget -= m.images.length;
    if (!m.content.trim()) m.content = PHOTO_ONLY_TEXT;
  }
  const total = merged.reduce((n, m) => n + m.content.length, 0);
  if (total > 60000) return "too_large";
  return merged;
}

const toClaude = messages => messages.map(m => ({
  role: m.role,
  content: m.images.length
    ? [...m.images.map(i => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.data } })), { type: "text", text: m.content }]
    : m.content
}));

const toGemini = messages => messages.map(m => ({
  role: m.role === "assistant" ? "model" : "user",
  parts: [...m.images.map(i => ({ inlineData: { mimeType: i.mime, data: i.data } })), { text: m.content }]
}));

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
  if (status === 429 || status === 503 || status === 529) return "upstream_busy";
  if (status === 402) return "no_credit";
  return "upstream_error";
}
// Erreurs pour lesquelles on essaie le modèle suivant.
const RETRY_NEXT = new Set([404, 429, 500, 503, 529]);

// ---------- Claude (Anthropic) ----------
async function callClaude(messages, signal, name) {
  const models = [CLAUDE_MODEL, ...CLAUDE_FALLBACKS.filter(m => m !== CLAUDE_MODEL)];
  let last = new UpstreamError("upstream_error", 404, "Aucun modèle Claude disponible");
  for (const model of models) {
    let res;
    try {
      res = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
        method: "POST",
        signal: withTimeout(signal, FIRST_BYTE_TIMEOUT_MS),
        headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, stream: true, system: rules(name), messages: toClaude(messages) })
      });
    } catch (e) {
      if (signal.aborted) throw e;
      console.warn(`[claude] ${model} ne répond pas (${e.name}), essai suivant`);
      last = new UpstreamError("upstream_busy", 504, "timeout");
      continue;
    }
    if (res.ok) return { res, model };
    const detail = await res.text().catch(() => "");
    const low = detail.toLowerCase();
    if (res.status === 400 && (low.includes("credit balance") || low.includes("billing"))) throw new UpstreamError("no_credit", res.status, detail);
    if (RETRY_NEXT.has(res.status)) { console.warn(`[claude] ${model} : HTTP ${res.status}, essai suivant`); last = new UpstreamError(codeFor(res.status), res.status, detail); continue; }
    throw new UpstreamError(codeFor(res.status), res.status, detail);
  }
  throw last;
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
async function callGemini(messages, signal, name) {
  const models = [GEMINI_MODEL, ...GEMINI_FALLBACKS.filter(m => m !== GEMINI_MODEL)];
  const contents = toGemini(messages);
  let last = new UpstreamError("upstream_error", 404, "Aucun modèle Gemini disponible");
  for (const model of models) {
    let res;
    try {
      res = await fetch(`${GEMINI_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        signal: withTimeout(signal, FIRST_BYTE_TIMEOUT_MS),
        headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: rules(name) }] },
          contents,
          generationConfig: { maxOutputTokens: MAX_TOKENS }
        })
      });
    } catch (e) {
      if (signal.aborted) throw e;
      console.warn(`[gemini] ${model} ne répond pas (${e.name}), essai suivant`);
      last = new UpstreamError("upstream_busy", 504, "timeout");
      continue;
    }
    if (res.ok) return { res, model };
    const detail = await res.text().catch(() => "");
    if (res.status === 400 && /api key not valid|api_key_invalid/i.test(detail)) throw new UpstreamError("bad_key", 401, detail);
    if (RETRY_NEXT.has(res.status)) { console.warn(`[gemini] ${model} : HTTP ${res.status}, essai suivant`); last = new UpstreamError(codeFor(res.status), res.status, detail); continue; }
    throw new UpstreamError(codeFor(res.status), res.status, detail);
  }
  throw last;
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

class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }

async function readJson(req, limit = 200_000) {
  if (!String(req.headers["content-type"] || "").includes("application/json")) throw new HttpError(415, "bad_request");
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new HttpError(413, "too_large"); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400, "bad_request"); }
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (typeof fwd === "string" && fwd.split(",")[0].trim()) || req.socket.remoteAddress || "?";
}

async function handleChat(req, res, ip) {
  const user = currentUser(req);
  if (AUTH_REQUIRED && !user) return json(res, 401, { code: "auth_required" });
  if (!provider) return json(res, 503, { code: "no_key" });

  const payload = await readJson(req, 16_000_000);
  const messages = cleanMessages(payload?.messages);
  if (messages === "too_large") return json(res, 413, { code: "too_large" });
  if (!messages) return json(res, 400, { code: "bad_request" });

  const limited = checkChatLimits(user ? user.email : ip);
  if (limited) return json(res, 429, { code: limited });

  const ac = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ac.abort(); });

  let upstream;
  try {
    upstream = provider === "claude" ? await callClaude(messages, ac.signal, user?.name) : await callGemini(messages, ac.signal, user?.name);
  } catch (e) {
    if (ac.signal.aborted) return;
    console.error(`[${provider}]`, e.code || e.message, e.status || "", (e.detail || "").slice(0, 300));
    return json(res, 502, { code: e.code || "upstream_error" });
  }

  res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" });
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
      console.error(`[${provider}] flux`, e.code || e.message, (e.detail || "").slice(0, 300));
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
  const ip = clientIp(req);
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
      return res.end(await page());
    }
    if (req.method === "GET" && url.pathname === "/healthz") return json(res, 200, { ok: true });
    if (req.method === "GET" && url.pathname === "/api/status") return json(res, 200, { ready: !!provider, provider, authRequired: AUTH_REQUIRED });
    if (req.method === "GET" && url.pathname === "/api/me") {
      const u = currentUser(req);
      return u ? json(res, 200, u) : json(res, 401, { code: "auth_required" });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/start") return await authStart(req, res, ip);
    if (req.method === "POST" && url.pathname === "/api/auth/verify") return await authVerify(req, res, ip);
    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      res.setHeader("set-cookie", sessionCookie(req, "", 0));
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/chat") return await handleChat(req, res, ip);
    json(res, 404, { code: "not_found" });
  } catch (e) {
    if (e instanceof HttpError) return res.headersSent ? res.end() : json(res, e.status, { code: e.code });
    console.error(e);
    if (!res.headersSent) json(res, 500, { code: "server_error" }); else res.end();
  }
});

// ---------- Vérifications au démarrage (résultat dans les journaux Render, sans afficher les clés) ----------
async function selfCheck() {
  try {
    if (provider === "gemini") {
      const r = await fetch(`${GEMINI_BASE_URL}/v1beta/models?pageSize=200`, { headers: { "x-goog-api-key": GEMINI_API_KEY }, signal: AbortSignal.timeout(20000) });
      const body = await r.text();
      if (!r.ok) console.error(`[vérif] Clé Gemini REFUSÉE (HTTP ${r.status}) : ${body.slice(0, 300)}`);
      else {
        const names = (JSON.parse(body).models || []).map(m => m.name.replace("models/", ""));
        console.log(`[vérif] Clé Gemini OK — ${names.length} modèles disponibles.`);
        const tests = [GEMINI_MODEL, ...GEMINI_FALLBACKS.filter(m => m !== GEMINI_MODEL)].filter(m => names.includes(m));
        for (const model of tests) {
          const t0 = Date.now();
          try {
            const g = await fetch(`${GEMINI_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
              method: "POST", signal: AbortSignal.timeout(30000),
              headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
              body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Réponds seulement : OK" }] }], generationConfig: { maxOutputTokens: 400 } })
            });
            if (g.ok) { console.log(`[vérif] ${model} répond en ${Date.now() - t0} ms.`); break; }
            console.error(`[vérif] ${model} : HTTP ${g.status} en ${Date.now() - t0} ms.`);
          } catch (e) {
            console.error(`[vérif] ${model} : pas de réponse (${e.name}) après ${Date.now() - t0} ms.`);
          }
        }
      }
    } else if (provider === "claude") {
      const r = await fetch(`${ANTHROPIC_BASE_URL}/v1/models`, { headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(20000) });
      console.log(r.ok ? "[vérif] Clé Claude OK." : `[vérif] Clé Claude REFUSÉE (HTTP ${r.status}).`);
    }
  } catch (e) {
    console.error("[vérif] Impossible de joindre l'IA :", e.message);
  }
  if (MAIL_WEBHOOK_URL) {
    try {
      const d = await callMailer({ action: "ping" });
      console.log(`[vérif] Script Google OK — e-mails encore disponibles aujourd'hui : ${d.quota}`);
    } catch (e) {
      console.error("[vérif] Script Google injoignable :", e.message);
    }
  }
}

server.listen(PORT, () => {
  console.log(`STARS AI en ligne sur le port ${PORT} — IA : ${provider ? provider + " (" + (provider === "claude" ? CLAUDE_MODEL : GEMINI_MODEL) + ")" : "AUCUNE CLÉ"} — inscription : ${AUTH_REQUIRED ? "obligatoire" : "désactivée"}`);
  if (process.env.SKIP_SELF_CHECK !== "1") selfCheck();
});
