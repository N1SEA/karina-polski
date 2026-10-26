// Офлайн-кеш. Під час оновлення файлів збільшуйте VERSION.
var VERSION = "kp-v3";
var FILES = ["./", "index.html", "styles.css", "app.js", "data.js", "srs.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Спершу мережа (щоб бачити оновлення), без мережі — кеш. API не кешуємо.
self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.indexOf("/api/") === 0) return;
  var fromCache = function () { return caches.match(e.request).then(function (r) { return r || caches.match("index.html"); }); };
  var net = fetch(e.request).then(function (res) {
    var copy = res.clone();
    if (res.ok) caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
    return res;
  });
  // Слабкий інтернет: через 3 с віддаємо кеш, мережа оновить його у фоні.
  var slow = new Promise(function (resolve) { setTimeout(resolve, 3000); }).then(fromCache);
  e.respondWith(Promise.race([net, slow]).then(function (r) { return r || net; }).catch(fromCache));
});
