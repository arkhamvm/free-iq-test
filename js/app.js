(function () {
  'use strict';

  const TESTS = window.IQ_TESTS;
  const I = window.I18N;
  const t = (k, p) => I.t(k, p);
  const DEFAULT_TEST = 'quick';
  const KEY_PREFIX = 'free-iq-test:v3:';
  const ACTIVE_KEY = 'free-iq-test:active';
  const WEIGHTS = { 1: 1, 2: 2, 3: 3 };

  // Текущий выбранный тест. Эти переменные переключаются в selectTest().
  let TEST = null;
  let QUESTIONS = [];
  let CATEGORIES = {};
  let TIME_LIMIT = 0;
  let MAX_POINTS = 1;
  let STORAGE_KEY = '';

  function selectTest(id) {
    TEST = TESTS.find((t) => t.id === id) || TESTS.find((t) => t.id === DEFAULT_TEST) || TESTS[0];
    CATEGORIES = {};
    TEST.categories.forEach((c) => {
      CATEGORIES[c] = c.length === 1 ? t('cat.series', { s: c }) : t('cat.' + c);
    });
    TIME_LIMIT = TEST.timeLimit;
    STORAGE_KEY = KEY_PREFIX + TEST.id;
    QUESTIONS = [];
  }

  // Собирает набор заданий попытки по её зерну.
  function useSeed(seed) {
    QUESTIONS = TEST.build(seed);
    MAX_POINTS = QUESTIONS.reduce((s, q) => s + WEIGHTS[q.difficulty], 0);
  }

  const $ = (id) => document.getElementById(id);
  const screens = { start: $('screen-start'), quiz: $('screen-quiz'), result: $('screen-result') };

  let state = null;
  let timerId = null;
  let finishArmed = false;

  /* ---------- Хранилище ---------- */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(ACTIVE_KEY, TEST.id);
    } catch (e) { /* приватный режим */ }
  }
  function load(key) {
    try {
      const raw = localStorage.getItem(key || STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.v === 3 && s.perms ? s : null;
    } catch (e) { return null; }
  }
  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }
  function getActive() {
    try { return localStorage.getItem(ACTIVE_KEY); } catch (e) { return null; }
  }

  /* ---------- Утилиты ---------- */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }
  function esc(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  // Функция ошибок (Abramowitz–Stegun 7.1.26) для нормального распределения.
  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return sign * y;
  }
  const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const isVisual = (q) => Array.isArray(q.matrix);

  /* ---------- Рисование фигур ---------- */
  const FILLS = { none: 'var(--card)', gray: 'var(--shape-gray)', black: 'var(--shape-black)' };
  const LAYOUTS = {
    1: [[50, 50, 30]],
    2: [[28, 50, 17], [72, 50, 17]],
    3: [[50, 29, 16], [27, 71, 16], [73, 71, 16]],
    4: [[29, 29, 15], [71, 29, 15], [29, 71, 15], [71, 71, 15]],
    5: [[24, 26, 12], [76, 26, 12], [50, 50, 12], [24, 74, 12], [76, 74, 12]],
    6: [[22, 31, 12], [50, 31, 12], [78, 31, 12], [22, 69, 12], [50, 69, 12], [78, 69, 12]]
  };

  function polygonPoints(cx, cy, r, sides, offset) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = -Math.PI / 2 + (offset || 0) + (i * 2 * Math.PI) / sides;
      pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }
  const f2 = (n) => n.toFixed(2);

  function shapeSvg(shape, x, y, r, sides) {
    switch (shape) {
      case 'circle': return '<circle cx="' + x + '" cy="' + y + '" r="' + f2(r) + '"/>';
      case 'square': {
        const h = r * 0.88;
        return '<rect x="' + f2(x - h) + '" y="' + f2(y - h) + '" width="' + f2(2 * h) + '" height="' + f2(2 * h) + '"/>';
      }
      case 'triangle': return '<polygon points="' + polygonPoints(x, y + r * 0.15, r * 1.1, 3) + '"/>';
      case 'diamond': return '<polygon points="' + polygonPoints(x, y, r * 1.1, 4) + '"/>';
      case 'pentagon': return '<polygon points="' + polygonPoints(x, y + r * 0.05, r * 1.05, 5) + '"/>';
      case 'hexagon': return '<polygon points="' + polygonPoints(x, y, r * 1.05, 6, Math.PI / 6) + '"/>';
      case 'cross': {
        const a = r * 0.36, b = r;
        const pts = [[-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a]];
        return '<polygon points="' + pts.map(([px, py]) => f2(x + px) + ',' + f2(y + py)).join(' ') + '"/>';
      }
      case 'poly': return '<polygon points="' + polygonPoints(x, y, r * 1.15, sides) + '"/>';
      default: return '';
    }
  }

  function innerSvg(inner, fill, x, y, r) {
    if (!inner || inner === 'none') return '';
    const color = fill === 'black' ? 'var(--card)' : 'var(--shape-stroke)';
    if (inner === 'dot') return '<circle cx="' + x + '" cy="' + y + '" r="' + f2(Math.max(2.2, r * 0.2)) + '" style="fill:' + color + ';stroke:none"/>';
    const h = r * 0.42;
    return '<line x1="' + f2(x - h) + '" y1="' + y + '" x2="' + f2(x + h) + '" y2="' + y + '" style="stroke:' + color + ';stroke-width:' + f2(Math.max(2.5, r * 0.14)) + ';stroke-linecap:round"/>';
  }

  function arrowSvg(x, y, r, rot) {
    const k = r / 30;
    const p = (dx, dy) => f2(x + dx * k) + ',' + f2(y + dy * k);
    return '<g transform="rotate(' + rot + ' ' + x + ' ' + y + ')" style="fill:none;stroke:var(--shape-stroke);stroke-width:' + f2(Math.max(3, 7 * k)) + ';stroke-linecap:round;stroke-linejoin:round">' +
      '<polyline points="' + p(0, 30) + ' ' + p(0, -28) + '"/><polyline points="' + p(-17, -11) + ' ' + p(0, -28) + ' ' + p(17, -11) + '"/></g>';
  }

  function cellSvg(cell, label) {
    const open = '<svg viewBox="0 0 100 100" role="img" aria-label="' + esc(label || describeCell(cell)) + '">';
    const layout = LAYOUTS[cell.count] || LAYOUTS[1];
    const size = cell.size || 1;
    if (cell.shape === 'arrow') {
      return open + layout.map(([x, y, r]) => arrowSvg(x, y, r * size, cell.rot || 0)).join('') + '</svg>';
    }
    const style = 'fill:' + FILLS[cell.fill || 'none'] + ';stroke:var(--shape-stroke);stroke-width:3.5;stroke-linejoin:round';
    return open + '<g style="' + style + '">' +
      layout.map(([x, y, r]) => shapeSvg(cell.shape, x, y, r * size, cell.sides) + innerSvg(cell.inner, cell.fill, x, y, r * size)).join('') +
      '</g></svg>';
  }

  function describeCell(cell) {
    const name = t('cell.shape.' + cell.shape, { n: cell.sides });
    if (cell.shape === 'arrow') return cell.count + ' × ' + name + ', ' + t('cell.rot', { r: cell.rot });
    const parts = [cell.count + ' × ' + name, t('cell.fill.' + (cell.fill || 'none'))];
    if (cell.size === 0.55) parts.push(t('cell.small'));
    if (cell.size === 0.78) parts.push(t('cell.medium'));
    if (cell.inner === 'dot' || cell.inner === 'bar') parts.push(t('cell.' + cell.inner));
    return parts.join(', ');
  }

  function matrixHtml(q) {
    return q.matrix.map((cell) => cell
      ? '<div class="cell">' + cellSvg(cell) + '</div>'
      : '<div class="cell missing" aria-label="' + esc(t('quiz.missing')) + '">?</div>').join('');
  }

  function optionContent(q, opt) {
    return isVisual(q) ? '<span class="pic">' + cellSvg(opt) + '</span>' : '<span>' + esc(opt) + '</span>';
  }

  /* ---------- Тексты заданий на текущем языке ---------- */
  function qText(q) {
    const tr = I.q(q.id);
    if (tr && tr.t) return tr.t;
    if (q.series) return t('prompt.seriesTask', { s: q.series, i: q.num });
    if (q.p) return t('prompt.' + q.p) + (q.seq ? '  ' + q.seq + (q.p === 'oddNumber' ? '' : ', …') : '');
    return q.text;
  }
  function qOptions(q) {
    const tr = I.q(q.id);
    return tr && tr.o ? tr.o : q.options;
  }
  function qExplain(q) {
    const tr = I.q(q.id);
    if (tr && tr.e) return tr.e;
    if (q.rules) {
      if (!q.rules.length) return t('rule.same');
      return q.rules.map((r) => {
        const a = t('rule.attr.' + r.attr);
        if (r.type !== 'prog') return t('rule.' + r.type, { a });
        if (r.dr && r.dc) return t('rule.progBoth', { a, c: r.dc, r: r.dr });
        return r.dc ? t('rule.progRight', { a, n: r.dc }) : t('rule.progDown', { a, n: r.dr });
      }).join(' ');
    }
    return q.explain;
  }

  /* ---------- Экраны ---------- */
  function show(name) {
    Object.keys(screens).forEach((k) => { screens[k].hidden = k !== name; });
    $('timer').hidden = name !== 'quiz';
    window.scrollTo(0, 0);
  }

  function newState() {
    const seed = Math.floor(Math.random() * 4294967296);
    useSeed(seed);
    const perms = {};
    QUESTIONS.forEach((q) => { perms[q.id] = shuffle(q.options.map((_, i) => i)); });
    return { v: 3, test: TEST.id, seed, perms, answers: {}, current: 0, startedAt: Date.now(), finished: false };
  }

  function renderPicker() {
    const box = $('test-picker');
    box.innerHTML = '';
    TESTS.forEach((tt) => {
      const saved = load(KEY_PREFIX + tt.id);
      const inProgress = saved && !saved.finished && (tt.timeLimit - (Date.now() - saved.startedAt) / 1000) > 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'test-card' + (tt.id === TEST.id ? ' selected' : '');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', tt.id === TEST.id ? 'true' : 'false');
      b.innerHTML = '<span class="t-badge">' + esc(t('tests.' + tt.id + '.badge')) + '</span>' +
        '<span class="t-name">' + esc(t('tests.' + tt.id + '.title')) + '</span>' +
        '<span class="t-meta">' + esc(t('start.meta', { n: tt.count, m: Math.round(tt.timeLimit / 60) })) + '</span>' +
        (inProgress ? '<span class="t-saved">' + esc(t('start.saved')) + '</span>' : '');
      b.addEventListener('click', () => { selectTest(tt.id); showStart(); });
      box.appendChild(b);
    });
    $('test-desc').textContent = t('tests.' + TEST.id + '.desc');
  }

  const testTitle = () => t('tests.' + TEST.id + '.title');

  // Перенос строки по словам для картинки (для китайского — по символам).
  function wrapLines(str, maxW, f) {
    const cv = wrapLines.cv || (wrapLines.cv = document.createElement('canvas').getContext('2d'));
    cv.font = f;
    const tokens = /\s/.test(str) ? str.split(/(\s+)/) : Array.from(str);
    const lines = [];
    let line = '';
    tokens.forEach((tok) => {
      const next = line + tok;
      if (cv.measureText(next.trim()).width > maxW && line.trim()) {
        lines.push(line.trim());
        line = tok.trim() ? tok : '';
      } else {
        line = next;
      }
    });
    if (line.trim()) lines.push(line.trim());
    return lines;
  }

  function showStart() {
    state = load();
    if (state && state.finished) state = null;
    if (state) useSeed(state.seed);
    renderPicker();
    const canResume = state && remaining() > 0;
    $('btn-resume').hidden = !canResume;
    if (canResume) $('btn-resume').textContent = t('start.resume', { time: fmtTime(remaining()) });
    $('btn-start').textContent = canResume ? t('start.beginAgain') : t('start.begin');
    show('start');
  }

  function startQuiz(resume) {
    if (!resume) state = newState();
    finishArmed = false;
    save();
    show('quiz');
    renderQuestion();
    startTimer();
  }

  /* ---------- Вопрос ---------- */
  function renderQuestion() {
    const i = state.current;
    const q = QUESTIONS[i];
    const total = QUESTIONS.length;

    $('q-counter').textContent = t('quiz.counter', { i: i + 1, n: total });
    $('q-category').textContent = CATEGORIES[q.category];
    $('q-text').textContent = qText(q);
    $('progress-bar').style.width = (Object.keys(state.answers).length / total * 100) + '%';

    const m = $('q-matrix');
    if (q.matrix) { m.innerHTML = matrixHtml(q); m.hidden = false; } else { m.hidden = true; m.innerHTML = ''; }

    const box = $('q-options');
    box.className = 'options' + (isVisual(q) ? ' visual' + (q.options.length > 6 ? ' eight' : '') : '');
    box.innerHTML = '';
    state.perms[q.id].forEach((orig, pos) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt' + (state.answers[q.id] === orig ? ' selected' : '');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', state.answers[q.id] === orig ? 'true' : 'false');
      b.innerHTML = '<span class="key">' + (pos + 1) + '</span>' + optionContent(q, qOptions(q)[orig]);
      b.addEventListener('click', () => choose(orig));
      box.appendChild(b);
    });

    $('btn-prev').disabled = i === 0;
    $('btn-next').textContent = i === total - 1 ? t('quiz.finish') : t('quiz.next');
    renderMap();
  }

  function renderMap() {
    const map = $('qmap');
    map.innerHTML = '';
    QUESTIONS.forEach((q, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = i + 1;
      if (state.answers[q.id] !== undefined) b.classList.add('answered');
      if (i === state.current) b.classList.add('current');
      b.setAttribute('aria-label', t(state.answers[q.id] !== undefined ? 'quiz.mapAnswered' : 'quiz.mapItem', { i: i + 1 }));
      b.addEventListener('click', () => go(i));
      map.appendChild(b);
    });
    resetFinishButton();
  }

  function choose(orig) {
    const q = QUESTIONS[state.current];
    state.answers[q.id] = orig;
    save();
    renderQuestion();
    // Небольшая пауза, чтобы было видно выбранный вариант.
    clearTimeout(choose.t);
    if (state.current < QUESTIONS.length - 1) {
      choose.t = setTimeout(() => { if (QUESTIONS[state.current].id === q.id) go(state.current + 1); }, 280);
    }
  }

  function go(i) {
    if (i < 0 || i >= QUESTIONS.length) return;
    state.current = i;
    save();
    renderQuestion();
    $('q-text').focus({ preventScroll: true });
  }

  function unansweredCount() {
    return QUESTIONS.filter((q) => state.answers[q.id] === undefined).length;
  }

  function resetFinishButton() {
    finishArmed = false;
    $('btn-finish').textContent = t('quiz.finishTest');
  }

  function requestFinish() {
    const left = unansweredCount();
    if (left > 0 && !finishArmed) {
      finishArmed = true;
      $('btn-finish').textContent = t('quiz.armFinish', { n: left });
      $('btn-next').textContent = t('quiz.armNext', { n: left });
      return;
    }
    finish();
  }

  /* ---------- Таймер ---------- */
  function remaining() {
    return TIME_LIMIT - (Date.now() - state.startedAt) / 1000;
  }
  function tick() {
    const r = remaining();
    const t = $('timer');
    t.textContent = fmtTime(r);
    t.classList.toggle('low', r <= 60);
    if (r <= 0) finish();
  }
  function startTimer() {
    stopTimer();
    tick();
    timerId = setInterval(tick, 500);
  }
  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  /* ---------- Подсчёт ---------- */
  function computeResult() {
    let points = 0;
    let correct = 0;
    const byCat = {};
    QUESTIONS.forEach((q) => {
      const c = byCat[q.category] || (byCat[q.category] = { correct: 0, total: 0 });
      c.total++;
      if (state.answers[q.id] === q.answer) {
        correct++;
        c.correct++;
        points += WEIGHTS[q.difficulty];
      }
    });
    // Доля набранных баллов переводится в шкалу IQ (среднее 100, σ = 15).
    // Предполагается, что средний человек набирает около половины баллов.
    const share = points / MAX_POINTS;
    const iq = Math.round(Math.min(145, Math.max(55, 100 + 15 * (share - 0.5) / 0.17)));
    const percentile = Math.round(normCdf((iq - 100) / 15) * 1000) / 10;
    const used = Math.min(TIME_LIMIT, ((state.finishedAt || Date.now()) - state.startedAt) / 1000);
    return { iq, percentile, correct, points, byCat, used };
  }

  function level(iq) {
    if (iq >= 130) return t('level.veryHigh');
    if (iq >= 115) return t('level.above');
    if (iq >= 85) return t('level.average');
    if (iq >= 70) return t('level.below');
    return t('level.wellBelow');
  }

  function finish() {
    stopTimer();
    if (!state.finished) {
      state.finished = true;
      state.finishedAt = Date.now();
      save();
    }
    renderResult();
  }

  /* ---------- Результат ---------- */
  function bellSvg(iq) {
    const W = 480, H = 140, min = 55, max = 145;
    const x = (v) => ((v - min) / (max - min)) * W;
    const y = (v) => H - 18 - Math.exp(-Math.pow((v - 100) / 15, 2) / 2) * (H - 30);
    let line = '', area = 'M' + x(min) + ',' + (H - 18);
    for (let v = min; v <= max; v += 1) {
      line += (v === min ? 'M' : 'L') + x(v).toFixed(1) + ',' + y(v).toFixed(1);
      if (v <= iq) area += 'L' + x(v).toFixed(1) + ',' + y(v).toFixed(1);
    }
    area += 'L' + x(iq) + ',' + (H - 18) + 'Z';
    const ticks = [70, 85, 100, 115, 130].map((t) =>
      '<text x="' + x(t) + '" y="' + (H - 2) + '" text-anchor="middle" font-size="12" fill="var(--muted)">' + t + '</text>').join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(t('result.bell')) + '">' +
      '<path d="' + area + '" fill="var(--accent-soft)"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--muted)" stroke-width="2"/>' +
      '<line x1="' + x(iq) + '" x2="' + x(iq) + '" y1="8" y2="' + (H - 18) + '" stroke="var(--accent)" stroke-width="3"/>' +
      '<line x1="0" x2="' + W + '" y1="' + (H - 18) + '" y2="' + (H - 18) + '" stroke="var(--border)"/>' +
      ticks + '</svg>';
  }

  function renderResult() {
    const r = computeResult();
    show('result');
    $('r-test').textContent = t('result.test', { name: testTitle() });
    $('r-note').textContent = t('result.note', { n: QUESTIONS.length });
    $('r-iq').textContent = r.iq;
    $('r-level').textContent = level(r.iq);
    $('r-bell').innerHTML = bellSvg(r.iq);
    const better = Math.max(0.1, Math.min(99.9, r.percentile));
    $('r-summary').textContent = t('result.summary', { p: I.num(better, 1) });
    $('r-correct').textContent = r.correct + ' / ' + QUESTIONS.length;
    $('r-percentile').textContent = Math.round(better);
    $('r-time').textContent = fmtTime(r.used);

    $('r-categories').innerHTML = Object.keys(CATEGORIES).filter((k) => r.byCat[k]).map((k) => {
      const c = r.byCat[k];
      const pct = Math.round((c.correct / c.total) * 100);
      return '<div class="cat-row"><span>' + esc(CATEGORIES[k]) + '</span><span class="cat-score">' + c.correct + ' / ' + c.total + '</span>' +
        '<div class="cat-bar"><span style="width:' + pct + '%"></span></div></div>';
    }).join('');

    $('review').hidden = true;
    $('review').innerHTML = '';
    $('btn-review').textContent = t('result.review');
    $('share-status').textContent = '';
    $('share-panel').hidden = true;
  }

  function renderReview() {
    const box = $('review');
    if (!box.hidden) {
      box.hidden = true;
      $('btn-review').textContent = t('result.review');
      return;
    }
    box.innerHTML = QUESTIONS.map((q, i) => {
      const given = state.answers[q.id];
      const ok = given === q.answer;
      const pill = (cls, label, opt) => '<span class="pill ' + cls + '">' + label + ' ' +
        (isVisual(q) ? cellSvg(opt) : '<strong>' + esc(opt) + '</strong>') + '</span>';
      let ans = '';
      const opts = qOptions(q);
      if (given === undefined) ans += '<span class="pill bad">' + esc(t('review.none')) + '</span>';
      else if (!ok) ans += pill('bad', esc(t('review.yours')), opts[given]);
      ans += pill('ok', esc(t(ok ? 'review.right' : 'review.correct')), opts[q.answer]);
      return '<article class="card review-item ' + (ok ? 'ok' : 'bad') + '">' +
        '<div class="q-meta"><span>' + esc(t('review.question', { i: i + 1 })) + '</span><span class="tag">' + esc(CATEGORIES[q.category]) + '</span></div>' +
        '<p class="q-text">' + esc(qText(q)) + '</p>' +
        (q.matrix ? '<div class="matrix">' + matrixHtml(q) + '</div>' : '') +
        '<div class="review-ans">' + ans + '</div>' +
        '<p class="review-explain">' + esc(qExplain(q)) + '</p></article>';
    }).join('');
    box.hidden = false;
    $('btn-review').textContent = t('result.hideReview');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Поделиться ---------- */
  const shareUrl = () => location.origin + location.pathname;
  const shareText = (r) => {
    const lvl = level(r.iq);
    return t('share.text', { iq: r.iq, name: testTitle(), level: I.lang === 'de' ? lvl : lvl.toLocaleLowerCase(I.lang) });
  };

  // Картинка в мобильном формате: карточка результата, разбивка по типам и ссылка.
  function drawShareImage(r) {
    const C = {
      bg: '#12141c', card: '#1b1e29', border: '#2c3040', text: '#e8eaf2', muted: '#9aa1b5',
      accent: '#8b85ff', soft: '#2f2d5e', box: '#12141c'
    };
    const W = 1080, PAD = 40, CX = PAD, CW = W - 2 * PAD;
    const cats = Object.keys(CATEGORIES).filter((k) => r.byCat[k]);
    const card1Top = 130, card1H = 1180;
    const card2Top = card1Top + card1H + 40, card2H = 150 + cats.length * 118;
    const linkTop = card2Top + card2H + 40, linkH = 200;
    const H = linkTop + linkH + 50;

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const font = (w, px) => w + ' ' + px + 'px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    const rrect = (x, y, w, h, rad, fill, stroke) => {
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, w, h, rad); else g.rect(x, y, w, h);
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 3; g.stroke(); }
    };
    const text = (str, x, y, f, color, align) => {
      g.font = f; g.fillStyle = color; g.textAlign = align || 'center'; g.fillText(str, x, y);
    };

    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    text('🧠 Free IQ Test', PAD, 85, font('700', 46), C.text, 'left');
    text(testTitle(), W - PAD, 85, font('600', 40), C.muted, 'right');

    // Карточка результата
    rrect(CX, card1Top, CW, card1H, 40, C.card, C.border);
    text(t('result.label'), W / 2, card1Top + 100, font('500', 46), C.muted);
    text(String(r.iq), W / 2, card1Top + 340, font('800', 250), C.accent);
    text(level(r.iq), W / 2, card1Top + 450, font('700', 60), C.text);

    const x0 = CX + 50, x1 = CX + CW - 50, base = card1Top + 740, hgt = 230, min = 55, max = 145;
    const px = (v) => x0 + ((v - min) / (max - min)) * (x1 - x0);
    const py = (v) => base - Math.exp(-Math.pow((v - 100) / 15, 2) / 2) * hgt;
    g.beginPath(); g.moveTo(px(min), base);
    for (let v = min; v <= r.iq; v++) g.lineTo(px(v), py(v));
    g.lineTo(px(r.iq), base); g.closePath();
    g.fillStyle = C.soft; g.fill();
    g.beginPath();
    for (let v = min; v <= max; v++) (v === min ? g.moveTo : g.lineTo).call(g, px(v), py(v));
    g.strokeStyle = C.muted; g.lineWidth = 4; g.stroke();
    g.beginPath(); g.moveTo(x0, base); g.lineTo(x1, base); g.strokeStyle = C.border; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.moveTo(px(r.iq), base); g.lineTo(px(r.iq), base - hgt - 20); g.strokeStyle = C.accent; g.lineWidth = 7; g.stroke();
    [70, 85, 100, 115, 130].forEach((t) => text(String(t), px(t), base + 45, font('500', 30), C.muted));

    const better = Math.max(0.1, Math.min(99.9, r.percentile));
    wrapLines(t('result.summary', { p: I.num(better, 1) }), CW - 100, font('500', 44)).slice(0, 2)
      .forEach((line, li, arr) => text(line, W / 2, card1Top + (arr.length === 1 ? 910 : 880 + li * 60), font('500', 44), C.text));

    const stats = [[r.correct + ' / ' + QUESTIONS.length, t('result.correct')], [String(Math.round(better)), t('result.percentile')], [fmtTime(r.used), t('result.time')]];
    const gap = 24, bw = (CW - 80 - 2 * gap) / 3, by = card1Top + 990;
    stats.forEach(([v, l], i) => {
      const bx = CX + 40 + i * (bw + gap);
      rrect(bx, by, bw, 150, 24, C.box);
      text(v, bx + bw / 2, by + 75, font('700', 60), C.text);
      text(l, bx + bw / 2, by + 125, font('500', 34), C.muted);
    });

    // Карточка «По типам заданий»
    rrect(CX, card2Top, CW, card2H, 40, C.card, C.border);
    text(t('result.byType'), CX + 50, card2Top + 95, font('700', 52), C.text, 'left');
    cats.forEach((k, i) => {
      const c = r.byCat[k];
      const y = card2Top + 185 + i * 118;
      text(CATEGORIES[k], CX + 50, y, font('500', 42), C.text, 'left');
      text(c.correct + ' / ' + c.total, CX + CW - 50, y, font('500', 42), C.muted, 'right');
      rrect(CX + 50, y + 26, CW - 100, 18, 9, C.border);
      if (c.correct) rrect(CX + 50, y + 26, (CW - 100) * c.correct / c.total, 18, 9, C.accent);
    });

    // Ссылка на тест
    rrect(CX, linkTop, CW, linkH, 40, C.accent);
    text(t('share.cta'), W / 2, linkTop + 85, font('700', 54), C.bg);
    let link = shareUrl().replace(/^https?:\/\//, '').replace(/\/$/, '');
    g.font = font('600', 40);
    while (g.measureText(link).width > CW - 80 && link.length > 10) link = link.slice(0, -2);
    text(link, W / 2, linkTop + 150, font('600', 40), C.bg);
    return cv;
  }

  const canvasBlob = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));

  async function share() {
    const r = computeResult();
    const url = shareUrl();
    const text = shareText(r);
    const status = $('share-status');
    status.textContent = '';
    const cv = drawShareImage(r);
    const blob = await canvasBlob(cv);
    const file = blob && typeof File === 'function' ? new File([blob], 'iq-result.png', { type: 'image/png' }) : null;

    // На телефонах: системное меню «Поделиться» с картинкой и текстом.
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: t('share.appTitle'), text: text + ' ' + url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    // Иначе: панель с картинкой и кнопками мессенджеров.
    const panel = $('share-panel');
    const imgUrl = blob ? URL.createObjectURL(blob) : cv.toDataURL('image/png');
    $('share-img').src = imgUrl;
    $('share-download').href = imgUrl;
    const enc = encodeURIComponent;
    $('share-tg').href = 'https://t.me/share/url?url=' + enc(url) + '&text=' + enc(text);
    $('share-wa').href = 'https://wa.me/?text=' + enc(text + ' ' + url);
    $('share-vk').href = 'https://vk.com/share.php?url=' + enc(url) + '&title=' + enc(text);
    $('share-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(text + ' ' + url);
        status.textContent = t('share.copied');
      } catch (e) {
        status.textContent = text + ' ' + url;
      }
    };
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function restart() {
    clear();
    state = null;
    startQuiz(false);
  }

  /* ---------- События ---------- */
  $('btn-start').addEventListener('click', () => startQuiz(false));
  $('btn-resume').addEventListener('click', () => startQuiz(true));
  $('btn-prev').addEventListener('click', () => go(state.current - 1));
  $('btn-next').addEventListener('click', () => {
    if (state.current === QUESTIONS.length - 1) requestFinish();
    else go(state.current + 1);
  });
  $('btn-finish').addEventListener('click', requestFinish);
  $('btn-review').addEventListener('click', renderReview);
  $('btn-share').addEventListener('click', share);
  $('btn-restart').addEventListener('click', restart);
  $('btn-choose').addEventListener('click', () => {
    try { localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* ignore */ }
    showStart();
  });

  document.addEventListener('keydown', (e) => {
    if (screens.quiz.hidden || e.altKey || e.ctrlKey || e.metaKey) return;
    const q = QUESTIONS[state.current];
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= q.options.length) {
      choose(state.perms[q.id][n - 1]);
    } else if (e.key === 'ArrowRight') {
      $('btn-next').click();
    } else if (e.key === 'ArrowLeft') {
      go(state.current - 1);
    }
  });

  /* ---------- Язык ---------- */
  function setupLanguage() {
    const sel = $('lang-select');
    I.langs().forEach((l) => {
      const o = document.createElement('option');
      o.value = l.code;
      o.textContent = l.name;
      sel.appendChild(o);
    });
    I.set(I.detect(), false);
    sel.value = I.lang;
    sel.addEventListener('change', () => {
      I.set(sel.value, true);
      selectTest(TEST.id);
      if (state) useSeed(state.seed);
      if (!screens.quiz.hidden) renderQuestion();
      else if (!screens.result.hidden) renderResult();
      else showStart();
    });
  }

  /* ---------- Старт ---------- */
  $('q-text').tabIndex = -1;
  setupLanguage();
  selectTest(getActive() || DEFAULT_TEST);
  state = load();
  if (state) useSeed(state.seed);
  if (state && state.finished) {
    renderResult();
  } else if (state && remaining() <= 0) {
    // Время вышло, пока вкладка была закрыта.
    finish();
  } else {
    showStart();
  }
})();
