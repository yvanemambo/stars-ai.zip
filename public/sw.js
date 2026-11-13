// YvanAI — service worker : rend l'appli installable et affiche une page claire quand il n'y a pas d'internet.
// Les messages à l'IA (/api/...) ne passent jamais par le cache.
const CACHE = "yvanai-v3";
const SHELL = ["/offline.html", "/icons/yvanai-icon.svg", "/icons/yvanai-favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Pages : toujours la version en ligne ; la page « pas de connexion » seulement si le réseau manque.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  // Icônes et manifeste : depuis le cache si possible.
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
  }
});

// Notification pour le propriétaire : nouvelle demande de paiement Premium.
// Le serveur envoie un signal vide ; on va chercher le détail dans le tableau de bord.
const METHOD = { wave: "Wave", orange: "Orange Money", mtn: "MTN MoMo", moov: "Moov Money" };
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let title = "YvanAI", body = "Ouvre ton tableau de bord YvanAI.";
    try {
      const r = await fetch("/api/admin/overview", { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        const pending = d.pending || [];
        if (pending.length) {
          const last = pending[pending.length - 1];
          title = "💰 Paiement Premium à vérifier";
          body = (last.name || last.email) + " · " + (METHOD[last.method] || last.method) + " · " + last.amount + " FCFA"
            + (pending.length > 1 ? " — " + pending.length + " paiements à vérifier" : "") + ". Touche pour vérifier.";
        } else {
          body = "Aucun paiement en attente. Les notifications marchent bien ✓";
        }
      }
    } catch (e) {}
    await self.registration.showNotification(title, {
      body, icon: "/icons/yvanai-icon.svg", badge: "/icons/yvanai-favicon.svg",
      tag: "stars-payment", renotify: true, data: { url: "/admin" }
    });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).pathname === target && "focus" in w) return w.focus();
    }
    return self.clients.openWindow(target);
  })());
});
