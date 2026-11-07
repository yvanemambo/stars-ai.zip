// Tests de sécurité et de fonctionnement du serveur (mémoire) — lancer avec : node --test tests/*.test.js
// Un faux Supabase et une fausse IA tournent en local : aucun réseau, aucune vraie donnée, aucune vraie clé.
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

// ---------- Faux Supabase (même logique que les fonctions SQL : tout est filtré par l'e-mail) + fausse IA ----------
const db = new Map(); // e-mail -> { enabled, items }
let nextId = 1;
const calls = [];          // { fn, email }
const chatRequests = [];   // requêtes de chat reçues par la fausse IA
const extractRequests = [];
let extractionAnswer = { memories: [] };
let mock;

const md5 = s => crypto.createHash("md5").update(s.toLowerCase()).digest("hex");
function store(email) { if (!db.has(email)) db.set(email, { enabled: true, items: [] }); return db.get(email); }
function fakeRpc(fn, a) {
  const email = String(a.p_email || "").toLowerCase().trim();
  const now = new Date().toISOString();
  switch (fn) {
    case "stars_chat_allow": return [{ allowed: true, used: 1, premium_until: null }];
    case "stars_member_remove": case "stars_member_ensure": case "stars_member_login": return null;
    case "stars_conv_clear": return 0;
    case "stars_memory_get": {
      const s = store(email);
      return { enabled: s.enabled, max: 100, items: [...s.items].sort((x, y) => y.id - x.id) };
    }
    case "stars_memory_add": {
      const s = store(email);
      const content = String(a.p_content || "").replace(/\s+/g, " ").trim();
      if (!content || content.length > 500) return { ok: false, reason: "bad_content" };
      if (!s.enabled && a.p_source !== "manuel") return { ok: false, reason: "disabled" };
      if (s.items.length >= 100) return { ok: false, reason: "full" };
      if (s.items.some(i => md5(i.content) === md5(content))) return { ok: false, reason: "duplicate" };
      const item = { id: nextId++, content, kind: a.p_kind || "info", source: a.p_source || "auto", created_at: now, updated_at: now };
      s.items.push(item);
      return { ok: true, id: item.id };
    }
    case "stars_memory_update": {
      const it = store(email).items.find(i => i.id === Number(a.p_id)); // filtré par e-mail
      if (!it) return { ok: false, reason: "not_found" };
      it.content = String(a.p_content).replace(/\s+/g, " ").trim();
      if (["info", "projet", "preference"].includes(a.p_kind)) it.kind = a.p_kind;
      it.updated_at = now;
      return { ok: true, id: it.id };
    }
    case "stars_memory_delete": {
      const s = store(email), n = s.items.length;
      s.items = s.items.filter(i => i.id !== Number(a.p_id));
      return s.items.length < n;
    }
    case "stars_memory_clear": { const s = store(email), n = s.items.length; s.items = []; return n; }
    case "stars_memory_set_enabled": store(email).enabled = a.p_enabled; return a.p_enabled;
    case "stars_memory_purge": { const n = store(email).items.length; db.delete(email); return n; }
    default: throw new Error("fonction inconnue : " + fn);
  }
}

function readBody(req) {
  return new Promise(ok => { const c = []; req.on("data", d => c.push(d)); req.on("end", () => ok(Buffer.concat(c).toString("utf8"))); });
}
async function mockHandler(req, res) {
  const body = await readBody(req);
  const url = new URL(req.url, "http://x");
  let m;
  if ((m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/))) {
    const args = body ? JSON.parse(body) : {};
    if (args.p_secret !== DB_SECRET) { res.writeHead(403); return res.end('{"message":"forbidden"}'); }
    calls.push({ fn: m[1], email: args.p_email });
    try {
      const out = fakeRpc(m[1], args);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(out === null ? "" : JSON.stringify(out));
    } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ message: e.message })); }
  }
  if (url.pathname.endsWith(":streamGenerateContent")) {
    chatRequests.push(JSON.parse(body));
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text: "Salut !" }] }, finishReason: "STOP" }] }) + "\n\n");
    return res.end();
  }
  if (url.pathname.endsWith(":generateContent")) {
    extractRequests.push(JSON.parse(body));
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(extractionAnswer) }] } }] }));
  }
  res.writeHead(404); res.end();
}

