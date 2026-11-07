// Tests de la page (public/index.html) : le panneau « Historique » ne doit JAMAIS rester bloqué sur « Chargement ».
// Le vrai code de la page tourne dans un faux navigateur (aucun réseau, aucune vraie donnée) — lancer avec : node --test tests/*.test.js
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const SCRIPT = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];

// ---------- Vérifications statiques ----------
test("le script de la page est valide et tous les éléments qu'il cherche existent", () => {
  assert.doesNotThrow(() => new vm.Script(SCRIPT));
  const ids = new Set([...HTML.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const used = [...SCRIPT.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(used)].filter(id => !ids.has(id)), []);
});
test("les titres de discussions venant du serveur sont affichés comme du texte, jamais comme du HTML", () => {
  const a = SCRIPT.indexOf("function showHistoryState"), b = SCRIPT.indexOf("function saveLocalOnly");
  assert.ok(a > 0 && b > a);
  assert.ok(!SCRIPT.slice(a, b).includes("innerHTML"), "renderHistory / showHistoryState ne doivent pas utiliser innerHTML");
});
test("les appels de l'historique ont un délai maximum et le panneau propose « Réessayer »", () => {
  assert.ok(SCRIPT.includes("AbortSignal.timeout(15000)"));
  assert.ok(SCRIPT.includes('"Réessayer"'));
});
test("les liens Mes souvenirs et Images sont cachés par défaut", () => {
  assert.match(HTML, /id="memLink" href="\/memoire" hidden/);
  assert.match(HTML, /id="imgLink" href="\/images" hidden/);
});

// ---------- Faux navigateur ----------
class El {
  constructor(tag = "div", id = "") {
    this.tag = tag; this.id = id; this.children = []; this.listeners = {}; this.attrs = {}; this.style = {}; this.dataset = {};
    this.hidden = false; this.className = ""; this.value = ""; this.disabled = false; this.open = false; this._text = ""; this._html = "";
    const set = this.cls = new Set();
    this.classList = { add: c => set.add(c), remove: c => set.delete(c), toggle: (c, f) => (f === undefined ? (set.has(c) ? set.delete(c) : set.add(c)) : f ? set.add(c) : set.delete(c)), contains: c => set.has(c) };
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(c => (typeof c === "string" ? c : c.textContent)).join(""); }
  set innerHTML(v) { this._html = String(v); this.children = []; this._htmlSet = true; }
  get innerHTML() { return this._html; }
  append(...n) { this.children.push(...n); }
  appendChild(n) { this.children.push(n); return n; }
  insertBefore(n) { this.children.unshift(n); return n; }
  replaceChildren(...n) { this.children = n; this._text = ""; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  querySelectorAll() { return []; } querySelector() { return null; } closest() { return null; } contains() { return false; }
  insertAdjacentHTML() {} focus() {} select() {} remove() {} showModal() {} close() {} scrollIntoView() {} reset() {}
  getContext() { return new Proxy({}, { get: () => () => {}, set: () => true }); }
  get lastChild() { return this.children.at(-1); }
  click() { return Promise.all((this.listeners.click || []).map(fn => fn({ target: this, preventDefault() {} }))); }
}
const walk = (el, fn) => { fn(el); for (const c of el.children || []) if (c && typeof c === "object") walk(c, fn); };
const buttons = el => { const out = []; walk(el, e => { if (e.tag === "button") out.push(e); }); return out; };

// scenario.route(url, opts) -> { status, body } ; scenario.hang = true => les requêtes d'historique ne répondent jamais
async function openPage(route, { hang = false } = {}) {
  const els = new Map(), store = new Map(), flashes = [], fetchLog = [];
  const get = id => { if (!els.has(id)) els.set(id, new El("div", id)); return els.get(id); };
  const doc = {
    getElementById: get, createElement: t => new El(t), querySelectorAll: () => [], querySelector: () => null,
    addEventListener() {}, referrer: "", hidden: false, documentElement: new El(), body: new El("body")
  };
  const sandbox = {
    document: doc, navigator: { language: "fr-FR" }, location: { href: "" },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    crypto: { randomUUID: () => globalThis.crypto.randomUUID() },
    matchMedia: () => ({ matches: false }), addEventListener() {}, requestAnimationFrame() {}, devicePixelRatio: 1,
    Image: class extends El { constructor() { super("img"); } },
    prompt: () => null, confirm: () => true, console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, JSON, Math, Date, URL, TextDecoder, AbortController,
    AbortSignal: { timeout: ms => AbortSignal.timeout(Math.min(ms, 80)) }, // délai raccourci pour tester le cas « le serveur ne répond pas »
    fetch: (url, opts = {}) => new Promise((ok, ko) => {
      fetchLog.push({ url, method: opts.method || "GET" });
      if (hang && String(url).startsWith("/api/conversations")) { opts.signal?.addEventListener("abort", () => ko(Object.assign(new Error("timeout"), { name: "TimeoutError" }))); return; }
      const { status, body } = route(String(url), opts);
      ok({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    })
  };
  // comme dans la vraie page : le panneau commence par afficher « Chargement de tes discussions… »
  const initial = new El("div"); initial.className = "history-empty"; initial.textContent = "Chargement de tes discussions…"; get("historyList").append(initial);
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT, sandbox);
  await until(() => get("composerWrap").hidden === false, 3000);
  await new Promise(r => setTimeout(r, 100));
  return { get, flashes, fetchLog, store, listText: () => get("historyList").textContent, list: () => get("historyList") };
}
async function until(cond, ms = 2000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 15)); }
  return false;
}

