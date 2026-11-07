// Tests de la génération d'images (sécurité, quotas, coûts) — lancer avec : node --test tests/*.test.js
// Un faux OpenAI et un faux Supabase tournent en local : aucune vraie image, aucune facturation, aucune vraie clé.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_SECRET = "test-session-secret";
const DB_SECRET = "test-db-secret";
const OPENAI_KEY = "sk-test-FAKE-openai-key-0000";
const TINY_JPEG = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

// ---------- Faux Supabase (même logique que les fonctions SQL) ----------
const usage = new Map();   // e-mail -> images du jour
const calls = [];          // { fn, email }
const openaiCalls = [];    // { headers, body }
function siteTotal() { let n = 0; for (const v of usage.values()) n += v; return n; }
function fakeRpc(fn, a) {
  const email = String(a.p_email || "").toLowerCase().trim();
  if (email === "dbdown@test.fr" && fn.startsWith("stars_image_")) throw new Error("base indisponible");
  switch (fn) {
    case "stars_me_status": return [{ used: 0, premium_until: email === "vip@test.fr" ? new Date(Date.now() + 86400_000).toISOString() : null, pending: 0 }];
    case "stars_member_remove": case "stars_member_ensure": return null;
    case "stars_conv_clear": return 0;
    case "stars_memory_get": return { enabled: true, max: 100, items: [] };
    case "stars_memory_purge": return 0;
    case "stars_image_allow": {
      const n = usage.get(email) || 0;
      if (siteTotal() >= a.p_site_limit) return { ok: false, reason: "site_limit" };
      if (n >= a.p_limit) return { ok: false, reason: "user_limit", used: n, limit: a.p_limit };
      usage.set(email, n + 1);
      return { ok: true, used: n + 1, limit: a.p_limit };
    }
    case "stars_image_refund": { const n = usage.get(email) || 0; usage.set(email, Math.max(0, n - 1)); return true; }
    case "stars_image_used": return usage.get(email) || 0;
    case "stars_image_purge": { const had = usage.has(email); usage.delete(email); return had ? 1 : 0; }
    default: throw new Error("fonction inconnue : " + fn);
  }
}
const readBody = req => new Promise(ok => { const c = []; req.on("data", d => c.push(d)); req.on("end", () => ok(Buffer.concat(c).toString("utf8"))); });

let mock;
async function mockHandler(req, res) {
  const raw = await readBody(req);
  const url = new URL(req.url, "http://x");
  let m;
  if ((m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/))) {
    const args = raw ? JSON.parse(raw) : {};
    if (args.p_secret !== DB_SECRET) { res.writeHead(403); return res.end("{}"); }
    calls.push({ fn: m[1], email: args.p_email });
    try {
      const out = fakeRpc(m[1], args);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(out === null ? "" : JSON.stringify(out));
    } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ message: e.message })); }
  }
  if (url.pathname === "/v1/images/generations") {
    const body = JSON.parse(raw);
    openaiCalls.push({ headers: req.headers, body });
    const p = body.prompt;
    const fail = (status, error) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ error })); };
    if (p.includes("REFUSE")) return fail(400, { code: "moderation_blocked", message: "Your request was rejected by the safety system. " + p });
    if (p.includes("CREDIT")) return fail(429, { code: "insufficient_quota", message: "You exceeded your current quota" });
    if (p.includes("VERIFY")) return fail(403, { message: "Your organization must be verified to use the model `gpt-image-1`." });
    if (p.includes("SLOW")) await new Promise(r => setTimeout(r, 700));
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ data: [{ b64_json: TINY_JPEG }] }));
  }
  res.writeHead(404); res.end();
}

// ---------- Lancement du vrai serveur ----------
const logs = [];
const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
async function startServer(extraEnv = {}) {
  const port = await freePort();
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH, PORT: String(port), SESSION_SECRET, AUTH_REQUIRED: "1",
      SUPABASE_URL: mockUrl, SUPABASE_KEY: "test-key", MEMBERS_SECRET: DB_SECRET,
      GEMINI_API_KEY: "test-gemini-key", GEMINI_BASE_URL: mockUrl, SKIP_SELF_CHECK: "1",
      OPENAI_API_KEY: OPENAI_KEY, OPENAI_BASE_URL: mockUrl,
      IMAGE_FREE_DAILY: "2", IMAGE_PREMIUM_DAILY: "5", IMAGE_SITE_DAILY: "1000",
      ...extraEnv
    }
  });
  child.stdout.on("data", d => logs.push(String(d)));
  child.stderr.on("data", d => logs.push(String(d)));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + "/healthz")).ok) return { base, stop: () => child.kill() }; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  child.kill();
  throw new Error("le serveur ne démarre pas :\n" + logs.join(""));
}
let S, S_OFF, S_CAP;
before(async () => {
  mock = http.createServer(mockHandler);
  await new Promise(ok => mock.listen(0, "127.0.0.1", ok));
  S = await startServer();
  S_OFF = await startServer({ OPENAI_API_KEY: "" });
  S_CAP = await startServer({ IMAGE_SITE_DAILY: "1" });
});
after(() => { S?.stop(); S_OFF?.stop(); S_CAP?.stop(); mock?.close(); });