// ---------- Lancement du vrai serveur (server.js) contre ces faux services ----------
const logs = [];
async function freePort() {
  return new Promise(ok => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
}
async function startServer(extraEnv = {}) {
  const port = await freePort();
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH, PORT: String(port), SESSION_SECRET, AUTH_REQUIRED: "1",
      SUPABASE_URL: mockUrl, SUPABASE_KEY: "test-key", MEMBERS_SECRET: DB_SECRET,
      GEMINI_API_KEY: "test-gemini-key", GEMINI_BASE_URL: mockUrl, SKIP_SELF_CHECK: "1", PER_IP_PER_MINUTE: "500",
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

let S, S_OFF;
before(async () => {
  mock = http.createServer(mockHandler);
  await new Promise(ok => mock.listen(0, "127.0.0.1", ok));
  S = await startServer();
  S_OFF = await startServer({ MEMORY_ENABLED: "0" });
});
after(() => { S?.stop(); S_OFF?.stop(); mock?.close(); });

// ---------- Outils de test ----------
function cookieFor(email, name = "Test") {
  const body = Buffer.from(JSON.stringify({ e: email, n: name, x: Date.now() + 3600_000 })).toString("base64url");
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
const api = (method, p, opt) => call(S, method, p, opt);
async function chat(who, text, server = S) {
  const before = chatRequests.length;
  const r = await call(server, "POST", "/api/chat", { who, body: { messages: [{ role: "user", content: text }] } });
  assert.equal(r.status, 200, "chat : " + r.text);
  assert.ok(chatRequests.length > before, "la fausse IA n'a rien reçu");
  return chatRequests.at(-1).systemInstruction.parts[0].text; // consignes envoyées à l'IA
}
const items = email => store(email).items;
async function waitFor(cond, ms = 4000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 60)); }
  return false;
}
const ALICE = "alice@test.fr", BOB = "bob@test.fr";

// ---------- Authentification ----------
test("sans connexion, toutes les routes mémoire refusent (401)", async () => {
  assert.equal((await api("GET", "/api/memory")).status, 401);
  for (const p of ["add", "update", "delete", "clear", "setting"]) {
    assert.equal((await api("POST", "/api/memory/" + p, { body: { text: "x", id: 1, enabled: false } })).status, 401, p);
  }
});
test("un cookie de session falsifié est refusé", async () => {
  const bad = cookieFor(ALICE).replace(/.$/, c => (c === "A" ? "B" : "A"));
  const r = await fetch(S.base + "/api/memory", { headers: { cookie: bad } });
  assert.equal(r.status, 401);
});
test("les requêtes d'écriture doivent être en JSON (protection contre les formulaires d'autres sites)", async () => {
  const r = await api("POST", "/api/memory/add", { who: ALICE, raw: { type: "text/plain", body: "text=salut" } });
  assert.equal(r.status, 415);
});

// ---------- Fonctionnement ----------
test("ajouter, lire, modifier, supprimer un souvenir", async () => {
  const who = "carol@test.fr";
  let r = await api("POST", "/api/memory/add", { who, body: { text: "Prépare un exposé sur les volcans", kind: "projet" } });
  assert.equal(r.status, 200);
  const id = r.json.id;
  r = await api("GET", "/api/memory", { who });
  assert.equal(r.json.items.length, 1);
  assert.equal(r.json.items[0].content, "Prépare un exposé sur les volcans");
  assert.equal(r.json.items[0].source, "manuel");
  assert.ok(!r.text.includes("@"), "l'API ne doit pas renvoyer d'e-mail");
  assert.equal((await api("POST", "/api/memory/update", { who, body: { id, text: "Exposé sur les volcans terminé", kind: "info" } })).status, 200);
  r = await api("GET", "/api/memory", { who });
  assert.equal(r.json.items[0].content, "Exposé sur les volcans terminé");
  assert.equal(r.json.items[0].kind, "info");
  assert.equal((await api("POST", "/api/memory/add", { who, body: { text: "exposé sur les volcans TERMINÉ" } })).status, 409, "doublon");
  assert.equal((await api("POST", "/api/memory/delete", { who, body: { id } })).status, 200);
  assert.equal((await api("GET", "/api/memory", { who })).json.items.length, 0);
  assert.equal((await api("POST", "/api/memory/delete", { who, body: { id } })).status, 404);
});
test("entrées invalides : id non numérique, texte vide, réglage non booléen", async () => {
  const who = "carol@test.fr";
  assert.equal((await api("POST", "/api/memory/delete", { who, body: { id: "1; drop table" } })).status, 400);
  assert.equal((await api("POST", "/api/memory/add", { who, body: { text: "  " } })).status, 400);
  assert.equal((await api("POST", "/api/memory/setting", { who, body: { enabled: "non" } })).status, 400);
});
test("limite de 100 souvenirs", async () => {
  const who = "hank@test.fr";
  for (let i = 0; i < 100; i++) fakeRpc("stars_memory_add", { p_email: who, p_content: "souvenir " + i, p_source: "auto" });
  const r = await api("POST", "/api/memory/add", { who, body: { text: "un de trop" } });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, "full");
});

