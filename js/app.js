(function () {
  'use strict';

  const QUESTIONS = window.IQ_QUESTIONS;
  const CATEGORIES = window.IQ_CATEGORIES;
  const TIME_LIMIT = 25 * 60; // секунд
  const STORAGE_KEY = 'free-iq-test:v1';
  const WEIGHTS = { 1: 1, 2: 2, 3: 3 };
  const MAX_POINTS = QUESTIONS.reduce((s, q) => s + WEIGHTS[q.difficulty], 0);

  const $ = (id) => document.getElementById(id);
  const screens = { start: $('screen-start'), quiz: $('screen-quiz'), result: $('screen-result') };

  let state = null;
  let timerId = null;
  let finishArmed = false;

  /* ---------- Хранилище ---------- */
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* приватный режим */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.v === 1 && s.perms ? s : null;
    } catch (e) { return null; }
  }
  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
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
  const isVisual = (q) => q.category === 'matrix';

  /* ---------- Рисование фигур ---------- */
  const FILLS = { none: 'var(--card)', gray: 'var(--shape-gray)', black: 'var(--shape-black)' };
  const LAYOUTS = {
    1: [[50, 50, 30]],
    2: [[28, 50, 17], [72, 50, 17]],
    3: [[50, 29, 16], [27, 71, 16], [73, 71, 16]],
    4: [[29, 29, 15], [71, 29, 15], [29, 71, 15], [71, 71, 15]]
  };

  function polygonPoints(cx, cy, r, sides) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
      pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }

  function shapeSvg(shape, x, y, r, sides) {
    switch (shape) {
      case 'circle': return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"/>';
      case 'square': {
        const h = r * 0.88;
        return '<rect x="' + (x - h) + '" y="' + (y - h) + '" width="' + 2 * h + '" height="' + 2 * h + '"/>';
      }
      case 'triangle': return '<polygon points="' + polygonPoints(x, y + r * 0.15, r * 1.1, 3) + '"/>';
      case 'poly': return '<polygon points="' + polygonPoints(x, y, r * 1.15, sides) + '"/>';
      default: return '';
    }
  }

  function cellSvg(cell, label) {
    const open = '<svg viewBox="0 0 100 100" role="img" aria-label="' + esc(label || describeCell(cell)) + '">';
    if (cell.shape === 'arrow') {
      return open + '<g transform="rotate(' + cell.rot + ' 50 50)" style="fill:none;stroke:var(--shape-stroke);stroke-width:7;stroke-linecap:round;stroke-linejoin:round">' +
        '<line x1="50" y1="80" x2="50" y2="22"/><polyline points="33,39 50,22 67,39"/></g></svg>';
    }
    const layout = LAYOUTS[cell.count] || LAYOUTS[1];
    const style = 'fill:' + FILLS[cell.fill || 'none'] + ';stroke:var(--shape-stroke);stroke-width:3.5;stroke-linejoin:round';
    return open + '<g style="' + style + '">' +
      layout.map(([x, y, r]) => shapeSvg(cell.shape, x, y, r, cell.sides)).join('') + '</g></svg>';
  }

  function describeCell(cell) {
    if (cell.shape === 'arrow') return 'стрелка, поворот ' + cell.rot + '°';
    const names = { circle: 'круг', square: 'квадрат', triangle: 'треугольник', poly: cell.sides + '-угольник' };
    const fills = { none: 'белый', gray: 'серый', black: 'чёрный' };
    return cell.count + ' × ' + names[cell.shape] + ', ' + fills[cell.fill || 'none'];
  }

  function matrixHtml(q) {
    return q.matrix.map((cell) => cell
      ? '<div class="cell">' + cellSvg(cell) + '</div>'
      : '<div class="cell missing" aria-label="пропущенная клетка">?</div>').join('');
  }

  function optionContent(q, opt) {
    return isVisual(q) ? '<span class="pic">' + cellSvg(opt) + '</span>' : '<span>' + esc(opt) + '</span>';
  }

  /* ---------- Экраны ---------- */
  function show(name) {
    Object.keys(screens).forEach((k) => { screens[k].hidden = k !== name; });
    $('timer').hidden = name !== 'quiz';
    window.scrollTo(0, 0);
  }

  function newState() {
    const perms = {};
    QUESTIONS.forEach((q) => { perms[q.id] = shuffle(q.options.map((_, i) => i)); });
    return { v: 1, perms, answers: {}, current: 0, startedAt: Date.now(), finished: false };
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

    $('q-counter').textContent = 'Вопрос ' + (i + 1) + ' из ' + total;
    $('q-category').textContent = CATEGORIES[q.category];
    $('q-text').textContent = q.text;
    $('progress-bar').style.width = (Object.keys(state.answers).length / total * 100) + '%';

    const m = $('q-matrix');
    if (q.matrix) { m.innerHTML = matrixHtml(q); m.hidden = false; } else { m.hidden = true; m.innerHTML = ''; }

    const box = $('q-options');
    box.className = 'options' + (isVisual(q) ? ' visual' : '');
    box.innerHTML = '';
    state.perms[q.id].forEach((orig, pos) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt' + (state.answers[q.id] === orig ? ' selected' : '');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', state.answers[q.id] === orig ? 'true' : 'false');
      b.innerHTML = '<span class="key">' + (pos + 1) + '</span>' + optionContent(q, q.options[orig]);
      b.addEventListener('click', () => choose(orig));
      box.appendChild(b);
    });

    $('btn-prev').disabled = i === 0;
    $('btn-next').textContent = i === total - 1 ? 'Завершить' : 'Далее →';
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
      b.setAttribute('aria-label', 'Вопрос ' + (i + 1) + (state.answers[q.id] !== undefined ? ', есть ответ' : ''));
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
    $('btn-finish').textContent = 'Завершить тест';
  }

  function requestFinish() {
    const left = unansweredCount();
    if (left > 0 && !finishArmed) {
      finishArmed = true;
      $('btn-finish').textContent = 'Без ответа: ' + left + '. Нажмите ещё раз, чтобы завершить';
      $('btn-next').textContent = 'Без ответа: ' + left + '. Завершить?';
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
    if (iq >= 130) return 'Очень высокий результат';
    if (iq >= 115) return 'Выше среднего';
    if (iq >= 85) return 'Средний уровень';
    if (iq >= 70) return 'Ниже среднего';
    return 'Значительно ниже среднего';
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
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Положение результата на нормальном распределении">' +
      '<path d="' + area + '" fill="var(--accent-soft)"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--muted)" stroke-width="2"/>' +
      '<line x1="' + x(iq) + '" x2="' + x(iq) + '" y1="8" y2="' + (H - 18) + '" stroke="var(--accent)" stroke-width="3"/>' +
      '<line x1="0" x2="' + W + '" y1="' + (H - 18) + '" y2="' + (H - 18) + '" stroke="var(--border)"/>' +
      ticks + '</svg>';
  }

  function renderResult() {
    const r = computeResult();
    show('result');
    $('r-iq').textContent = r.iq;
    $('r-level').textContent = level(r.iq);
    $('r-bell').innerHTML = bellSvg(r.iq);
    const better = Math.max(0.1, Math.min(99.9, r.percentile));
    $('r-summary').textContent = 'Ваш результат выше, чем примерно у ' + String(better).replace('.', ',') + ' % людей.';
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
    $('btn-review').textContent = 'Разбор ответов';
    $('share-status').textContent = '';
    state.lastIq = r.iq;
  }

  function renderReview() {
    const box = $('review');
    if (!box.hidden) {
      box.hidden = true;
      $('btn-review').textContent = 'Разбор ответов';
      return;
    }
    box.innerHTML = QUESTIONS.map((q, i) => {
      const given = state.answers[q.id];
      const ok = given === q.answer;
      const pill = (cls, label, opt) => '<span class="pill ' + cls + '">' + label + ' ' +
        (isVisual(q) ? cellSvg(opt) : '<strong>' + esc(opt) + '</strong>') + '</span>';
      let ans = '';
      if (given === undefined) ans += '<span class="pill bad">Нет ответа</span>';
      else if (!ok) ans += pill('bad', 'Ваш ответ:', q.options[given]);
      ans += pill('ok', ok ? 'Верно:' : 'Правильно:', q.options[q.answer]);
      return '<article class="card review-item ' + (ok ? 'ok' : 'bad') + '">' +
        '<div class="q-meta"><span>Вопрос ' + (i + 1) + '</span><span class="tag">' + esc(CATEGORIES[q.category]) + '</span></div>' +
        '<p class="q-text">' + esc(q.text) + '</p>' +
        (q.matrix ? '<div class="matrix">' + matrixHtml(q) + '</div>' : '') +
        '<div class="review-ans">' + ans + '</div>' +
        '<p class="review-explain">' + esc(q.explain) + '</p></article>';
    }).join('');
    box.hidden = false;
    $('btn-review').textContent = 'Скрыть разбор';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function share() {
    const url = location.origin + location.pathname;
    const text = 'Мой результат в бесплатном IQ-тесте: ' + state.lastIq + '. Попробуйте сами!';
    const status = $('share-status');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Бесплатный IQ-тест', text, url });
        return;
      }
      await navigator.clipboard.writeText(text + ' ' + url);
      status.textContent = 'Ссылка скопирована в буфер обмена.';
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      status.textContent = text + ' ' + url;
    }
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

  /* ---------- Старт ---------- */
  $('q-text').tabIndex = -1;
  state = load();
  if (state && state.finished) {
    renderResult();
  } else if (state && remaining() > 0) {
    $('btn-resume').hidden = false;
    $('btn-resume').textContent = 'Продолжить (осталось ' + fmtTime(remaining()) + ')';
    show('start');
  } else if (state) {
    // Время вышло, пока вкладка была закрыта.
    finish();
  } else {
    show('start');
  }
})();