// ---------- Outils ----------
function cookieFor(email) {
  const body = Buffer.from(JSON.stringify({ e: email, n: "Test", x: Date.now() + 3600_000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update("sess|" + body + "|").digest("base64url");
  return "stars_session=" + encodeURIComponent(body + "." + sig);
}
async function call(server, method, p, { who, body, raw } = {}) {
  const headers = {};
  if (who) headers.cookie = cookieFor(who);
  let payload;
  if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  if (raw) { headers["content-type"] = raw.type; payload = raw.body; }
  const r = await fetch(server.base + p, { method, headers, body: payload });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
const img = (who, prompt, extra = {}, server = S) => call(server, "POST", "/api/image", { who, body: { prompt, ...extra } });

// ---------- Accès ----------
test("sans connexion, la génération et le quota sont refusés (401)", async () => {
  assert.equal((await call(S, "POST", "/api/image", { body: { prompt: "un chat" } })).status, 401);
  assert.equal((await call(S, "GET", "/api/image/quota")).status, 401);
  assert.equal(openaiCalls.length, 0, "OpenAI ne doit jamais être appelé sans connexion");
});
test("sans clé OpenAI, la fonction n'existe pas (404) et rien n'est appelé", async () => {
  const r = await img("off@test.fr", "un chat astronaute", {}, S_OFF);
  assert.equal(r.status, 404);
  assert.equal(r.json.code, "images_off");
  assert.equal(openaiCalls.length, 0);
});
test("les requêtes doivent être en JSON (415)", async () => {
  const r = await call(S, "POST", "/api/image", { who: "a1@test.fr", raw: { type: "text/plain", body: "prompt=un chat" } });
  assert.equal(r.status, 415);
});

// ---------- Fonctionnement ----------
test("génère une image avec les bons paramètres, sans jamais exposer la clé OpenAI", async () => {
  const before = openaiCalls.length;
  const r = await img("a2@test.fr", "Un chat astronaute sur la Lune");
  assert.equal(r.status, 200);
  assert.ok(r.json.image.startsWith("data:image/jpeg;base64,"));
  assert.equal(r.json.used, 1);
  assert.equal(r.json.limit, 2);
  assert.ok(!r.text.includes(OPENAI_KEY), "la clé OpenAI ne doit jamais être renvoyée au navigateur");
  const c = openaiCalls[before];
  assert.equal(c.headers.authorization, "Bearer " + OPENAI_KEY);
  assert.equal(c.body.model, "gpt-image-1");
  assert.equal(c.body.quality, "low", "qualité basse par défaut : coût minimal");
  assert.equal(c.body.n, 1, "toujours une seule image par demande");
  assert.equal(c.body.size, "1024x1024");
  assert.equal(c.body.moderation, "auto");
  assert.ok(c.body.prompt.startsWith("Un chat astronaute sur la Lune"));
  assert.ok(c.body.prompt.includes("tous les publics"), "la consigne de sécurité est ajoutée");
});
test("formats : paysage, portrait, valeur inconnue → carré", async () => {
  const who = "a3@test.fr";
  const sizes = [];
  for (const s of ["paysage", "portrait"]) { const b = openaiCalls.length; await img(who, "un paysage", { size: s }); sizes.push(openaiCalls[b].body.size); usage.set(who, 0); }
  const b = openaiCalls.length; await img(who, "un paysage", { size: "99999x1" }); sizes.push(openaiCalls[b].body.size);
  assert.deepEqual(sizes, ["1536x1024", "1024x1536", "1024x1024"]);
});
test("entrées invalides : demande trop courte, trop longue", async () => {
  const before = openaiCalls.length;
  assert.equal((await img("a4@test.fr", "ab")).status, 400);
  assert.equal((await img("a4@test.fr", "x".repeat(1001))).status, 400);
  assert.equal((await img("a4@test.fr", "   ")).status, 400);
  assert.equal(openaiCalls.length, before, "aucune dépense pour une demande invalide");
});

// ---------- Quotas et coûts ----------
test("QUOTA : la limite du jour est appliquée par personne, sans effet sur les autres", async () => {
  assert.equal((await img("q1@test.fr", "image numéro un")).status, 200);
  assert.equal((await img("q1@test.fr", "image numéro deux")).status, 200);
  const before = openaiCalls.length;
  const third = await img("q1@test.fr", "image numéro trois");
  assert.equal(third.status, 429);
  assert.equal(third.json.code, "user_limit");
  assert.equal(openaiCalls.length, before, "OpenAI ne doit PAS être appelé quand la limite est atteinte");
  assert.equal((await img("q2@test.fr", "image pour une autre personne")).status, 200);
  const q = await call(S, "GET", "/api/image/quota", { who: "q1@test.fr" });
  assert.deepEqual([q.json.used, q.json.limit, q.json.premium], [2, 2, false]);
});
test("QUOTA : le Premium a une limite plus haute", async () => {
  for (let i = 0; i < 3; i++) assert.equal((await img("vip@test.fr", "image premium " + i)).status, 200);
  const q = await call(S, "GET", "/api/image/quota", { who: "vip@test.fr" });
  assert.deepEqual([q.json.used, q.json.limit, q.json.premium], [3, 5, true]);
});
test("QUOTA : le plafond global du site protège le budget", async () => {
  usage.clear();
  assert.equal((await img("s1@test.fr", "première image du site", {}, S_CAP)).status, 200);
  const before = openaiCalls.length;
  const r = await img("s2@test.fr", "deuxième image du site", {}, S_CAP);
  assert.equal(r.status, 429);
  assert.equal(r.json.code, "site_limit");
  assert.equal(openaiCalls.length, before);
});
test("REMBOURSEMENT : un refus, un manque de crédit ou un blocage OpenAI ne consomme pas le quota", async () => {
  const who = "r1@test.fr";
  const cases = [["REFUSE cette image", 422, "refused"], ["CREDIT image", 502, "no_credit"], ["VERIFY image", 502, "org_not_verified"]];
  for (const [prompt, status, code] of cases) {
    const r = await img(who, prompt);
    assert.equal(r.status, status, prompt);
    assert.equal(r.json.code, code, prompt);
    assert.equal(usage.get(who) || 0, 0, "le quota doit être rendu après " + code);
  }
  assert.equal((await img(who, "une vraie image")).json.used, 1);
});
test("SÉCURITÉ DES COÛTS : si les compteurs sont indisponibles, aucune image n'est générée", async () => {
  const before = openaiCalls.length;
  const r = await img("dbdown@test.fr", "image sans compteur");
  assert.equal(r.status, 503);
  assert.equal(r.json.code, "images_down");
  assert.equal(openaiCalls.length, before, "pas de compteur = pas de dépense");
});
test("une seule génération à la fois par personne (pas de double dépense)", async () => {
  const who = "c1@test.fr";
  const before = openaiCalls.length;
  const [a, b] = await Promise.all([img(who, "SLOW image un"), img(who, "SLOW image deux")]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 429]);
  assert.equal(openaiCalls.length, before + 1);
  assert.equal(usage.get(who), 1);
});

// ---------- Compte et confidentialité ----------
test("la suppression du compte efface les compteurs d'images", async () => {
  const who = "d1@test.fr";
  await img(who, "image avant suppression");
  assert.equal(usage.get(who), 1);
  const r = await call(S, "POST", "/api/account/delete", { who, body: {} });
  assert.equal(r.status, 200);
  assert.ok(calls.some(c => c.fn === "stars_image_purge" && c.email === who));
  assert.equal(usage.has(who), false);
});
test("les demandes d'images et la clé OpenAI n'apparaissent jamais dans les journaux", async () => {
  await img("l1@test.fr", "XYZ-demande-secrete-12345 un dragon");
  await img("l1@test.fr", "REFUSE XYZ-demande-secrete-67890");
  const all = logs.join("");
  assert.ok(!all.includes("XYZ-demande-secrete"), "la demande ne doit jamais être journalisée");
  assert.ok(!all.includes(OPENAI_KEY), "la clé OpenAI ne doit jamais être journalisée");
  assert.ok(all.includes("[images] image générée"), "l'événement est journalisé sans contenu");
});