const ME = { name: "Alice", email: "alice@test.fr", freeDaily: 25, price: 1000, memory: true, images: false };
const baseRoute = extra => (url, opts) => {
  if (url === "/api/status") return { status: 200, body: { ready: true, authRequired: true, passwords: true, passwordMin: 8 } };
  if (url === "/api/me") return { status: 200, body: ME };
  return extra(url, opts);
};
const ID1 = "11111111-1111-4111-8111-111111111111";

// ---------- Le problème de l'utilisateur ----------
test("BUG D'ORIGINE : serveur sans historique (404) → le panneau affiche une erreur avec « Réessayer », jamais « Chargement » pour toujours", async () => {
  const page = await openPage(baseRoute(() => ({ status: 404, body: { code: "not_found" } })));
  await page.get("historyToggle").click();
  await until(() => !page.listText().includes("Chargement"));
  assert.ok(!page.listText().includes("Chargement"), "le panneau reste bloqué sur Chargement : " + page.listText());
  assert.match(page.listText(), /pas disponible/);
  assert.deepEqual(buttons(page.list()).map(b => b.textContent), ["Réessayer"]);
});
test("le serveur ne répond jamais → le panneau finit par afficher une erreur (délai maximum)", async () => {
  const page = await openPage(baseRoute(() => ({ status: 404, body: {} })), { hang: true });
  await page.get("historyToggle").click();
  await until(() => !page.listText().includes("Chargement"), 3000);
  assert.ok(!page.listText().includes("Chargement"), page.listText());
  assert.match(page.listText(), /Impossible de charger/);
  assert.deepEqual(buttons(page.list()).map(b => b.textContent), ["Réessayer"]);
});
test("session expirée → message clair", async () => {
  const page = await openPage(baseRoute(url => (url.startsWith("/api/conversations") ? { status: 401, body: { code: "auth_required" } } : { status: 200, body: {} })));
  await page.get("historyToggle").click();
  await until(() => /session a expiré/.test(page.listText()));
  assert.match(page.listText(), /session a expiré/);
});

// ---------- Le cas qui marche ----------
test("serveur normal → les discussions s'affichent, titres en texte (pas de HTML injecté)", async () => {
  const evil = '<img src=x onerror="alert(1)">Titre';
  const page = await openPage(baseRoute(url => {
    if (url === "/api/conversations") return { status: 200, body: { items: [{ id: ID1, title: evil }, { id: "22222222-2222-4222-8222-222222222222", title: "Mes volcans" }] } };
    if (url.startsWith("/api/conversations/")) return { status: 200, body: { item: { id: ID1, title: evil, messages: [{ role: "user", content: "Bonjour" }, { role: "assistant", content: "Salut" }] } } };
    return { status: 404, body: {} };
  }));
  await page.get("historyToggle").click();
  await until(() => page.listText().includes("Mes volcans"));
  const titles = []; walk(page.list(), e => { if (e.className === "history-open") titles.push(e.textContent); });
  assert.deepEqual(titles, [evil, "Mes volcans"]);
  assert.equal(page.list()._htmlSet, undefined, "la liste ne doit jamais recevoir de HTML");
  walk(page.list(), e => assert.ok(!e._htmlSet, "aucun élément du panneau ne doit utiliser innerHTML"));
  assert.ok(!page.listText().includes("Chargement"));
});
test("« Réessayer » : la première tentative échoue, la deuxième réussit", async () => {
  let calls = 0;
  const page = await openPage(baseRoute(url => {
    if (url === "/api/conversations") { calls++; return calls <= 2 ? { status: 503, body: { code: "history_down" } } : { status: 200, body: { items: [{ id: ID1, title: "Revenue !" }] } }; }
    return { status: 404, body: {} };
  }));
  await page.get("historyToggle").click();
  await until(() => buttons(page.list()).some(b => b.textContent === "Réessayer"));
  const retry = buttons(page.list()).find(b => b.textContent === "Réessayer");
  assert.ok(retry, "le bouton Réessayer doit exister");
  await retry.click();
  await until(() => page.listText().includes("Revenue !"));
  assert.match(page.listText(), /Revenue !/);
});
test("liste vide → message clair, pas de chargement infini", async () => {
  const page = await openPage(baseRoute(url => (url === "/api/conversations" ? { status: 200, body: { items: [] } } : { status: 404, body: {} })));
  await page.get("historyToggle").click();
  await until(() => /apparaîtront ici/.test(page.listText()));
  assert.match(page.listText(), /apparaîtront ici/);
});

// ---------- Effacer l'historique ----------
test("« Effacer tout l'historique » appelle le serveur et vide la liste", async () => {
  let cleared = false;
  const page = await openPage(baseRoute((url, opts) => {
    if (url === "/api/conversations/clear") { cleared = true; return { status: 200, body: { ok: true, deleted: 1 } }; }
    if (url === "/api/conversations") return { status: 200, body: { items: cleared ? [] : [{ id: ID1, title: "À effacer" }] } };
    if (url.startsWith("/api/conversations/")) return { status: 200, body: { item: { id: ID1, title: "À effacer", messages: [] } } };
    return { status: 404, body: {} };
  }));
  await page.get("historyToggle").click();
  await until(() => page.listText().includes("À effacer"));
  await page.get("historyClear").click();
  assert.ok(cleared, "le serveur doit être appelé");
  assert.match(page.listText(), /apparaîtront ici/);
});

// ---------- Liens du menu ----------
test("les liens Mes souvenirs / Images n'apparaissent que si le serveur les propose", async () => {
  const page = await openPage(baseRoute(() => ({ status: 200, body: { items: [] } })));
  assert.equal(page.get("memLink").hidden, false, "memory=true → lien visible");
  assert.equal(page.get("imgLink").hidden, true, "images=false → lien caché");
});