// ---------- Isolation entre utilisateurs ----------
test("ISOLATION : un utilisateur ne voit, ne modifie et n'efface jamais les souvenirs d'un autre", async () => {
  const a = await api("POST", "/api/memory/add", { who: ALICE, body: { text: "Prépare un exposé sur les volcans", kind: "projet" } });
  assert.equal(a.status, 200);
  const idA = a.json.id;

  // Bob ne voit rien, même s'il essaie de forcer l'e-mail dans l'adresse
  assert.equal((await api("GET", "/api/memory", { who: BOB })).json.items.length, 0);
  assert.equal((await api("GET", "/api/memory?email=" + ALICE + "&p_email=" + ALICE, { who: BOB })).json.items.length, 0);

  // Bob envoie l'e-mail d'Alice dans le corps : ça s'enregistre chez BOB, jamais chez Alice
  const before = calls.length;
  const b = await api("POST", "/api/memory/add", { who: BOB, body: { email: ALICE, p_email: ALICE, text: "Aime le football" } });
  assert.equal(b.status, 200);
  const used = calls.slice(before).filter(c => c.fn === "stars_memory_add").map(c => c.email);
  assert.deepEqual(used, [BOB], "le serveur doit utiliser l'e-mail de la session");
  assert.equal(items(ALICE).length, 1);
  assert.equal(items(BOB).length, 1);

  // Bob ne peut ni modifier ni supprimer le souvenir d'Alice
  assert.equal((await api("POST", "/api/memory/update", { who: BOB, body: { id: idA, text: "piraté" } })).status, 404);
  assert.equal((await api("POST", "/api/memory/delete", { who: BOB, body: { id: idA } })).status, 404);
  assert.equal(items(ALICE)[0].content, "Prépare un exposé sur les volcans");

  // Tout effacer et désactiver chez Bob n'affecte pas Alice
  assert.equal((await api("POST", "/api/memory/clear", { who: BOB, body: {} })).json.deleted, 1);
  assert.equal((await api("POST", "/api/memory/setting", { who: BOB, body: { enabled: false } })).status, 200);
  assert.equal(items(ALICE).length, 1);
  assert.equal(store(ALICE).enabled, true);
  await api("POST", "/api/memory/setting", { who: BOB, body: { enabled: true } });
});
test("ISOLATION : les souvenirs d'Alice ne sont envoyés à l'IA que dans SES conversations", async () => {
  const forAlice = await chat(ALICE, "Bonjour");
  assert.ok(forAlice.includes("volcans") && forAlice.includes("<souvenirs>"), "Alice doit voir ses souvenirs");
  const forBob = await chat(BOB, "Bonjour");
  assert.ok(!forBob.includes("volcans"), "Bob ne doit jamais recevoir un souvenir d'Alice");
  assert.ok(forBob.includes("aucune note"), "Bob n'a aucun souvenir");
});

// ---------- Informations sensibles ----------
test("les mots de passe, clés et cartes sont refusés (page Mes souvenirs)", async () => {
  const who = "dora@test.fr";
  for (const text of ["mon mot de passe est abc12345", "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv", "carte 4111 1111 1111 1111", "clé : AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q"]) {
    const r = await api("POST", "/api/memory/add", { who, body: { text } });
    assert.equal(r.status, 400, text);
    assert.equal(r.json.code, "sensitive");
  }
  assert.equal(items(who).length, 0);
});

// ---------- « Retiens que… » / « Oublie que… » dans le chat ----------
test("« Retiens que… » enregistre le souvenir et l'IA est informée", async () => {
  const who = "dave@test.fr";
  const prompt = await chat(who, "Retiens que je prépare le bac en juin");
  assert.equal(items(who).length, 1);
  assert.equal(items(who)[0].source, "demande");
  assert.match(items(who)[0].content, /prépare le bac en juin/);
  assert.ok(prompt.includes("vient d'être enregistré"));
});
test("« Retiens que mon mot de passe… » est refusé, rien n'est enregistré", async () => {
  const who = "dave@test.fr";
  const n = items(who).length;
  const prompt = await chat(who, "Retiens que mon mot de passe est hunter2");
  assert.equal(items(who).length, n);
  assert.ok(prompt.includes("information confidentielle"));
  assert.ok(!prompt.includes("hunter2"), "la valeur secrète ne doit jamais être transmise");
});
test("« Oublie que… » supprime seulement le bon souvenir de la bonne personne", async () => {
  const who = "dave@test.fr";
  const aliceBefore = items(ALICE).length;
  const prompt = await chat(who, "Oublie que je prépare le bac");
  assert.equal(items(who).length, 0);
  assert.ok(prompt.includes("a été supprimé"));
  assert.equal(items(ALICE).length, aliceBefore);
});
test("« Oublie tout » ne supprime rien automatiquement", async () => {
  const who = "dave2@test.fr";
  fakeRpc("stars_memory_add", { p_email: who, p_content: "Aime les maths", p_source: "auto" });
  const prompt = await chat(who, "Oublie tout");
  assert.equal(items(who).length, 1);
  assert.ok(prompt.includes("/memoire"));
});

