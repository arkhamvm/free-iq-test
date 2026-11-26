/*
 * Генератор матричных заданий (3 × 3, последняя клетка пропущена).
 *
 * Каждая клетка описывается атрибутами: форма, количество, заливка, размер,
 * метка внутри и поворот (только для стрелок). Для каждого атрибута задаётся
 * правило, по которому он меняется в матрице. Значения выбираются
 * псевдослучайно, но с фиксированным зерном, поэтому задания одинаковы
 * у всех пользователей.
 *
 * Правила:
 *   const        — одинаково во всей матрице
 *   row          — своё значение в каждой строке
 *   col          — своё значение в каждом столбце
 *   prog(dr,dc)  — шаг по упорядоченной шкале: dr вниз, dc вправо
 *   latin(k)     — три значения, в каждой строке и столбце по одному разу
 *
 * Спецификация задания — строка вида "shape:latin1 fill:latin2 count:prog01".
 * Неупомянутые атрибуты постоянны.
 */
(function () {
  'use strict';

  const DOMAINS = {
    shape: ['circle', 'square', 'triangle', 'diamond', 'pentagon', 'hexagon', 'cross'],
    count: [1, 2, 3, 4, 5, 6],
    fill: ['none', 'gray', 'black'],
    size: [0.55, 0.78, 1],
    inner: ['none', 'dot', 'bar'],
    rot: [0, 45, 90, 135, 180, 225, 270, 315]
  };
  const ORDERED = { count: true, size: true, rot: true };
  const NAMES = {
    shape: 'Форма', count: 'Количество фигур', fill: 'Заливка',
    size: 'Размер', inner: 'Метка внутри', rot: 'Поворот стрелки'
  };
  const DEFAULTS = { shape: 'circle', count: 1, fill: 'none', size: 1, inner: 'none', rot: 0 };

  // Детерминированный ГПСЧ (mulberry32).
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pickDistinct(rand, arr, n) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  }

  function parseSpec(spec) {
    const rules = {};
    spec.trim().split(/\s+/).forEach((part) => {
      const [attr, rule] = part.split(':');
      const m = /^(const|row|col|latin|prog)(\d*)$/.exec(rule);
      if (!DOMAINS[attr] || !m) throw new Error('Bad spec: ' + part);
      rules[attr] = { type: m[1], arg: m[2] };
    });
    return rules;
  }

  // Строит функцию value(r, c) для одного атрибута.
  function buildRule(attr, rule, rand, fixed) {
    const dom = DOMAINS[attr];
    if (rule.type === 'const') {
      const v = fixed !== undefined ? fixed : dom[Math.floor(rand() * dom.length)];
      return { values: [v], at: () => v };
    }
    if (rule.type === 'row' || rule.type === 'col' || rule.type === 'latin') {
      let vals = pickDistinct(rand, dom, 3);
      if (ORDERED[attr]) vals.sort((a, b) => dom.indexOf(a) - dom.indexOf(b));
      if (attr === 'rot') vals = pickDistinct(rand, [0, 90, 180, 270], 3);
      const k = rule.arg === '2' ? 2 : 1;
      const at = rule.type === 'row' ? (r) => vals[r]
        : rule.type === 'col' ? (r, c) => vals[c]
          : (r, c) => vals[(c + k * r) % 3];
      return { values: vals, at };
    }
    // prog: arg = "dr dc", напр. "01" — шаг только вправо, "12" — вниз 1, вправо 2.
    const dr = parseInt(rule.arg[0] || '0', 10);
    const dc = parseInt(rule.arg[1] || '1', 10);
    const span = 2 * dr + 2 * dc;
    if (attr === 'rot') {
      const base = Math.floor(rand() * 8);
      const at = (r, c) => dom[(base + r * dr + c * dc) % 8];
      return { values: dom, at };
    }
    const maxBase = dom.length - 1 - span;
    if (maxBase < 0) throw new Error('Progression too long for ' + attr);
    const base = Math.floor(rand() * (maxBase + 1));
    return { values: dom.slice(base, base + span + 1), at: (r, c) => dom[base + r * dr + c * dc] };
  }

  const key = (cell) => [cell.shape, cell.count, cell.fill, cell.size, cell.inner, cell.rot].join('|');

  function describeRule(attr, rule) {
    const n = NAMES[attr];
    switch (rule.type) {
      case 'row': return n + ': одинакова внутри строки, в каждой строке своя.';
      case 'col': return n + ': одинакова внутри столбца, в каждом столбце своя.';
      case 'latin': return n + ': в каждой строке и каждом столбце по одному разу встречаются три варианта.';
      case 'prog': {
        const dr = rule.arg[0] || '0', dc = rule.arg[1] || '1';
        const parts = [];
        if (dc !== '0') parts.push('на ' + dc + ' шаг(а) слева направо');
        if (dr !== '0') parts.push('на ' + dr + ' шаг(а) сверху вниз');
        return n + ': меняется ' + parts.join(' и ') + '.';
      }
      default: return '';
    }
  }

  /**
   * Создаёт матричное задание.
   *   spec   — строка правил
   *   seed   — зерно
   *   nOpts  — число вариантов ответа (6 или 8)
   *   fixed  — необязательные значения для постоянных атрибутов
   */
  function makeMatrix(spec, seed, nOpts, fixed) {
    const rand = rng(seed);
    const rules = parseSpec(spec);
    fixed = Object.assign({}, fixed || {});
    if (rules.rot) fixed.shape = 'arrow';
    if (rules.size && !rules.count) fixed.count = fixed.count || 1;

    const built = {};
    Object.keys(DEFAULTS).forEach((attr) => {
      if (attr === 'shape' && fixed.shape === 'arrow') {
        built.shape = { values: ['arrow'], at: () => 'arrow' };
        return;
      }
      if (rules[attr]) {
        built[attr] = buildRule(attr, rules[attr], rand, fixed[attr]);
      } else {
        const v = fixed[attr] !== undefined ? fixed[attr] : DEFAULTS[attr];
        built[attr] = { values: [v], at: () => v };
      }
    });

    const cellAt = (r, c) => {
      const cell = {};
      Object.keys(built).forEach((attr) => { cell[attr] = built[attr].at(r, c); });
      return cell;
    };
    const matrix = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) matrix.push(r === 2 && c === 2 ? null : cellAt(r, c));
    const answer = cellAt(2, 2);

    // Отвлекающие варианты: ответ с одним (реже двумя) изменёнными атрибутами.
    const relevant = Object.keys(DEFAULTS).filter((a) => {
      const isArrow = answer.shape === 'arrow';
      if (a === 'rot') return isArrow;
      if (a === 'shape' || a === 'fill' || a === 'inner') return !isArrow;
      if (a === 'size') return answer.count <= 2;
      return true;
    });
    const varying = relevant.filter((a) => rules[a] && rules[a].type !== 'const');
    const seen = new Set([key(answer)]);
    const options = [answer];
    const alt = (attr, base) => {
      const inMatrix = built[attr].values.filter((v) => v !== base[attr]);
      const pool = inMatrix.length && rand() < 0.75 ? inMatrix : DOMAINS[attr].filter((v) => v !== base[attr]);
      return pool[Math.floor(rand() * pool.length)];
    };
    const tryAdd = (cell) => {
      if (cell.count > 6 || cell.count < 1) return;
      const k = key(cell);
      if (!seen.has(k)) { seen.add(k); options.push(cell); }
    };
    let guard = 0;
    while (options.length < nOpts && guard++ < 500) {
      const pool = varying.length && rand() < 0.8 ? varying : relevant;
      const a1 = pool[Math.floor(rand() * pool.length)];
      const cell = Object.assign({}, answer, { [a1]: alt(a1, answer) });
      if (rand() < 0.25 && relevant.length > 1) {
        const a2 = relevant[Math.floor(rand() * relevant.length)];
        if (a2 !== a1) cell[a2] = alt(a2, answer);
      }
      tryAdd(cell);
    }
    if (options.length < nOpts) throw new Error('Not enough distractors for ' + spec);

    const order = pickDistinct(rand, options.map((_, i) => i), options.length);
    const explain = Object.keys(rules).filter((a) => rules[a].type !== 'const')
      .map((a) => describeRule(a, rules[a])).join(' ');
    return {
      matrix,
      options: order.map((i) => options[i]),
      answer: order.indexOf(0),
      explain: explain || 'Все клетки одинаковы.'
    };
  }

  window.IQ_GEN = { makeMatrix, rng, DOMAINS };
})();
