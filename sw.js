// Офлайн-кеш. Під час оновлення файлів збільшуйте VERSION.
var VERSION = "kp-v5";
var FILES = ["./", "index.html", "styles.css", "app.js", "data.js", "srs.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Спершу мережа (щоб бачити оновлення), без мережі або при слабкому зв'язку — кеш. API не кешуємо.
self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.indexOf("/api/") >= 0) return;
  var page = e.request.mode === "navigate";
  // Сторінка без кешу — index.html (застосунок сам відкриє потрібний екран); файли — лише точний збіг.
  var fromCache = function () {
    return caches.match(e.request).then(function (r) { return r || (page ? caches.match("index.html") : undefined); });
  };
  // no-cache: оминаємо HTTP-кеш GitHub Pages (max-age=600), щоб оновлення приходили одразу.
  var net = fetch(e.request, { cache: "no-cache" }).then(function (res) {
    if (res.ok) {
      var copy = res.clone();
      e.waitUntil(caches.open(VERSION).then(function (c) { return c.put(e.request, copy); }));
    }
    return res;
  });
  // Слабкий інтернет: через 3 с віддаємо кеш, мережа оновить його у фоні.
  var slow = new Promise(function (resolve) { setTimeout(resolve, 3000); }).then(fromCache);
  e.respondWith(
    Promise.race([net, slow])
      .then(function (r) { return r || net; })
      .catch(function () { return fromCache().then(function (r) { return r || Response.error(); }); })
  );
});
