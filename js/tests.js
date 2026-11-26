/*
 * Описание тестов. Каждый тест умеет собрать набор заданий по зерну (seed):
 * при каждой новой попытке зерно случайное, при продолжении теста — сохранённое,
 * поэтому набор заданий восстанавливается точно таким же.
 */
(function () {
  'use strict';
  const GEN = window.IQ_GEN;
  const BANK = window.IQ_BANK;

  // Правила матриц по сериям: от одного меняющегося признака до четырёх.
  const SERIES = {
    A: ['count:prog01', 'shape:row', 'fill:col', 'size:prog01', 'count:prog10', 'shape:col',
      'fill:row', 'inner:col', 'rot:prog01', 'count:prog11', 'size:prog10', 'shape:latin1'],
    B: ['shape:row count:prog01', 'fill:row shape:col', 'size:prog01 fill:row', 'count:prog10 fill:col',
      'shape:col inner:row', 'rot:prog01 count:prog10', 'shape:latin1 fill:col', 'count:prog01 inner:row',
      'fill:latin1 shape:row', 'size:prog10 shape:col', 'count:prog11 shape:row', 'inner:latin1 count:prog01'],
    C: ['shape:latin1 fill:latin2', 'count:latin1 shape:row', 'shape:latin2 count:prog01',
      'fill:latin1 inner:col shape:row', 'rot:prog12', 'shape:latin1 size:prog01',
      'count:latin2 fill:latin1', 'inner:latin1 fill:row shape:col', 'shape:latin1 count:prog10',
      'size:latin1 fill:latin2', 'count:prog11 fill:latin1', 'shape:latin2 inner:latin1'],
    D: ['shape:latin1 fill:latin2 count:prog01', 'shape:latin2 count:latin1 fill:row',
      'shape:latin1 fill:latin2 inner:col', 'count:latin1 fill:latin2 inner:row',
      'rot:prog21 count:latin1', 'shape:latin1 inner:latin2 fill:col',
      'size:latin1 shape:latin2 fill:row', 'count:prog11 shape:latin1 fill:latin2',
      'shape:latin1 fill:latin1 count:prog10', 'inner:latin1 count:latin2 shape:col',
      'fill:latin1 size:prog01 shape:latin2', 'shape:latin1 count:latin2 inner:col'],
    E: ['shape:latin1 fill:latin2 count:prog01 inner:row', 'shape:latin2 count:latin1 fill:latin1 inner:col',
      'rot:prog13 count:latin2', 'shape:latin1 fill:latin2 inner:latin1 count:prog10',
      'count:latin1 shape:latin2 fill:col inner:latin2', 'size:latin2 shape:latin1 fill:latin1 inner:col',
      'shape:latin1 fill:latin2 inner:latin2 count:prog11', 'count:prog11 shape:latin2 fill:latin1 inner:row',
      'rot:prog23 count:latin1', 'shape:latin1 count:latin2 fill:latin2 inner:latin1',
      'shape:latin2 fill:latin1 inner:latin2 size:prog01', 'shape:latin1 count:latin1 fill:latin2 inner:latin2']
  };
  const SERIES_DIFF = { A: 1, B: 1, C: 2, D: 2, E: 3 };
  const SPECS_BY_DIFF = { 1: [], 2: [], 3: [] };
  Object.keys(SERIES).forEach((s) => SPECS_BY_DIFF[SERIES_DIFF[s]].push(...SERIES[s]));

  const seedFrom = (rand) => Math.floor(rand() * 4294967296);
  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Новые матрицы заданной сложности.
  function freshMatrices(diff, n, rand, prefix) {
    const specs = shuffle(SPECS_BY_DIFF[diff], rand).slice(0, n);
    return specs.map((spec, i) => Object.assign({
      id: prefix + diff + '-' + i,
      category: 'matrix',
      difficulty: diff,
      p: 'matrixCell'
    }, GEN.makeMatrix(spec, seedFrom(rand), 6)));
  }

  /*
   * Случайный набор из банка с квотами по типам заданий. Внутри типа задания
   * берутся по очереди из уровней сложности 1, 2, 3 — так у каждой попытки
   * примерно одинаковая сложность. Итог упорядочен от лёгких к сложным.
   */
  function sampleSet(quotas, seed) {
    const rand = GEN.rng(seed);
    const picked = [];
    Object.keys(quotas).forEach((cat) => {
      let pool = BANK.filter((q) => q.category === cat);
      if (cat === 'matrix') {
        [1, 2, 3].forEach((d) => { pool = pool.concat(freshMatrices(d, 3, rand, 'g')); });
      }
      const levels = [1, 2, 3].map((d) => shuffle(pool.filter((q) => q.difficulty === d), rand));
      let taken = 0, li = Math.floor(rand() * 3), guard = 0;
      while (taken < quotas[cat] && guard++ < 1000) {
        const lvl = levels[li % 3];
        if (lvl.length) { picked.push(lvl.shift()); taken++; }
        li++;
      }
    });
    return [1, 2, 3].reduce((out, d) => out.concat(shuffle(picked.filter((q) => q.difficulty === d), rand)), []);
  }

  // Названия тестов, категорий и тексты — в словарях js/i18n/*.js.
  const TEXT_CATEGORIES = ['numbers', 'letters', 'verbal', 'logic', 'matrix'];
  const QUICK_QUOTAS = { numbers: 8, letters: 3, verbal: 5, logic: 8, matrix: 6 };
  const MIXED_QUOTAS = { numbers: 12, letters: 6, verbal: 10, logic: 6, matrix: 6 };
  const sum = (o) => Object.keys(o).reduce((s, k) => s + o[k], 0);

  window.IQ_TESTS = [
    {
      id: 'quick',
      timeLimit: 25 * 60,
      count: sum(QUICK_QUOTAS),
      categories: TEXT_CATEGORIES,
      build: (seed) => sampleSet(QUICK_QUOTAS, seed)
    },
    {
      id: 'mixed',
      timeLimit: 30 * 60,
      count: sum(MIXED_QUOTAS),
      categories: TEXT_CATEGORIES,
      build: (seed) => sampleSet(MIXED_QUOTAS, seed)
    },
    {
      id: 'matrices',
      timeLimit: 40 * 60,
      count: 60,
      categories: ['A', 'B', 'C', 'D', 'E'],
      build: (seed) => {
        const rand = GEN.rng(seed);
        const out = [];
        Object.keys(SERIES).forEach((s) => {
          SERIES[s].forEach((spec, i) => {
            out.push(Object.assign({
              id: s + (i + 1),
              category: s,
              difficulty: SERIES_DIFF[s],
              series: s,
              num: i + 1
            }, GEN.makeMatrix(spec, seedFrom(rand), s === 'A' || s === 'B' ? 6 : 8)));
          });
        });
        return out;
      }
    }
  ];
})();
