// Інтерфейс застосунку. Дані — data.js (DATA, CATS), логіка — srs.js (SRS).
(function () {
  "use strict";

  // ---------- стан ----------
  var KEY = "kp_v1";
  var DAY = 86400000;
  var MAX_CHAT = 80;
  // Приводить збережений або імпортований стан до правильної форми.
  function normalize(o) {
    o = o && typeof o === "object" ? o : {};
    var obj = function (v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; };
    var s = {};
    ["srs", "wrong", "tickets", "story", "plan", "settings", "streak", "today"].forEach(function (k) { s[k] = obj(o[k]); });
    s.extra = (Array.isArray(o.extra) ? o.extra : []).filter(function (d) {
      return d && typeof d === "object" && ["cat", "q", "qu", "a", "au", "at"].every(function (k) { return typeof d[k] === "string" && d[k]; });
    });
    s.chat = (Array.isArray(o.chat) ? o.chat : []).filter(function (m) { return m && typeof m.text === "string" && (m.role === "examiner" || m.role === "karina"); }).slice(-MAX_CHAT);
    var isDate = function (v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); };
    if (!isDate(s.settings.start)) s.settings.start = dstr(Date.now());
    if (s.settings.interview && !isDate(s.settings.interview)) delete s.settings.interview;
    ["srs", "tickets"].forEach(function (k) { Object.keys(s[k]).forEach(function (id) { if (!s[k][id] || typeof s[k][id] !== "object") delete s[k][id]; }); });
    ["story"].forEach(function (k) { Object.keys(s[k]).forEach(function (id) { if (typeof s[k][id] !== "string") delete s[k][id]; }); });
    return s;
  }
  var S = normalize(read());
  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  var saveWarned = false;
  function save() {
    if (S.chat.length > MAX_CHAT) S.chat = S.chat.slice(-MAX_CHAT);
    try { localStorage.setItem(KEY, JSON.stringify(S)); saveWarned = false; }
    catch (e) {
      if (!saveWarned) { saveWarned = true; toast("Не вдалося зберегти прогрес. Збережіть копію в «Я → Налаштування»."); }
    }
  }

  var byId = {}, ITEMS = [];
  function allItems() { return ITEMS; }
  function reindex() {
    byId = {};
    ITEMS = DATA.concat(S.extra).map(function (raw) { var d = Object.assign({}, raw); d._id = SRS.idOf(raw); return d; });
    ITEMS.forEach(function (d) { byId[d._id] = d; });
  }
  function ids(filter) { return ITEMS.filter(filter || function () { return true; }).map(function (d) { return d._id; }); }
  reindex();
  var CAT = {}; CATS.forEach(function (c) { CAT[c.id] = c; });
  // Особисті питання з шаблонами [..] не годяться для тестів з варіантами.
  function quizable(d) { return d.a.indexOf("[") < 0; }
  var TICKETS = SRS.tickets(ITEMS.filter(function (d) { return !d.ai && quizable(d); }).map(function (d) { return d._id; }), 10);
  // Результат білета зберігається за його складом: зміни в банку не переносять оцінки на інші білети.
  function ticketKey(i) { return TICKETS[i] ? "t" + SRS.idOf({ cat: "", q: TICKETS[i].join(",") }) : ""; }
  function ticketResult(i) { var r = S.tickets[ticketKey(i)]; return r && typeof r === "object" ? r : null; }

  // ---------- дати ----------
  function dstr(t) { var d = new Date(t); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dayStart(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]).getTime(); }
  function todayStr() { return dstr(Date.now()); }
  function dayN() { return Math.max(1, Math.min(30, Math.round((dayStart(todayStr()) - dayStart(S.settings.start)) / DAY) + 1)); }
  function daysLeft() { return S.settings.interview ? Math.round((dayStart(S.settings.interview) - dayStart(todayStr())) / DAY) : null; }

  function today() {
    if (S.today.date !== todayStr()) S.today = { date: todayStr(), cards: 0, tests: 0, chats: 0 };
    return S.today;
  }
  function touch(kind) {
    today()[kind]++;
    var t = todayStr();
    if (S.streak.last !== t) {
      S.streak.count = S.streak.last === dstr(Date.now() - DAY) ? (S.streak.count || 0) + 1 : 1;
      S.streak.last = t;
    }
    save();
  }
  function streak() { return S.streak.last === todayStr() || S.streak.last === dstr(Date.now() - DAY) ? S.streak.count || 0 : 0; }

  // ---------- утиліти ----------
  var view = document.getElementById("view");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pron(at) { return esc(at).replace(/[АЕЄИІЇОУЮЯ]/g, '<b class="st">$&</b>'); }
  function plural(n, one, few, many) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many; }
  // Одна постійна live-область, щоб екранні читачі оголошували кожне повідомлення.
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role", "status"); toastEl.hidden = true; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }
  function go(h) { if (location.hash === h) render(); else location.hash = h; }

  var I = {
    home: '<path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/>',
    cards: '<path d="M3.604 7.197l7.138 -3.109a.96 .96 0 0 1 1.27 .527l4.924 11.902a1 1 0 0 1 -.514 1.304l-7.137 3.109a.96 .96 0 0 1 -1.271 -.527l-4.924 -11.903a1 1 0 0 1 .514 -1.304z"/><path d="M15 4h1a1 1 0 0 1 1 1v3.5"/><path d="M20 6c.264 .112 .52 .217 .768 .315a1 1 0 0 1 .53 1.311l-2.298 5.374"/>',
    tests: '<path d="M3.5 5.5l1.5 1.5l2.5 -2.5"/><path d="M3.5 11.5l1.5 1.5l2.5 -2.5"/><path d="M3.5 17.5l1.5 1.5l2.5 -2.5"/><path d="M11 6l9 0"/><path d="M11 12l9 0"/><path d="M11 18l9 0"/>',
    chat: '<path d="M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1"/>',
    me: '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>',
    check: '<path d="M5 12l5 5l10 -10"/>',
    x: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
    minus: '<path d="M5 12l14 0"/>',
    exam: '<path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2"/><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z"/><path d="M9 14l2 2l4 -4"/>',
    inf: '<path d="M9.828 9.172a4 4 0 1 0 0 5.656a10 10 0 0 0 2.172 -2.828a10 10 0 0 1 2.172 -2.828a4 4 0 1 1 0 5.656a10 10 0 0 1 -2.172 -2.828a10 10 0 0 0 -2.172 -2.828"/>',
    redo: '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
    star: '<path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z"/>',
    dice: '<path d="M3 3m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"/><circle cx="8.5" cy="8.5" r=".5" fill="currentColor"/><circle cx="15.5" cy="15.5" r=".5" fill="currentColor"/><circle cx="12" cy="12" r=".5" fill="currentColor"/>',
    info: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 9h.01"/><path d="M11 12h1v4h1"/>',
    heart: '<path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"/>',
    send: '<path d="M12 5l0 14"/><path d="M18 11l-6 -6"/><path d="M6 11l6 -6"/>',
    book: '<path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6l0 13"/><path d="M12 6l0 13"/><path d="M21 6l0 13"/>',
    cal: '<path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/>',
    gear: '<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/>',
    chev: '<path d="M9 6l6 6l-6 6"/>',
    sparkle: '<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z"/>',
    hands: '<path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"/><path d="M12 6l-3.293 3.293a1 1 0 0 0 0 1.414l.543 .543c.69 .69 1.81 .69 2.5 0l1 -1a3.182 3.182 0 0 1 4.5 0l2.25 2.25"/>',
    flag: '<path d="M5 5a5 5 0 0 1 7 0a5 5 0 0 0 7 0v9a5 5 0 0 1 -7 0a5 5 0 0 0 -7 0v-9z"/><path d="M5 21v-7"/>',
  };
  function ic(name, cls) { return '<svg class="' + (cls || "ic") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[name] + "</svg>"; }

  // ---------- нижня панель ----------
  var TABS = [["home", "#/", "Головна"], ["cards", "#/learn", "Вчити"], ["tests", "#/tests", "Тести"], ["chat", "#/chat", "Розмова"], ["me", "#/me", "Я"]];
  document.getElementById("tabs").innerHTML = TABS.map(function (t) {
    return '<a href="' + t[1] + '" data-tab="' + t[0] + '"><span class="pill">' + ic(t[0], "") + "</span>" + t[2] + "</a>";
  }).join("");
  var backBtn = document.getElementById("back");
  backBtn.addEventListener("click", function () { if (history.length > 1) history.back(); else go("#/"); });

  function frame(opts) {
    document.getElementById("title").textContent = opts.title || "Polski na pobyt";
    document.getElementById("aside").innerHTML = opts.aside || "";
    backBtn.hidden = !opts.back;
    document.body.classList.toggle("focus", !!opts.focus);
    document.querySelectorAll(".tabs a").forEach(function (a) { a.classList.toggle("on", a.dataset.tab === opts.tab); });
  }

  // ---------- AI ----------
  // На github.io AI живе на окремому сервері (Vercel) — адреса в <meta name="api-base">.
  var API_BASE = ((document.querySelector('meta[name="api-base"]') || {}).content || "").replace(/\/$/, "");
  function api(body) {
    // На github.io немає сервера: без адреси Vercel AI недоступний.
    if (!API_BASE && /\.github\.io$/.test(location.hostname)) {
      var off = new Error("no server"); off.status = 503;
      return Promise.reject(off);
    }
    body = Object.assign({ basis: basisText() }, body);
    return fetch((API_BASE ? API_BASE + "/" : "") + "api/examiner", {
      method: "POST",
      headers: { "content-type": "application/json", "x-passcode": S.settings.passcode || "" },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || "error"); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function aiError(e) {
    if (e.status === 401) return "Невірний код доступу. Введіть його в «Я → Налаштування».";
    if (e.status === 503) return "AI ще не підключено на сервері.";
    if (!navigator.onLine) return "Немає інтернету — AI працює лише онлайн.";
    return "AI зараз недоступний. Спробуйте ще раз за хвилину.";
  }
  var VERDICT = { good: "Добре", almost: "Майже добре", wrong: "Варто виправити" };
  function fbHtml(r) {
    if (!r || r.verdict === "none" || !r.verdict) return "";
    var fix = r.corrected_pl ? '<div class="fix">' + esc(r.corrected_pl) + "</div>" : "";
    var tip = r.tip_uk ? '<div style="margin-top:6px">' + esc(r.tip_uk) + "</div>" : "";
    return '<div class="fb ' + esc(r.verdict) + '"><b>' + (VERDICT[r.verdict] || "") + "</b>" + esc(r.feedback_uk) + tip + fix + "</div>";
  }

  // Підстава заяви — підлаштовує AI-питання. Порожньо = польське походження.
  var BASES = [
    ["great", "Польське походження — двоє прадідів", "polskie pochodzenie (art. 195 ust. 1 pkt 3 ustawy o cudzoziemcach): dwoje pradziadków narodowości polskiej"],
    ["origin", "Польське походження — батьки або дід/баба", "polskie pochodzenie (art. 195 ust. 1 pkt 3 ustawy o cudzoziemcach): rodzic lub dziadek narodowości polskiej"],
    ["karta", "Карта поляка", "posiadacz Karty Polaka, zamiar osiedlenia się w Polsce na stałe"],
    ["marriage", "Шлюб із громадянином Польщі", "małżeństwo z obywatelem polskim (co najmniej 3 lata, 2 lata pobytu czasowego)"],
    ["other", "Інше (вписати)", ""],
  ];
  function basisText() {
    var b = S.settings.basis || "great";
    return b === "other" ? S.settings.basisOther || "" : (BASES.filter(function (x) { return x[0] === b; })[0] || BASES[0])[2];
  }

  // ---------- головна ----------
  function catStats() {
    return CATS.map(function (c) {
      var st = SRS.stats(ids(function (d) { return d.cat === c.id; }), S.srs);
      return { c: c, st: st };
    });
  }
  function viewHome() {
    frame({ tab: "home", title: "Polski na pobyt", aside: streak() ? ic("heart", "ic") + " " + streak() + " " + plural(streak(), "день", "дні", "днів") + " поспіль" : "" });
    var n = dayN(), left = daysLeft(), t = today(), plan = SRS.planDay(n);
    var all = SRS.stats(ids(), S.srs);
    var passed = TICKETS.filter(function (_, i) { var r = ticketResult(i); return r && r.errors === 0; }).length;
    var wrongN = Object.keys(S.wrong).filter(function (id) { return byId[id] && quizable(byId[id]); }).length;
    var topic = plan.cats.length ? plan.cats.map(function (c) { return CAT[c].name; }).join(", ") : "усі теми";
    var steps = [
      { done: t.cards >= 15, txt: "15 карток · " + topic, sub: t.cards ? "зроблено " + t.cards : "", href: "#/learn" + (plan.cats.length === 1 ? "/" + plan.cats[0] : "") },
      { done: t.tests >= 1, txt: plan.review ? "Іспит або білет" : "Тест за темою", href: plan.cats.length === 1 && !plan.review ? "#/run/topic/" + plan.cats[0] : "#/tests" },
      { done: t.chats >= 1, txt: "Розмова з урядницею · 5 хв", href: "#/chat" },
    ];
    var doneN = steps.filter(function (s) { return s.done; }).length;
    var weak = catStats().filter(function (x) { return x.c.id !== "ratunek"; }).sort(function (a, b) { return a.st.percent - b.st.percent; }).slice(0, 3);
    var track = ""; for (var i = 1; i <= 30; i++) track += '<i class="' + (i <= n ? "on" : "") + '"></i>';

    view.innerHTML =
      '<div class="hello"><div><div class="hi">Cześć, Karina</div><h2>День ' + n + " з 30</h2></div>" +
      (left == null
        ? '<a class="left" href="#/settings"><b style="font-size:16px">' + ic("cal") + '</b><span>вкажіть дату</span></a>'
        : '<div class="left"><b>' + Math.max(0, left) + "</b><span>" + (left < 0 ? "співбесіда минула" : plural(left, "день", "дні", "днів") + " до співбесіди") + "</span></div>") +
      "</div>" +
      '<div class="track" aria-hidden="true">' + track + "</div>" +
      '<div class="soft today"><div class="row between"><h3>План на сьогодні</h3><span>' + doneN + " з 3</span></div>" +
      '<div class="small" style="margin:2px 0 4px">' + esc(plan.task) + "</div>" +
      steps.map(function (s, k) {
        var first = !s.done && steps.slice(0, k).every(function (x) { return x.done; });
        return '<a class="step' + (s.done ? " done" : "") + '" href="' + s.href + '"><span class="chk">' + (s.done ? ic("check", "ic") : "") + '</span><span class="txt grow">' + esc(s.txt) + (s.sub && !s.done ? ' <span class="small">· ' + esc(s.sub) + "</span>" : "") + "</span>" + (first ? '<span class="go">Почати</span>' : "") + "</a>";
      }).join("") +
      "</div>" +
      '<div class="stats">' +
      '<a class="stat" href="#/learn"><b>' + all.learned + "</b><span>вивчено з " + all.total + "</span></a>" +
      '<a class="stat" href="#/tests"><b>' + passed + "/" + TICKETS.length + "</b><span>білетів без помилок</span></a>" +
      '<a class="stat oops" href="#/run/mistakes"><b>' + wrongN + "</b><span>повторити</span></a>" +
      "</div>" +
      '<div class="sec">Що підтягнути</div>' +
      '<div class="card" style="padding:8px 12px">' +
      weak.map(function (x) {
        return '<a class="weak" href="#/learn/' + x.c.id + '"><div class="row between"><span>' + x.c.icon + " " + esc(x.c.name) + '</span><span class="small muted">' + x.st.percent + '%</span></div><div class="bar"><i style="width:' + Math.max(3, x.st.percent) + '%"></i></div></a>';
      }).join("") +
      "</div>" +
      '<div class="tiles">' +
      '<a class="tile" href="#/run/top">' + ic("star") + "<b>Топ-питання</b><span>найчастіші на співбесіді</span></a>" +
      '<a class="tile" href="#/story">' + ic("heart") + "<b>Моя історія</b><span>розповідь про себе</span></a>" +
      "</div>";
  }

  // ---------- вчити: картки, конструктор, пропуски ----------
  var L = { cat: "all", mode: "learn", id: null, open: false, hint: 0, build: null, cloze: null };
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  // Відповідь по реченнях, ключові слова жирним.
  function answerHtml(a) {
    var keys = SRS.keywords(a, 3);
    return SRS.sentences(a).map(function (s) {
      var h = esc(s);
      keys.forEach(function (k) { h = h.replace(new RegExp("(^|[^\\p{L}\\d>])(" + escRe(esc(k)) + ")(?![\\p{L}\\d])", "u"), "$1<b>$2</b>"); });
      return '<span class="ln">' + h + "</span>";
    }).join("");
  }
  function exercisable(d) {
    return d.a.indexOf("[") < 0 && SRS.chunks(d.a).length >= 3 && SRS.cloze(d.a, 2).some(function (p) { return p.gap; });
  }
  function learnPool() {
    var f;
    if (L.cat === "top") f = function (d) { return d.top; };
    else if (L.cat === "ai") f = function (d) { return d.ai; };
    else f = function (d) { return L.cat === "all" || d.cat === L.cat; };
    if (L.mode !== "learn") { var g = f; f = function (d) { return g(d) && exercisable(d); }; }
    return ids(f);
  }
  function nextItem() {
    L.id = SRS.pickNext(learnPool(), S.srs, Date.now(), Math.random, L.id);
    L.open = false; L.hint = 0; L.build = null; L.cloze = null;
  }
  function viewLearn(mode, cat) {
    mode = mode || "learn";
    if (mode !== L.mode) { L.mode = mode; L.id = null; }
    if (cat && cat !== L.cat) { L.cat = cat; L.id = null; }
    if (!L.id || !byId[L.id] || learnPool().indexOf(L.id) < 0) nextItem();
    var d = byId[L.id];
    var st = SRS.stats(learnPool(), S.srs);
    frame({ tab: "cards", title: "Вчити", aside: st.learned + " / " + st.total + " вивчено" });

    var modes = [["learn", "Картки"], ["build", "Склади"], ["cloze", "Пропуски"]];
    var chips = [["all", "Усі"], ["top", "⭐ Топ"]].concat(CATS.map(function (c) { return [c.id, c.icon + " " + c.name]; }));
    if (S.extra.length) chips.push(["ai", "✨ Від AI"]);
    var html = '<div class="seg" role="tablist">' + modes.map(function (m) {
      return '<button role="tab" aria-selected="' + (m[0] === L.mode) + '" data-mode="' + m[0] + '">' + m[1] + "</button>";
    }).join("") + "</div>" +
      '<div class="chips">' + chips.map(function (c) {
        return '<button class="chip' + (L.cat === c[0] ? " on" : "") + '" data-cat="' + c[0] + '">' + esc(c[1]) + "</button>";
      }).join("") + "</div>";

    if (!d) html += '<div class="card">У цій темі поки немає питань для цього режиму. Оберіть іншу тему.</div>';
    else if (L.mode === "build") html += buildHtml(d);
    else if (L.mode === "cloze") html += clozeHtml(d);
    else html += cardHtml(d);

    var done = today().cards;
    html += '<p class="counter">Сьогодні: ' + done + " " + plural(done, "вправа", "вправи", "вправ") + " · без обмежень</p>";
    if (CAT[L.cat]) html += '<button class="btn ghost block" id="gen" style="margin-top:12px">' + ic("sparkle") + " Ще питання від AI: " + esc(CAT[L.cat].name) + "</button>";
    view.innerHTML = html;

    view.querySelectorAll("[data-mode]").forEach(function (b) { b.onclick = function () { go("#/" + b.dataset.mode + "/" + L.cat); }; });
    view.querySelectorAll("[data-cat]").forEach(function (b) { b.onclick = function () { go("#/" + L.mode + "/" + b.dataset.cat); }; });
    var onChip = view.querySelector(".chip.on");
    if (onChip) onChip.parentNode.scrollLeft = onChip.offsetLeft - 16;
    var gen = document.getElementById("gen"); if (gen) gen.onclick = function () { generate(L.cat, gen); };
    if (!d) return;
    if (L.mode === "build") bindBuild(d); else if (L.mode === "cloze") bindCloze(d); else bindCard(d);
  }
  function gradeAndNext(g) {
    S.srs = SRS.grade(S.srs, L.id, g, Date.now());
    if (g === 0) S.wrong[L.id] = 1;
    touch("cards"); nextItem(); viewLearn(L.mode, L.cat); window.scrollTo(0, 0);
  }
  function tag(d) { return '<span class="tag' + (d.ai ? " ai" : "") + '">' + esc((CAT[d.cat] || {}).name || "") + (d.ai ? " · AI" : "") + (d.top ? " · ⭐ часто" : "") + "</span>"; }
  function extras(d) {
    var hp = S.settings.hidePron, ht = S.settings.hideTr;
    return '<div class="row" style="gap:6px;margin-top:4px"><button class="btn sm ghost" data-tg="hidePron">' + (hp ? "Показати вимову" : "Сховати вимову") + '</button><button class="btn sm ghost" data-tg="hideTr">' + (ht ? "Показати переклад" : "Сховати переклад") + "</button></div>" +
      (hp ? "" : '<div class="pron"><span class="lbl">Вимова · наголос виділено</span>' + pron(d.at) + "</div>") +
      (ht ? "" : '<p class="au">' + esc(d.au) + "</p>");
  }
  function bindExtras() {
    view.querySelectorAll("[data-tg]").forEach(function (b) { b.onclick = function () { S.settings[b.dataset.tg] = !S.settings[b.dataset.tg]; save(); viewLearn(L.mode, L.cat); }; });
  }

  // картка зі сходинками підказок
  function cardHtml(d) {
    var h = '<div class="flash">' + tag(d) + '<p class="q" lang="pl">' + esc(d.q) + '</p><p class="qu">' + esc(d.qu) + "</p>";
    if (L.open) {
      return h + '<hr class="sep"><p class="a" lang="pl">' + answerHtml(d.a) + "</p>" + extras(d) + "</div>" +
        (L.hint ? '<p class="hint" style="text-align:center">Ви брали підказку — «Знаю» зарахується як «Майже».</p>' : "") +
        '<div class="grades"><button class="g0" data-g="0">' + ic("x", "") + 'Не знаю</button><button class="g1" data-g="1">' + ic("minus", "") + 'Майже</button><button class="g2" data-g="2">' + ic("check", "") + "Знаю</button></div>";
    }
    if (L.hint >= 1) h += '<div class="hintbox"><span class="lbl">Ключові слова</span><div class="kw">' + SRS.keywords(d.a, 4).map(function (w) { return "<span lang=\"pl\">" + esc(w) + "</span>"; }).join("") + "</div></div>";
    if (L.hint >= 2) h += '<div class="hintbox"><span class="lbl">Початок кожного речення</span>' + SRS.starts(d.a, 2).map(function (s) { return '<div lang="pl">' + esc(s) + "</div>"; }).join("") + "</div>";
    return h + '<div style="margin-top:auto;padding-top:12px"><p class="small muted" style="margin:0 0 10px">' +
      (L.hint ? "Скажіть відповідь уголос із підказкою." : "Спершу скажіть відповідь уголос, без підказок.") + "</p>" +
      '<div class="btns">' + (L.hint < 2 ? '<button class="btn ghost" id="hint">Підказка ' + (L.hint + 1) + "/2</button>" : '<span></span>') +
      '<button class="btn primary" id="reveal"' + (L.hint < 2 ? "" : ' style="grid-column:1/-1"') + ">Відповідь</button></div></div></div>";
  }
  function bindCard() {
    var rv = document.getElementById("reveal"); if (rv) rv.onclick = function () { L.open = true; viewLearn(L.mode, L.cat); };
    var hb = document.getElementById("hint"); if (hb) hb.onclick = function () { L.hint++; viewLearn(L.mode, L.cat); };
    view.querySelectorAll(".grades button").forEach(function (b) {
      b.onclick = function () { var g = +b.dataset.g; gradeAndNext(L.hint && g === 2 ? 1 : g); };
    });
    bindExtras();
  }

  // конструктор: скласти відповідь зі шматків
  function buildHtml(d) {
    if (!L.build) {
      var parts = SRS.chunks(d.a), order = parts.map(function (_, i) { return i; });
      do { order = SRS.shuffle(order); } while (parts.length > 1 && order.every(function (v, i) { return v === i; }));
      L.build = { parts: parts, pool: order, picked: [], checked: false };
    }
    var B = L.build;
    var h = '<div class="flash">' + tag(d) + '<p class="q" lang="pl">' + esc(d.q) + '</p><p class="qu">' + esc(d.qu) + "</p>" +
      '<p class="small muted" style="margin:6px 0 0">Торкайтеся шматків у правильному порядку.</p>' +
      '<div class="slot" lang="pl">' + (B.picked.length ? B.picked.map(function (pi, k) {
        var cls = B.checked ? (B.parts[pi] === B.parts[k] ? " ok" : " no") : "";
        return '<button class="pc on' + cls + '" data-un="' + k + '"' + (B.checked ? " disabled" : "") + ">" + esc(B.parts[pi]) + "</button>";
      }).join("") : '<span class="muted small">Ваша відповідь з’явиться тут</span>') + "</div>";
    if (!B.checked) {
      h += '<div class="pool" lang="pl">' + B.pool.map(function (pi) {
        var used = B.picked.indexOf(pi) >= 0;
        return '<button class="pc" data-pick="' + pi + '"' + (used ? " hidden" : "") + ">" + esc(B.parts[pi]) + "</button>";
      }).join("") + "</div></div>" +
        '<button class="btn primary block" id="bcheck" style="margin-top:12px"' + (B.picked.length < B.parts.length ? " disabled" : "") + ">Перевірити</button>";
    } else {
      var ok = B.picked.every(function (pi, k) { return B.parts[pi] === B.parts[k]; });
      h += '<div class="fb ' + (ok ? "good" : "almost") + '" style="align-self:stretch"><b>' + (ok ? "Чудово, все на місці!" : "Майже — ось правильний порядок:") + "</b>" +
        (ok ? "" : '<span lang="pl">' + esc(d.a) + "</span>") + "</div>" + extras(d) +
        '<div class="soft small" style="margin:6px 0 0">Тепер скажіть усю відповідь уголос двічі, не дивлячись.</div></div>' +
        '<button class="btn primary block" id="bnext" style="margin-top:12px">Далі</button>';
    }
    return h;
  }
  function bindBuild() {
    var B = L.build;
    view.querySelectorAll("[data-pick]").forEach(function (b) { b.onclick = function () { B.picked.push(+b.dataset.pick); viewLearn(L.mode, L.cat); }; });
    view.querySelectorAll("[data-un]").forEach(function (b) { b.onclick = function () { B.picked.splice(+b.dataset.un, 1); viewLearn(L.mode, L.cat); }; });
    var c = document.getElementById("bcheck"); if (c) c.onclick = function () { B.checked = true; viewLearn(L.mode, L.cat); };
    var n = document.getElementById("bnext");
    if (n) n.onclick = function () { var ok = B.picked.every(function (pi, k) { return B.parts[pi] === B.parts[k]; }); gradeAndNext(ok ? 2 : 1); };
    bindExtras();
  }

  // пропущені слова
  function clozeHtml(d) {
    if (!L.cloze) L.cloze = { parts: SRS.cloze(d.a, 2), vals: [], res: null };
    var C = L.cloze, gi = -1;
    var body = C.parts.map(function (p) {
      if (!p.gap) return esc(p.t);
      gi++;
      var w = Math.max(4, p.gap.length + 1);
      if (!C.res) return '<input class="gap" data-gi="' + gi + '" size="' + w + '" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(C.vals[gi] || "") + '" aria-label="Пропущене слово ' + (gi + 1) + '">';
      var r = C.res[gi];
      return '<span class="gapr ' + (r === "wrong" || r === "empty" ? "no" : "ok") + '">' + esc(r === "exact" ? p.gap : (C.vals[gi] || "—")) + "</span>" + (r === "exact" ? "" : ' <b class="fixw">' + esc(p.gap) + "</b>");
    }).join("");
    var h = '<div class="flash">' + tag(d) + '<p class="q" lang="pl">' + esc(d.q) + '</p><p class="qu">' + esc(d.qu) + "</p>" +
      '<p class="small muted" style="margin:6px 0 0">Впишіть пропущені слова. Діакритику можна не ставити.</p>' +
      '<p class="a cloze" lang="pl">' + body + "</p>";
    if (!C.res) return h + "</div>" + '<div class="btns" style="margin-top:12px"><button class="btn ghost" id="cgive">Не знаю</button><button class="btn primary" id="ccheck">Перевірити</button></div>';
    var good = C.res.filter(function (r) { return r === "exact" || r === "close"; }).length;
    return h + '<div class="fb ' + (good === C.res.length ? "good" : good ? "almost" : "wrong") + '" style="align-self:stretch"><b>' +
      (good === C.res.length ? (C.res.indexOf("close") >= 0 ? "Правильно, зверніть увагу на форму слова" : "Правильно!") : good ? "Частково правильно" : "Запам’ятайте ці слова") + "</b></div>" +
      extras(d) + "</div>" + '<button class="btn primary block" id="cnext" style="margin-top:12px">Далі</button>';
  }
  function bindCloze() {
    var C = L.cloze;
    var inputs = view.querySelectorAll(".gap");
    inputs.forEach(function (inp) {
      inp.oninput = function () { C.vals[+inp.dataset.gi] = inp.value; };
      inp.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); var nx = inputs[+inp.dataset.gi + 1]; if (nx) nx.focus(); else check(); } };
    });
    function check() {
      var gaps = C.parts.filter(function (p) { return p.gap; });
      C.res = gaps.map(function (p, i) { return SRS.checkWord(C.vals[i] || "", p.gap); });
      viewLearn(L.mode, L.cat);
    }
    var cc = document.getElementById("ccheck"); if (cc) cc.onclick = check;
    var cg = document.getElementById("cgive"); if (cg) cg.onclick = function () { C.vals = []; check(); };
    var cn = document.getElementById("cnext");
    if (cn) cn.onclick = function () {
      var good = C.res.filter(function (r) { return r === "exact" || r === "close"; }).length;
      gradeAndNext(good === C.res.length ? 2 : good ? 1 : 0);
    };
    if (inputs[0] && !C.vals.length) inputs[0].focus({ preventScroll: true });
    bindExtras();
  }

  var generating = false;
  function onLearn() { return /^#\/(learn|build|cloze)/.test(location.hash); }
  function generate(cat, btn) {
    if (generating) return;
    generating = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = '<span class="spin"></span> AI складає питання…';
    var existing = allItems().filter(function (d) { return d.cat === cat; }).map(function (d) { return d.q; });
    api({ mode: "generate", topic: CAT[cat].name + " (" + cat + ")", existing: existing, count: 8 })
      .then(function (r) {
        var added = (r.items || []).map(function (it) { return Object.assign({ cat: cat, ai: true }, it); })
          .filter(function (it) { return !byId[SRS.idOf(it)]; });
        S.extra = S.extra.concat(added); save(); reindex();
        toast(added.length ? "Додано " + added.length + " " + plural(added.length, "нове питання", "нові питання", "нових питань") : "Нових питань не знайшлося — спробуйте ще");
        if (added.length && onLearn()) { nextItem(); L.id = SRS.idOf(added[0]); }
      })
      .catch(function (e) { toast(aiError(e)); })
      .then(function () { generating = false; if (onLearn()) viewLearn(L.mode, L.cat); });
  }

  // ---------- тести (як ПДР) ----------
  var T = null;
  function ticketState(i) { var r = ticketResult(i); return !r ? "" : r.errors === 0 ? "pass" : "fail"; }
  function viewTests() {
    frame({ tab: "tests", title: "Тести" });
    var wrongN = Object.keys(S.wrong).filter(function (id) { return byId[id] && quizable(byId[id]); }).length;
    var nextT = TICKETS.findIndex(function (_, i) { return !ticketResult(i); });
    view.innerHTML =
      '<a class="hero" href="#/run/exam">' + ic("exam") + '<div class="grow"><b>Іспит</b><span>20 питань · 20 хв · до 2 помилок</span></div>' + ic("chev") + "</a>" +
      '<div class="modes">' +
      '<a class="mode" href="#/run/marathon" style="text-decoration:none">' + ic("inf") + "<b>Марафон</b><span>без кінця, по колу</span></a>" +
      '<a class="mode oops" href="#/run/mistakes" style="text-decoration:none">' + ic("redo") + "<b>Мої помилки</b><span>" + wrongN + " " + plural(wrongN, "питання", "питання", "питань") + "</span></a>" +
      '<a class="mode" href="#/run/top" style="text-decoration:none">' + ic("star") + "<b>Топ-питання</b><span>найчастіші</span></a>" +
      '<a class="mode" href="#/run/random" style="text-decoration:none">' + ic("dice") + "<b>Новий білет</b><span>випадковий, безліч</span></a>" +
      "</div>" +
      '<div class="sec">Білети <span>по 10 питань</span></div>' +
      '<div class="grid5">' + TICKETS.map(function (_, i) {
        return '<button class="tk ' + ticketState(i) + (i === nextT ? " next" : "") + '" data-t="' + i + '" aria-label="Білет ' + (i + 1) + '">' + (i + 1) + "</button>";
      }).join("") + "</div>" +
      '<div class="legend"><span><i style="background:var(--ok-mid)"></i>без помилок</span><span><i style="background:var(--oops-mid)"></i>є помилки</span><span><i style="background:var(--soft);border:1px solid var(--line)"></i>не почато</span></div>' +
      '<div class="sec">За темами</div>' +
      '<div class="chips" style="flex-wrap:wrap;overflow:visible">' + CATS.map(function (c) {
        return '<a class="chip" style="text-decoration:none;color:inherit" href="#/run/topic/' + c.id + '">' + c.icon + " " + esc(c.name) + "</a>";
      }).join("") + "</div>";
    view.querySelectorAll(".tk").forEach(function (b) { b.onclick = function () { go("#/run/ticket/" + b.dataset.t); }; });
  }

  function startTest(kind, arg) {
    var list, title, opts = {};
    var noRescue = function (d) { return d.cat !== "ratunek" && quizable(d); };
    if (kind === "ticket") { list = TICKETS[+arg] || []; title = "Білет " + (+arg + 1); }
    else if (kind === "exam") { list = SRS.shuffle(ids(noRescue)).slice(0, 20); title = "Іспит"; opts = { maxErr: 2, limit: 20 * 60000 }; }
    else if (kind === "marathon") { list = SRS.shuffle(ids(quizable)); title = "Марафон"; opts = { endless: true }; }
    else if (kind === "mistakes") { list = SRS.shuffle(Object.keys(S.wrong).filter(function (id) { return byId[id] && quizable(byId[id]); })); title = "Мої помилки"; }
    else if (kind === "top") { list = SRS.shuffle(ids(function (d) { return d.top && quizable(d); })); title = "Топ-питання"; }
    else if (kind === "random") { list = SRS.randomTicket(ids(noRescue), S.srs, S.wrong, 10); title = "Випадковий білет"; }
    else if (kind === "topic") { list = SRS.shuffle(ids(function (d) { return d.cat === arg && quizable(d); })).slice(0, 10); title = (CAT[arg] || {}).name || "Тема"; }
    if (!list || !list.length) return null;
    return Object.assign({ kind: kind, arg: arg, key: kind + "/" + (arg || ""), title: title, list: list, i: 0, res: [], picks: [], chosen: null, quiz: null, started: Date.now() }, opts);
  }

  var timer = null;
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function fmt(ms) { var s = Math.max(0, Math.round(ms / 1000)); return pad(Math.floor(s / 60)) + ":" + pad(s % 60); }

  function viewRun(kind, arg) {
    var key = kind + "/" + (arg || "");
    if (!T || T.key !== key || T.done) {
      T = startTest(kind, arg);
      if (!T) {
        frame({ tab: "tests", title: "Тести", back: true });
        view.innerHTML = '<div class="card">' + (kind === "mistakes" ? "Помилок поки немає — так тримати! 💗" : "Тут поки немає питань.") + '</div><a class="btn primary block" href="#/tests">До тестів</a>';
        return;
      }
    }
    if (T.done) return viewResult();
    while (T.i < T.list.length && !byId[T.list[T.i]]) T.list.splice(T.i, 1);
    if (T.i >= T.list.length) { if (T.res.length) return finish(); T = null; return go("#/tests"); }
    var id = T.list[T.i], d = byId[id];
    if (!T.quiz) T.quiz = SRS.buildQuiz(d, allItems().filter(quizable));
    var errors = T.res.filter(function (x) { return !x; }).length;
    var aside = T.limit ? '<span id="clock">' + fmt(T.limit - (Date.now() - T.started)) + "</span>" : T.endless ? T.res.length + " · " + (T.res.length ? Math.round(100 * (T.res.length - errors) / T.res.length) : 0) + "%" : T.i + 1 + " / " + T.list.length;
    frame({ tab: "tests", title: T.title, back: true, focus: true, aside: aside });

    var dots = "";
    if (!T.endless) {
      for (var k = 0; k < T.list.length; k++) dots += "<i class=\"" + (k < T.res.length ? (T.res[k] ? "ok" : "no") : k === T.i ? "cur" : "") + '">' + (T.list.length <= 10 ? k + 1 : "") + "</i>";
    }
    var letters = ["А", "Б", "В", "Г"];
    var answered = T.chosen !== null;
    view.innerHTML =
      (dots ? '<div class="dots' + (T.list.length > 10 ? " thin" : "") + '" aria-hidden="true">' + dots + "</div>" : "") +
      '<span class="tag">' + esc((CAT[d.cat] || {}).name || "") + "</span>" +
      '<p class="q" lang="pl" style="margin-top:10px">' + esc(d.q) + "</p>" +
      '<p class="qu">' + esc(d.qu) + "</p>" +
      '<div class="opts">' + T.quiz.options.map(function (o, k) {
        var cls = answered ? (k === T.quiz.correctIndex ? " right" : k === T.chosen ? " wrong" : "") : "";
        var mark = answered && k === T.quiz.correctIndex ? ic("check", "") : answered && k === T.chosen ? ic("x", "") : letters[k];
        return '<button class="opt' + cls + '" data-k="' + k + '"' + (answered ? " disabled" : "") + ' lang="pl"><span class="lt">' + mark + "</span><span>" + esc(o) + "</span></button>";
      }).join("") + "</div>" +
      (answered
        ? '<div class="explain"><b>' + ic("info") + (T.chosen === T.quiz.correctIndex ? "Правильно!" : "Пояснення") + "</b>" + esc(d.au) +
          '<div class="pron"><span class="lbl">Вимова правильної відповіді</span>' + pron(d.at) + "</div></div>" +
          '<div class="sticky-next"><button class="btn primary block" id="next">' + (isLast() ? "Результат" : "Далі") + "</button></div>"
        : "") +
      (T.endless ? '<button class="btn block" id="stop" style="margin-top:10px">Завершити марафон</button>' : "");

    view.querySelectorAll(".opt").forEach(function (b) {
      b.onclick = function () {
        if (T.chosen !== null || Date.now() - lastAdvance < 400) return;
        T.chosen = +b.dataset.k;
        var ok = T.chosen === T.quiz.correctIndex;
        T.res.push(ok); T.picks.push(T.quiz.options[T.chosen]);
        if (ok) { if (T.kind === "mistakes") delete S.wrong[id]; S.srs = SRS.grade(S.srs, id, 2, Date.now()); }
        else { S.wrong[id] = 1; S.srs = SRS.grade(S.srs, id, 0, Date.now()); }
        save();
        if (T.maxErr != null && T.res.filter(function (x) { return !x; }).length > T.maxErr) T.failedEarly = true;
        viewRun(kind, arg);
      };
    });
    var nx = document.getElementById("next");
    if (nx) { nx.onclick = advance; nx.focus({ preventScroll: true }); }
    var sp = document.getElementById("stop"); if (sp) sp.onclick = finish;

    stopTimer();
    if (T.limit) timer = setInterval(function () {
      var left = T.limit - (Date.now() - T.started);
      var c = document.getElementById("clock"); if (c) c.textContent = fmt(left);
      if (left <= 0) { if (T.res.length < T.list.length) T.timeout = true; finish(); }
    }, 1000);
  }
  function isLast() { return !T.endless && (T.i >= T.list.length - 1 || T.failedEarly); }
  var lastAdvance = 0;
  function advance() {
    // Захист від подвійного тапу: другий дотик не повинен вибрати відповідь у наступному питанні.
    if (Date.now() - lastAdvance < 400) return;
    lastAdvance = Date.now();
    if (isLast()) return finish();
    T.i++; T.chosen = null; T.quiz = null;
    if (T.endless && T.i >= T.list.length) T.list = T.list.concat(SRS.shuffle(ids(quizable)));
    viewRun(T.kind, T.arg); window.scrollTo(0, 0);
  }
  function finish() {
    stopTimer();
    if (T.chosen === null && !T.timeout && T.endless) { /* марафон без відповіді на поточне */ }
    T.done = true;
    var errors = T.res.filter(function (x) { return !x; }).length;
    if (T.kind === "ticket" && ticketKey(+T.arg)) S.tickets[ticketKey(+T.arg)] = { errors: errors + (T.list.length - T.res.length), at: Date.now() };
    if (T.res.length) touch("tests"); else save();
    viewResult(); window.scrollTo(0, 0);
  }
  function viewResult() {
    var errors = T.res.filter(function (x) { return !x; }).length, total = T.res.length;
    var pass = T.maxErr != null ? !T.failedEarly && !T.timeout && errors <= T.maxErr && total === T.list.length : errors === 0 && total > 0;
    var head = T.kind === "exam" ? (pass ? "Іспит складено" : "Іспит не складено") : T.endless ? "Марафон завершено" : pass ? "Без жодної помилки!" : "Готово";
    var sub = (total - errors) + " з " + (T.endless ? total : T.list.length) + " · " + errors + " " + plural(errors, "помилка", "помилки", "помилок") + " · " + fmt(Date.now() - T.started);
    if (T.timeout) sub = "Час вийшов · " + sub;
    if (T.failedEarly) sub = "Більше 2 помилок · " + sub;
    frame({ tab: "tests", title: T.title, back: true });
    var cells = T.res.map(function (r) { return '<i class="' + (r ? "ok" : "no") + '"></i>'; }).join("");
    var misses = T.list.slice(0, total).map(function (id, k) { return { d: byId[id], ok: T.res[k], pick: T.picks[k] }; }).filter(function (x) { return !x.ok; });
    view.innerHTML =
      '<div class="result ' + (pass || T.endless && errors === 0 ? "pass" : T.kind === "exam" && !pass ? "fail" : "pass") + '"><div class="badge">' + ic(pass ? "hands" : "heart", "") + "</div><h2>" + head + '</h2><p class="muted">' + esc(sub) + "</p></div>" +
      (total && total <= 40 ? '<div class="dots thin" style="flex-wrap:wrap">' + cells + "</div>" : "") +
      (misses.length ? '<div class="sec">Що повторити</div>' + misses.map(function (m) {
        return '<div class="miss"><b lang="pl">' + esc(m.d.q) + '</b><div class="y" lang="pl">Ваша: ' + esc(m.pick) + '</div><div class="c" lang="pl">Правильно: ' + esc(m.d.a) + "</div></div>";
      }).join("") : "") +
      '<div class="btns" style="margin-top:14px"><a class="btn ghost" href="#/tests">До тестів</a><button class="btn primary" id="again">Ще раз</button></div>';
    document.getElementById("again").onclick = function () { var k = T.kind, a = T.arg; T = null; viewRun(k, a); };
  }

  // ---------- розмова з AI ----------
  var busy = false, chatErr = "";
  var CHAT_TOPICS = [["mix", "Усе підряд"], ["osobie", "Про себе"], ["bn", "Різдво"], ["wn", "Великдень"], ["swieta", "Усі свята"], ["zwyczaje", "Звичаї"], ["historia", "Історія і символи"]];
  var TOPIC_PL = {
    mix: ["o sobie i polskie korzenie", "święta i tradycje", "historia i symbole Polski"],
    osobie: ["o sobie, rodzina, polskie korzenie, życie w Polsce"], bn: ["Boże Narodzenie, Wigilia, Adwent"], wn: ["Wielkanoc, Wielki Post, święconka"],
    swieta: ["polskie święta kościelne i państwowe"], zwyczaje: ["polskie zwyczaje, kuchnia, święta rodzinne"], historia: ["historia Polski, symbole narodowe, znani Polacy"],
  };
  function viewChat() {
    var topic = S.settings.chatTopic || "mix";
    frame({ tab: "chat", title: "Розмова", aside: S.chat.length ? '<button class="btn sm ghost" id="reset">Нова</button>' : "" });
    var h = '<div class="who"><div class="av">UW</div><div><b>Pani urzędniczka</b><div class="small muted">AI · тренування співбесіди</div></div></div>';
    if (!S.chat.length) {
      h += '<div class="card"><p style="margin-top:0">Урядниця ставить питання польською — по одному, як на справжній співбесіді, і уточнює деталі. Ви відповідаєте письмово, а вона коротко підказує українською, що виправити.</p><p class="small muted" style="margin-bottom:0">Пишіть так, як сказали б уголос. Помилятися тут можна й треба.</p></div>' +
        '<div class="sec">Тема</div><div class="chips" style="flex-wrap:wrap;overflow:visible">' + CHAT_TOPICS.map(function (t) {
          return '<button class="chip' + (t[0] === topic ? " on" : "") + '" data-topic="' + t[0] + '">' + esc(t[1]) + "</button>";
        }).join("") + "</div>" +
        (chatErr ? '<p class="err">' + esc(chatErr) + "</p>" : "") +
        '<button class="btn primary block" id="start" style="margin-top:8px"' + (busy ? ' aria-busy="true"' : "") + ">" + (busy ? '<span class="spin"></span> Урядниця готується…' : "Почати розмову") + "</button>";
    } else {
      h += '<div class="chat">' + S.chat.map(function (m) {
        if (m.role === "examiner") return '<div class="msg ex" lang="pl">' + esc(m.text) + (m.tr ? '<div class="tr" lang="uk">' + esc(m.tr) + "</div>" : "") + "</div>";
        return '<div class="msg me" lang="pl">' + esc(m.text) + "</div>" + fbHtml(m.fb);
      }).join("") + (busy ? '<div class="typing"><span class="spin"></span> урядниця пише…</div>' : "") + "</div>" +
        (chatErr ? '<p class="err">' + esc(chatErr) + "</p>" : "") +
        '<form class="composer" id="form"><textarea id="msg" rows="1" placeholder="Odpowiedz po polsku…" lang="pl" aria-label="Ваша відповідь"></textarea><button class="send" aria-label="Відправити"' + (busy ? " disabled" : "") + ">" + ic("send", "") + "</button></form>";
    }
    view.innerHTML = h;
    view.querySelectorAll("[data-topic]").forEach(function (b) { b.onclick = function () { S.settings.chatTopic = b.dataset.topic; save(); viewChat(); }; });
    var st = document.getElementById("start"); if (st) st.onclick = function () { sendChat(null); };
    var rs = document.getElementById("reset"); if (rs) rs.onclick = function () { if (busy) return toast("Зачекайте на відповідь урядниці"); if (confirm("Почати нову розмову?")) { S.chat = []; chatErr = ""; save(); viewChat(); } };
    var form = document.getElementById("form");
    if (form) {
      var ta = document.getElementById("msg");
      ta.value = S.settings.draft || "";
      ta.oninput = function () { S.settings.draft = ta.value; ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px"; save(); };
      form.onsubmit = function (e) {
        e.preventDefault();
        var v = ta.value.trim();
        if (!v) { chatErr = "Напишіть відповідь польською."; return viewChat(); }
        sendChat(v);
      };
      if (!busy) setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); }, 0);
    }
  }
  function sendChat(text) {
    if (busy) return;
    chatErr = "";
    if (text) { S.chat.push({ role: "karina", text: text }); S.settings.draft = ""; }
    busy = true; save(); viewChat();
    api({ mode: "chat", topics: TOPIC_PL[S.settings.chatTopic || "mix"], history: S.chat.map(function (m) { return { role: m.role, text: m.text }; }) })
      .then(function (r) {
        var last = S.chat[S.chat.length - 1];
        if (last && last.role === "karina") last.fb = { verdict: r.verdict, feedback_uk: r.feedback_uk, corrected_pl: r.corrected_pl };
        S.chat.push({ role: "examiner", text: r.next_question_pl, tr: r.next_question_uk });
        if (text) touch("chats"); else save();
      })
      .catch(function (e) {
        chatErr = aiError(e);
        if (text) { var m = S.chat.pop(); S.settings.draft = m.text; }
        save();
      })
      .then(function () { busy = false; if (location.hash.indexOf("#/chat") === 0) viewChat(); });
  }

  // ---------- моя історія ----------
  var STORY = [
    { id: "who", t: "Хто я", q: "Proszę się przedstawić.", hint: "Ім’я, вік, звідки ви, де живете, з ким." },
    { id: "roots", t: "Польські корені", q: "Kto w Pani rodzinie był Polakiem?", hint: "Хто, де жив, які документи є. Має збігатися із заявою!" },
    { id: "home", t: "Традиції в моїй родині", q: "Jakie polskie tradycje kultywuje Pani rodzina?", hint: "Що робили вдома: Wigilia, Wielkanoc, кухня, мова." },
    { id: "life", t: "Життя в Польщі", q: "Od kiedy mieszka Pani w Polsce i czym się Pani zajmuje?", hint: "З якого року, місто, робота, навчання." },
    { id: "why", t: "Чому я хочу залишитися", q: "Dlaczego chce Pani zamieszkać w Polsce na stałe?", hint: "Що вас пов’язує з Польщею, плани." },
    { id: "fav", t: "Улюблене свято", q: "Jakie polskie święto lubi Pani najbardziej i jak je Pani obchodzi?", hint: "Опишіть, як ви святкуєте, що готуєте." },
  ];
  var storyFb = {};
  function viewStory() {
    frame({ tab: "me", title: "Моя історія", back: true });
    view.innerHTML = '<div class="soft small">Це питання ставлять завжди. Напишіть свою розповідь польською простими реченнями, перевірте з AI і перечитуйте щодня. Головне — правда і збіг із документами.</div>' +
      STORY.map(function (s) {
        return '<div class="card"><b>' + esc(s.t) + '</b><p class="q" lang="pl" style="font-size:17px;margin:6px 0 2px">' + esc(s.q) + '</p><p class="hint" style="margin:0 0 10px">' + esc(s.hint) + "</p>" +
          '<textarea data-s="' + s.id + '" lang="pl" aria-label="' + esc(s.t) + '" placeholder="Napisz po polsku…">' + esc(S.story[s.id] || "") + "</textarea>" +
          '<div id="fb-' + s.id + '" style="margin-top:8px">' + fbHtml(storyFb[s.id]) + "</div>" +
          '<button class="btn ghost block" data-chk="' + s.id + '" style="margin-top:8px">' + ic("sparkle") + " Перевірити з AI</button></div>";
      }).join("");
    view.querySelectorAll("textarea[data-s]").forEach(function (ta) { ta.oninput = function () { S.story[ta.dataset.s] = ta.value; save(); }; });
    view.querySelectorAll("[data-chk]").forEach(function (b) {
      b.onclick = function () {
        var s = STORY.filter(function (x) { return x.id === b.dataset.chk; })[0];
        var text = (S.story[s.id] || "").trim();
        var box = document.getElementById("fb-" + s.id);
        if (!text) { box.innerHTML = '<p class="err">Спершу напишіть кілька речень.</p>'; return; }
        b.setAttribute("aria-busy", "true"); b.innerHTML = '<span class="spin"></span> Перевіряю…';
        api({ mode: "check", question: s.q, model_answer: "", answer: text })
          .then(function (r) { storyFb[s.id] = r; box.innerHTML = fbHtml(r); })
          .catch(function (e) { box.innerHTML = '<p class="err">' + esc(aiError(e)) + "</p>"; })
          .then(function () { b.removeAttribute("aria-busy"); b.innerHTML = ic("sparkle") + " Перевірити з AI"; });
      };
    });
  }

  // ---------- я / план / налаштування ----------
  function viewMe() {
    frame({ tab: "me", title: "Я" });
    var all = SRS.stats(ids(), S.srs);
    view.innerHTML =
      '<div class="stats"><div class="stat"><b>' + all.percent + '%</b><span>вивчено</span></div><div class="stat"><b>' + streak() + "</b><span>" + plural(streak(), "день", "дні", "днів") + " поспіль</span></div><div class=\"stat\"><b>" + allItems().length + "</b><span>" + plural(allItems().length, "питання", "питання", "питань") + " у базі</span></div></div>" +
      '<div class="list" style="margin-top:12px">' +
      '<a href="#/story">' + ic("heart") + "Моя історія" + ic("chev", "ic chev") + "</a>" +
      '<a href="#/plan">' + ic("cal") + "План на 30 днів" + ic("chev", "ic chev") + "</a>" +
      '<a href="#/tips">' + ic("book") + "Як проходить співбесіда" + ic("chev", "ic chev") + "</a>" +
      '<a href="#/settings">' + ic("gear") + "Налаштування" + ic("chev", "ic chev") + "</a>" +
      "</div>" +
      '<div class="card small muted">Щоб встановити на телефон: у браузері відкрийте меню і натисніть «Додати на головний екран». Після цього застосунок працює і без інтернету (крім AI).</div>';
  }
  function viewPlan() {
    frame({ tab: "me", title: "План на 30 днів", back: true });
    var n = dayN(), h = '<div class="list">';
    for (var d = 1; d <= 30; d++) {
      var p = SRS.planDay(d), done = !!S.plan[d];
      var cats = p.cats.length ? p.cats.map(function (c) { return CAT[c].icon + " " + CAT[c].name; }).join(", ") : "усі теми";
      h += '<label class="day' + (d === n ? " today" : "") + (done ? " done" : "") + '"><input type="checkbox" data-d="' + d + '"' + (done ? " checked" : "") + '><div class="dt"><span class="n">День ' + d + (d === n ? " · сьогодні" : "") + "</span><br>" + esc(cats) + '<br><span class="small muted">' + esc(p.task) + "</span></div></label>";
    }
    view.innerHTML = h + "</div>";
    view.querySelectorAll("[data-d]").forEach(function (cb) { cb.onchange = function () { if (cb.checked) S.plan[cb.dataset.d] = 1; else delete S.plan[cb.dataset.d]; save(); viewPlan(); }; });
  }
  function viewTips() {
    frame({ tab: "me", title: "Як проходить співбесіда", back: true });
    var tips = [
      ["Формат", "Розмова в urząd wojewódzki, лише польською, зазвичай близько години. Урядник веде протокол, який ви підписуєте. Сертифікат мови для цієї підстави не потрібен — мову оцінюють на розмові."],
      ["Що перевіряє закон", "Три речі разом: ви декларуєте польську національність; двоє прадідів (або батько/мати чи дід/баба) були поляками; ви показуєте свій зв’язок із польськістю. Плюс намір жити в Польщі назавжди — тому питають про роботу, житло, плани."],
      ["Як іде розмова", "Зазвичай: попередження про відповідальність за неправдиві свідчення → про себе, в’їзд, житло, плани → національність і предки → історія родини → Різдво й Великдень «по черзі» → державні свята, історія, гімн, герб, назва держави → «Що хочете додати?»."],
      ["Про прадідів", "Коли підстава — прадіди, питають і про них: як жили, як зберігали польське (мова, костел, свята), що з ними сталося, як це дійшло до вас. Можуть запитати, чому в пізніших документах записана інша національність."],
      ["Почніть самі", "Воєводства пишуть, що на розмові ви самі розповідаєте про походження. Підготуйте зв’язну розповідь про родину на 2–3 хвилини (розділ «Моя історія»)."],
      ["Чому відмовляють", "За рішеннями судів: не знає історії родини; польський вивчений лише для переїзду; удома не було польських традицій. Суд нагадує, що розмова «не є іспитом» — оцінюють усю картину, тож приносьте будь-які підтвердження зв’язку (курси, організації, костел)."],
      ["Лише правда", "Протокол підписують після попередження про відповідальність за неправдиві свідчення. Не вигадуйте того, чого не було. Краще чесно: «Nie pamiętam dokładnie» або «Tego nie wiem»."],
      ["Делікатні теми", "Історію (зокрема Волинь, Катинь) відповідайте спокійно й фактами, як прийнято в польській історіографії."],
      ["Наприкінці", "Уважно прочитайте протокол перед підписом. Якщо щось записано неточно — попросіть виправити."],
      ["Якщо загубилися", "Скористайтеся фразами-рятівниками: попросіть повторити, говорити повільніше, візьміть паузу. Це нормально."],
    ];
    view.innerHTML = tips.map(function (t) { return '<div class="card"><b>' + esc(t[0]) + '</b><p style="margin:6px 0 0">' + esc(t[1]) + "</p></div>"; }).join("") +
      '<a class="btn primary block" href="#/learn/ratunek">Фрази-рятівники</a>';
  }
  function viewSettings() {
    frame({ tab: "me", title: "Налаштування", back: true });
    view.innerHTML =
      '<label class="f" for="bs">Підстава заяви</label><select id="bs">' + BASES.map(function (b) {
        return '<option value="' + b[0] + '"' + ((S.settings.basis || "great") === b[0] ? " selected" : "") + ">" + esc(b[1]) + "</option>";
      }).join("") + "</select>" +
      '<input type="text" id="bso" lang="pl" placeholder="Np. praca, studia…" value="' + esc(S.settings.basisOther || "") + '"' + (S.settings.basis === "other" ? "" : " hidden") + ' style="margin-top:8px">' +
      '<p class="hint">AI-урядниця ставитиме питання саме під цю підставу.</p>' +
      '<label class="f" for="iv">Дата співбесіди</label><input type="date" id="iv" value="' + esc(S.settings.interview || "") + '">' +
      '<label class="f" for="st">Перший день навчання</label><input type="date" id="st" value="' + esc(S.settings.start || "") + '"><p class="hint">Від нього рахується план на 30 днів.</p>' +
      '<label class="f" for="pc">Код доступу до AI</label><input type="password" id="pc" autocomplete="off" value="' + esc(S.settings.passcode || "") + '"><p class="hint">Код дає той, хто налаштував застосунок.</p>' +
      '<label class="f">Резервна копія</label><div class="btns"><button class="btn ghost" id="exp">Зберегти копію</button><button class="btn ghost" id="imp">Відновити з файлу</button></div>' +
      '<input type="file" id="impf" accept="application/json,.json" hidden>' +
      '<p class="hint">Прогрес зберігається на цьому телефоні. Раз на тиждень зберігайте копію-файл — з неї можна відновити все на новому телефоні.</p>' +
      '<button class="btn block" id="wipe" style="margin-top:28px;color:var(--oops)">Скинути весь прогрес</button>';
    document.getElementById("exp").onclick = function () {
      var name = "polski-kopiya-" + todayStr() + ".json";
      var blob = new Blob([JSON.stringify({ app: "karina-polski", v: 1, saved: new Date().toISOString(), state: S })], { type: "application/json" });
      try {
        var file = new File([blob], name, { type: "application/json" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: "Копія прогресу" }).catch(function () {});
          return;
        }
      } catch (e) { /* немає File/share — завантажуємо */ }
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
    };
    var impf = document.getElementById("impf");
    document.getElementById("imp").onclick = function () { impf.click(); };
    impf.onchange = function () {
      var f = impf.files && impf.files[0]; impf.value = ""; if (!f) return;
      f.text().then(function (txt) {
        var j = JSON.parse(txt);
        if (!j || j.app !== "karina-polski" || !j.state || typeof j.state !== "object") throw new Error("bad");
        if (!confirm("Замінити поточний прогрес копією від " + String(j.saved || "").slice(0, 10) + "?")) return;
        S = normalize(j.state); T = null; L.id = null;
        save(); reindex(); toast("Прогрес відновлено"); go("#/");
      }).catch(function () { toast("Це не схоже на файл копії"); });
    };
    document.getElementById("bs").onchange = function (e) {
      S.settings.basis = e.target.value; save();
      document.getElementById("bso").hidden = e.target.value !== "other";
      toast("Збережено");
    };
    document.getElementById("bso").onchange = function (e) { S.settings.basisOther = e.target.value.trim(); save(); toast("Збережено"); };
    document.getElementById("iv").onchange = function (e) { S.settings.interview = e.target.value; save(); toast("Збережено"); };
    document.getElementById("st").onchange = function (e) { if (e.target.value) { S.settings.start = e.target.value; save(); toast("Збережено"); } };
    document.getElementById("pc").onchange = function (e) { S.settings.passcode = e.target.value.trim(); save(); toast("Збережено"); };
    document.getElementById("wipe").onclick = function () {
      if (!confirm("Видалити весь прогрес, помилки, розмову та історію? Це не можна скасувати.")) return;
      var keep = { start: todayStr() };
      ["interview", "passcode", "basis", "basisOther", "hidePron", "hideTr", "chatTopic"].forEach(function (k) { if (S.settings[k] != null) keep[k] = S.settings[k]; });
      S = normalize({ settings: keep, extra: S.extra }); T = null; L.id = null;
      save(); toast("Прогрес скинуто"); go("#/");
    };
  }

  // ---------- роутер ----------
  function render() {
    stopTimer();
    var p = (location.hash.replace(/^#\/?/, "") || "").split("/");
    var r = p[0];
    if (r !== "run" && T && !T.done && T.kind === "exam") T = null;
    if (r === "learn" || r === "build" || r === "cloze") viewLearn(r, p[1]);
    else if (r === "tests") viewTests();
    else if (r === "run") viewRun(p[1], p[2]);
    else if (r === "chat") viewChat();
    else if (r === "me") viewMe();
    else if (r === "story") viewStory();
    else if (r === "plan") viewPlan();
    else if (r === "tips") viewTips();
    else if (r === "settings") viewSettings();
    else if (r === "setup") {
      // Посилання-налаштування #/setup/КОД: зберігає код доступу до AI, щоб не вводити його вручну.
      var code = decodeURIComponent(p.slice(1).join("/") || "").trim();
      if (code) { S.settings.passcode = code.slice(0, 200); save(); toast("AI підключено. Можна додати застосунок на головний екран"); }
      history.replaceState(null, "", location.pathname + location.search + "#/");
      viewHome();
    }
    else viewHome();
  }
  window.addEventListener("hashchange", function () { render(); window.scrollTo(0, 0); });
  render();

  // Просимо браузер не очищати сховище автоматично.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