// ---------- Désactivation ----------
test("mémoire désactivée : souvenirs non utilisés, rien de nouveau retenu, aucune extraction", async () => {
  const who = "erin@test.fr";
  assert.equal((await api("POST", "/api/memory/setting", { who, body: { enabled: false } })).status, 200);
  assert.equal((await api("POST", "/api/memory/add", { who, body: { text: "Aime le chocolat" } })).status, 200); // l'ajout manuel reste possible
  const extractBefore = extractRequests.length;
  const prompt = await chat(who, "Je prépare un exposé sur les volcans pour vendredi");
  assert.ok(prompt.includes("désactivée"));
  assert.ok(!prompt.includes("chocolat"), "un souvenir ne doit pas être utilisé quand la mémoire est désactivée");
  const p2 = await chat(who, "Retiens que je suis en terminale");
  assert.equal(items(who).length, 1);
  assert.ok(p2.includes("désactivée"));
  await new Promise(r => setTimeout(r, 500));
  assert.equal(extractRequests.length, extractBefore, "aucune extraction quand la mémoire est désactivée");
});
test("MEMORY_ENABLED=0 coupe toute la mémoire du site", async () => {
  const who = "erin@test.fr";
  const r = await call(S_OFF, "GET", "/api/memory", { who });
  assert.equal(r.status, 404);
  assert.equal(r.json.code, "memory_off");
  const prompt = await chat("alice@test.fr", "Bonjour", S_OFF);
  assert.ok(!prompt.includes("MÉMOIRE") && !prompt.includes("volcans"));
});

// ---------- Mémorisation automatique ----------
test("mémorisation automatique : garde le fait utile, jette le mot de passe, ne se lance pas pour une question banale", async () => {
  const who = "frank@test.fr";
  extractionAnswer = { memories: [
    { text: "Prépare un site web pour son école", kind: "projet", replaces: null },
    { text: "Mot de passe : abc12345", kind: "info", replaces: null }
  ] };
  const before = extractRequests.length;
  await chat(who, "Je prépare un site web pour mon école");
  assert.ok(await waitFor(() => items(who).length >= 1), "le souvenir automatique n'a pas été enregistré");
  assert.equal(items(who).length, 1, "le mot de passe ne doit pas être enregistré");
  assert.equal(items(who)[0].source, "auto");
  assert.equal(items(who)[0].kind, "projet");
  assert.equal(extractRequests.length, before + 1);
  const sent = JSON.stringify(extractRequests.at(-1));
  assert.ok(!sent.includes("volcans"), "l'extraction ne doit contenir que les souvenirs de cette personne");

  await chat(who, "Quelle est la capitale de la France ?");
  await new Promise(r => setTimeout(r, 400));
  assert.equal(extractRequests.length, before + 1, "une question banale ne déclenche pas d'extraction");
});

// ---------- Suppression de compte ----------
test("la suppression du compte efface les souvenirs et le réglage", async () => {
  const who = "gina@test.fr";
  await api("POST", "/api/memory/add", { who, body: { text: "Prépare le concours d'entrée" } });
  await api("POST", "/api/memory/setting", { who, body: { enabled: false } });
  assert.equal(items(who).length, 1);
  const r = await api("POST", "/api/account/delete", { who, body: {} });
  assert.equal(r.status, 200);
  assert.ok(calls.some(c => c.fn === "stars_memory_purge" && c.email === who));
  assert.equal(db.has(who), false, "souvenirs et réglage doivent avoir disparu");
});

// ---------- Confidentialité des journaux ----------
test("le contenu des souvenirs n'apparaît jamais dans les journaux du serveur", async () => {
  const all = logs.join("");
  for (const secret of ["volcans", "hunter2", "abc12345", "prépare le bac", "site web pour son école"]) {
    assert.ok(!all.includes(secret), `« ${secret} » ne doit pas être dans les journaux`);
  }
});
