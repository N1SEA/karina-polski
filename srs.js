// Логика повторения и тестов. Чистые функции — без DOM, проверяются в tests/.
var SRS = (function () {
  var DAY = 86400000;
  var MIN = 60000;
  // Интервал повторения по «коробке» (0..4), в днях.
  var INTERVALS = [0, 1, 3, 7, 14];
  var LEARNED_BOX = 3;

  function idOf(item) {
    var s = item.cat + "|" + item.q;
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return "q" + (h >>> 0).toString(36);
  }

  // g: 0 = не знаю, 1 = почти, 2 = знаю
  function grade(state, id, g, now) {
    var cur = state[id] || { box: 0, due: 0, seen: 0 };
    var box, due;
    if (g === 0) {
      box = 0;
      due = now + MIN;
    } else if (g === 1) {
      box = Math.max(1, Math.min(cur.box, 2));
      due = now + 10 * MIN;
    } else {
      box = Math.min(cur.box + 1, INTERVALS.length - 1);
      due = now + INTERVALS[box] * DAY;
    }
    var next = Object.assign({}, state);
    next[id] = { box: box, due: due, seen: cur.seen + 1, last: g };
    return next;
  }

  // Следующая карточка: сначала просроченные с низкой коробкой, потом новые,
  // если всё повторено — та, у которой срок ближе всего.
  function pickNext(ids, state, now, rng, excludeId) {
    rng = rng || Math.random;
    var pool = ids.filter(function (id) { return id !== excludeId; });
    if (!pool.length) pool = ids.slice();
    if (!pool.length) return null;
    var due = [], fresh = [];
    pool.forEach(function (id) {
      var s = state[id];
      if (!s) fresh.push(id);
      else if (s.due <= now) due.push(id);
    });
    if (due.length) {
      var minBox = Math.min.apply(null, due.map(function (id) { return state[id].box; }));
      var low = due.filter(function (id) { return state[id].box === minBox; });
      return low[Math.floor(rng() * low.length)];
    }
    if (fresh.length) return fresh[Math.floor(rng() * fresh.length)];
    return pool.slice().sort(function (a, b) { return state[a].due - state[b].due; })[0];
  }

  function stats(ids, state) {
    var r = { total: ids.length, learned: 0, learning: 0, fresh: 0 };
    ids.forEach(function (id) {
      var s = state[id];
      if (!s) r.fresh++;
      else if (s.box >= LEARNED_BOX) r.learned++;
      else r.learning++;
    });
    r.percent = r.total ? Math.round((r.learned / r.total) * 100) : 0;
    return r;
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Вопрос с 4 вариантами: неверные берём из той же темы, при нехватке — из любой.
  function buildQuiz(item, pool, rng, n) {
    n = n || 4;
    var seen = {};
    seen[item.a] = 1;
    var others = pool.filter(function (x) { if (seen[x.a]) return false; seen[x.a] = 1; return true; });
    var same = shuffle(others.filter(function (x) { return x.cat === item.cat; }), rng);
    var rest = shuffle(others.filter(function (x) { return x.cat !== item.cat; }), rng);
    var wrong = same.concat(rest).slice(0, n - 1).map(function (x) { return x.a; });
    var options = shuffle([item.a].concat(wrong), rng);
    return { options: options, correctIndex: options.indexOf(item.a) };
  }

  // План на 30 дней: 3 недели по темам, 4-я — повторение и пробные собеседования.
  // «Про себе» (разом із польськими коренями) — на першому тижні: це питають завжди.
  var PLAN_WEEKS = [
    ["ratunek", "osobie", "bn", "wn"],
    ["religijne", "panstwowe", "zwyczaje", "kuchnia", "symbole"],
    ["historia", "kultura", "geografia"],
  ];
  function planDay(day) {
    if (day < 1 || day > 30) return null;
    if (day > 21) {
      return { day: day, cats: [], review: true, task: day >= 26 ? "Пробна співбесіда з AI (30 хв) + «Мої помилки»" : "Повторення всіх тем: картки з підказками, «Склади», розмова з AI" };
    }
    var week = Math.floor((day - 1) / 7);
    var dow = (day - 1) % 7;
    var cats = PLAN_WEEKS[week];
    if (dow < cats.length) return { day: day, cats: [cats[dow]], review: false, task: "Нова тема: картки → «Склади» → тест" };
    if (dow < 6) return { day: day, cats: cats.slice(), review: true, task: "Повторення: «Пропуски» + розмова з AI" };
    return { day: day, cats: cats.slice(), review: true, task: "Іспит за темами тижня + «Моя історія» вголос" };
  }

  // Детермінований генератор, щоб білети не змінювались між запусками.
  function seeded(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Білети як у ПДР: фіксований порядок, по size питань; останній доповнюється з початку.
  function tickets(ids, size) {
    size = size || 10;
    if (!ids.length) return [];
    var order = shuffle(ids, seeded(7));
    var out = [];
    for (var i = 0; i < order.length; i += size) {
      var t = order.slice(i, i + size);
      for (var k = 0; t.length < size && k < order.length; k++) if (t.indexOf(order[k]) < 0) t.push(order[k]);
      out.push(t);
    }
    return out;
  }

  // Випадковий білет: спершу слабкі питання (помилки, низька коробка), решта — випадкові.
  function randomTicket(ids, state, wrong, size, rng) {
    size = Math.min(size || 10, ids.length);
    rng = rng || Math.random;
    var weak = shuffle(ids.filter(function (id) { return (wrong && wrong[id]) || (state[id] && state[id].box < 2); }), rng);
    var pick = weak.slice(0, Math.ceil(size / 2));
    shuffle(ids, rng).forEach(function (id) { if (pick.length < size && pick.indexOf(id) < 0) pick.push(id); });
    return shuffle(pick, rng);
  }

  // ---------- розбір відповіді для вправ ----------
  var STOP = ["pan", "pani", "to", "jest", "są", "się", "nie", "przez", "które", "który", "która", "kiedy", "albo", "żeby", "tego", "także", "czyli", "bardzo", "mówi", "można", "często", "zwykle"];
  function sentences(a) {
    // Без lookbehind — старий Safari (iOS < 16.4) його не розбирає.
    var s = String(a), out = [], re = /[.!?…]\s+/g, last = 0, m;
    while ((m = re.exec(s))) { out.push(s.slice(last, m.index + 1)); last = m.index + m[0].length; }
    out.push(s.slice(last));
    return out.map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function words(s) { return String(s).match(/[\p{L}\d][\p{L}\d\-–]*/gu) || []; }

  // Ключові слова: числа, довгі слова, власні назви (не на початку речення).
  function keywords(a, n) {
    n = n || 4;
    var scored = [], seen = {}, pos = 0;
    sentences(a).forEach(function (s) {
      words(s).forEach(function (w, k) {
        var low = w.toLowerCase();
        pos++;
        if (seen[low] || STOP.indexOf(low) >= 0 || /^\[/.test(w)) return;
        var sc = 0;
        if (/\d/.test(w)) sc += 3;
        if (w.length >= 7) sc += 2; else if (w.length >= 5) sc += 1;
        if (k > 0 && /^\p{Lu}/u.test(w)) sc += 2;
        if (sc >= 2) { seen[low] = 1; scored.push({ w: w, sc: sc, pos: pos }); }
      });
    });
    return scored.sort(function (x, y) { return y.sc - x.sc || x.pos - y.pos; }).slice(0, n)
      .sort(function (x, y) { return x.pos - y.pos; }).map(function (x) { return x.w; });
  }

  // Початок кожного речення — друга сходинка підказки.
  function starts(a, k) {
    k = k || 2;
    return sentences(a).map(function (s) {
      var parts = s.split(/\s+/);
      return parts.length <= k ? s : parts.slice(0, k).join(" ") + " …";
    });
  }

  // Шматки по 2–3 слова для конструктора; кома завершує шматок.
  function chunks(a, size) {
    size = size || 3;
    var out = [];
    sentences(a).forEach(function (s) {
      var cur = [];
      s.split(/\s+/).forEach(function (w) {
        cur.push(w);
        if (cur.length >= size || /[,;:—–]$/.test(w)) { out.push(cur.join(" ")); cur = []; }
      });
      if (cur.length) {
        if (cur.length === 1 && out.length && words(cur[0]).length) out[out.length - 1] += " " + cur[0];
        else out.push(cur.join(" "));
      }
    });
    return out;
  }

  // Текст з пропусками: [{t: "текст"}, {gap: "слово"}, ...]
  function cloze(a, n) {
    var keys = keywords(a, n || 2);
    var parts = [{ t: String(a) }];
    keys.forEach(function (key) {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.gap) continue;
        var re = new RegExp("(^|[^\\p{L}\\d])(" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![\\p{L}\\d])", "u");
        var m = re.exec(p.t);
        if (!m) continue;
        var at = m.index + m[1].length;
        parts.splice(i, 1, { t: p.t.slice(0, at) }, { gap: key }, { t: p.t.slice(at + key.length) });
        break;
      }
    });
    return parts.filter(function (p) { return p.gap || p.t; });
  }

  function norm(s) {
    return String(s).toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  }
  function lev(a, b) {
    var d = [];
    for (var i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (var j = 1; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  // Перевірка слова: без діакритики й регістру; прощає 1 помилку і інше закінчення.
  function checkWord(input, answer) {
    var x = norm(input), y = norm(answer);
    if (!x) return "empty";
    if (x === y) return "exact";
    if (y.length < 5 || /\d/.test(y)) return "wrong"; // числа й дати — лише точно
    if (lev(x, y) <= 1) return "close";
    // Інша форма слова (opłatek / opłatkiem і навпаки): спільний початок і невелика різниця в кінці.
    if (x.slice(0, 4) === y.slice(0, 4) && lev(x, y) <= Math.max(1, Math.floor(Math.max(x.length, y.length) / 3))) return "close";
    return "wrong";
  }

  return { sentences: sentences, keywords: keywords, starts: starts, chunks: chunks, cloze: cloze, checkWord: checkWord,
    idOf: idOf, grade: grade, pickNext: pickNext, stats: stats, shuffle: shuffle, buildQuiz: buildQuiz, planDay: planDay, tickets: tickets, randomTicket: randomTicket, INTERVALS: INTERVALS, LEARNED_BOX: LEARNED_BOX };
})();
