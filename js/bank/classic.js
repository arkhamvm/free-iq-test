/*
 * Банк заданий, часть 1. Все задания оригинальные.
 * Из общего банка тесты «Быстрый» и «Смешанный» каждый раз берут случайный набор.
 *
 * Поля вопроса:
 *   id        — уникальный идентификатор
 *   category  — numbers | letters | verbal | logic | matrix
 *   difficulty— 1 (лёгкий) .. 3 (сложный), влияет на вес при подсчёте
 *   text      — текст вопроса
 *   options   — варианты ответа (строки или описания ячеек для матриц)
 *   answer    — индекс правильного варианта в options
 *   explain   — короткое объяснение, показывается при разборе
 *   matrix    — (только для matrix) 3×3 ячейки, последняя — null
 */
(function () {
  'use strict';

  // Короткие конструкторы ячеек для матричных заданий.
  const c = (shape, count, fill, extra) =>
    Object.assign({ shape, count: count || 1, fill: fill || 'none' }, extra || {});
  const arrow = (rot) => ({ shape: 'arrow', count: 1, fill: 'none', rot });
  const poly = (sides, fill) => ({ shape: 'poly', count: 1, sides, fill: fill || 'none' });

  const questions = [
    {
      id: 'n1', category: 'numbers', difficulty: 1,
      text: 'Какое число продолжает ряд?  2, 4, 8, 16, …',
      options: ['24', '30', '32', '34'], answer: 2,
      explain: 'Каждое число вдвое больше предыдущего: 16 × 2 = 32.'
    },
    {
      id: 'v1', category: 'verbal', difficulty: 1,
      text: 'Птица относится к гнезду так же, как пчела относится к …',
      options: ['мёду', 'цветку', 'улью', 'крылу'], answer: 2,
      explain: 'Гнездо — жилище птицы, улей — жилище пчелы.'
    },
    {
      id: 'm1', category: 'matrix', difficulty: 1,
      text: 'Какая фигура должна стоять на месте знака вопроса?',
      matrix: [
        c('circle', 1), c('circle', 2), c('circle', 3),
        c('square', 1), c('square', 2), c('square', 3),
        c('triangle', 1), c('triangle', 2), null
      ],
      options: [
        c('triangle', 2), c('square', 3), c('triangle', 3),
        c('triangle', 4), c('circle', 3), c('triangle', 3, 'black')
      ],
      answer: 2,
      explain: 'В каждой строке своя фигура, а количество фигур растёт слева направо: 1, 2, 3.'
    },
    {
      id: 'n2', category: 'numbers', difficulty: 1,
      text: 'Какое число продолжает ряд?  81, 27, 9, 3, …',
      options: ['0', '1', '2', '1/9'], answer: 1,
      explain: 'Каждое число делится на 3: 3 ÷ 3 = 1.'
    },
    {
      id: 'o1', category: 'verbal', difficulty: 1,
      text: 'Какое слово лишнее?',
      options: ['квадрат', 'треугольник', 'круг', 'куб', 'ромб'], answer: 3,
      explain: 'Куб — объёмное тело, остальные — плоские фигуры.'
    },
    {
      id: 'n3', category: 'numbers', difficulty: 1,
      text: 'Какое число продолжает ряд?  1, 1, 2, 3, 5, 8, …',
      options: ['11', '12', '13', '16'], answer: 2,
      explain: 'Каждое число равно сумме двух предыдущих: 5 + 8 = 13.'
    },
    {
      id: 'l1', category: 'logic', difficulty: 1,
      text: 'У каждой из четырёх сестёр есть один брат. Сколько всего детей в семье?',
      options: ['4', '5', '8', '9'], answer: 1,
      explain: 'Брат у всех сестёр один и тот же: 4 сестры + 1 брат = 5.'
    },
    {
      id: 'v2', category: 'verbal', difficulty: 1,
      text: 'Врач относится к больнице так же, как учитель относится к …',
      options: ['ученику', 'школе', 'уроку', 'доске'], answer: 1,
      explain: 'Больница — место работы врача, школа — место работы учителя.'
    },
    {
      id: 'n4', category: 'numbers', difficulty: 2,
      text: 'Какое число продолжает ряд?  3, 6, 11, 18, 27, …',
      options: ['36', '38', '39', '40'], answer: 1,
      explain: 'Разности растут на 2: +3, +5, +7, +9, +11 → 27 + 11 = 38.'
    },
    {
      id: 'm2', category: 'matrix', difficulty: 2,
      text: 'Какая фигура должна стоять на месте знака вопроса?',
      matrix: [
        c('circle', 1, 'none'), c('square', 1, 'gray'), c('triangle', 1, 'black'),
        c('square', 1, 'black'), c('triangle', 1, 'none'), c('circle', 1, 'gray'),
        c('triangle', 1, 'gray'), c('circle', 1, 'black'), null
      ],
      options: [
        c('square', 1, 'gray'), c('square', 1, 'none'), c('circle', 1, 'none'),
        c('square', 1, 'black'), c('triangle', 1, 'none'), c('triangle', 1, 'gray')
      ],
      answer: 1,
      explain: 'В каждой строке и каждом столбце по одному кругу, квадрату и треугольнику, и по одной белой, серой и чёрной фигуре. Не хватает белого квадрата.'
    },
    {
      id: 'n5', category: 'numbers', difficulty: 2,
      text: 'Какое число продолжает ряд?  2, 6, 12, 20, 30, …',
      options: ['36', '40', '42', '44'], answer: 2,
      explain: 'Это n × (n + 1): 1·2, 2·3, 3·4, 4·5, 5·6, далее 6·7 = 42.'
    },
    {
      id: 'v3', category: 'verbal', difficulty: 2,
      text: 'Кисть относится к художнику так же, как … относится к хирургу.',
      options: ['больница', 'скальпель', 'пациент', 'халат'], answer: 1,
      explain: 'Кисть — рабочий инструмент художника, скальпель — хирурга.'
    },
    {
      id: 'l2', category: 'logic', difficulty: 2,
      text: 'Аня выше Бори, но ниже Вики. Гриша выше Вики. Кто самый высокий?',
      options: ['Аня', 'Боря', 'Вика', 'Гриша'], answer: 3,
      explain: 'Порядок по росту: Боря < Аня < Вика < Гриша.'
    },
    {
      id: 'o2', category: 'numbers', difficulty: 2,
      text: 'Какое число лишнее?  2, 3, 5, 9, 11, 13',
      options: ['2', '5', '9', '13'], answer: 2,
      explain: 'Все числа, кроме 9, простые. 9 = 3 × 3.'
    },
    {
      id: 'm3', category: 'matrix', difficulty: 2,
      text: 'Какая стрелка должна стоять на месте знака вопроса?',
      matrix: [
        arrow(0), arrow(45), arrow(90),
        arrow(90), arrow(135), arrow(180),
        arrow(180), arrow(225), null
      ],
      options: [arrow(0), arrow(90), arrow(180), arrow(225), arrow(270), arrow(315)],
      answer: 4,
      explain: 'В каждой строке стрелка поворачивается на 45° по часовой стрелке, а каждая строка начинается на 90° дальше предыдущей. 225° + 45° = 270°.'
    },
    {
      id: 'l3', category: 'logic', difficulty: 2,
      text: 'Пять станков делают пять деталей за пять минут. Сколько минут нужно ста станкам, чтобы сделать сто деталей?',
      options: ['1', '5', '20', '100'], answer: 1,
      explain: 'Каждый станок делает одну деталь за 5 минут, поэтому 100 станков сделают 100 деталей за те же 5 минут.'
    },
    {
      id: 's1', category: 'letters', difficulty: 2,
      text: 'Какая буква продолжает ряд?  A, C, F, J, O, …',
      options: ['S', 'T', 'U', 'V'], answer: 2,
      explain: 'Шаг по латинскому алфавиту растёт: +2, +3, +4, +5, +6. O (15) + 6 = U (21).'
    },
    {
      id: 'n6', category: 'numbers', difficulty: 2,
      text: 'Какое число продолжает ряд?  4, 9, 7, 12, 10, …',
      options: ['13', '14', '15', '17'], answer: 2,
      explain: 'Чередуются +5 и −2: 10 + 5 = 15.'
    },
    {
      id: 'l4', category: 'logic', difficulty: 2,
      text: 'Бита и мяч вместе стоят 110 рублей. Бита дороже мяча на 100 рублей. Сколько стоит мяч?',
      options: ['5 ₽', '10 ₽', '15 ₽', '55 ₽'], answer: 0,
      explain: 'Если мяч стоит x, то бита — x + 100. Тогда 2x + 100 = 110, x = 5.'
    },
    {
      id: 'l5', category: 'logic', difficulty: 2,
      text: 'Все розы — цветы. Некоторые цветы быстро вянут. Какой вывод верен?',
      options: [
        'Все розы быстро вянут',
        'Некоторые розы быстро вянут',
        'Ни одна роза не вянет быстро',
        'Из этих утверждений нельзя сделать вывод о розах'
      ],
      answer: 3,
      explain: 'Быстро вянущие цветы могут вовсе не быть розами, поэтому о розах ничего сказать нельзя.'
    },
    {
      id: 'm4', category: 'matrix', difficulty: 3,
      text: 'Какая фигура должна стоять на месте знака вопроса?',
      matrix: [
        poly(3), poly(4), poly(5),
        poly(4), poly(5), poly(6),
        poly(5), poly(6), null
      ],
      options: [poly(5), poly(6), poly(7), poly(8), poly(7, 'black'), poly(4)],
      answer: 2,
      explain: 'Число сторон растёт на 1 по строке и по столбцу. После шестиугольника — семиугольник.'
    },
    {
      id: 'n7', category: 'numbers', difficulty: 3,
      text: 'Какое число продолжает ряд?  5, 7, 11, 19, 35, …',
      options: ['51', '64', '67', '70'], answer: 2,
      explain: 'Разности удваиваются: +2, +4, +8, +16, +32 → 35 + 32 = 67.'
    },
    {
      id: 'l6', category: 'logic', difficulty: 3,
      text: 'Кувшинки на озере удваивают свою площадь каждый день. Через 48 дней они покрывают всё озеро. За сколько дней они покроют половину озера?',
      options: ['24', '36', '46', '47'], answer: 3,
      explain: 'За день до полного покрытия кувшинки занимали ровно половину: 48 − 1 = 47.'
    },
    {
      id: 's2', category: 'letters', difficulty: 3,
      text: 'Какая буква продолжает ряд?  Z, X, U, Q, …',
      options: ['K', 'L', 'M', 'N'], answer: 1,
      explain: 'Шаг назад по латинскому алфавиту растёт: −2, −3, −4, −5. Q (17) − 5 = L (12).'
    },
    {
      id: 'l7', category: 'logic', difficulty: 3,
      text: 'Отец старше сына в 4 раза. Через 20 лет он будет старше сына в 2 раза. Сколько лет сыну сейчас?',
      options: ['5', '10', '15', '20'], answer: 1,
      explain: 'Пусть сыну x лет. 4x + 20 = 2(x + 20), откуда x = 10.'
    },
    {
      id: 'm5', category: 'matrix', difficulty: 3,
      text: 'Какая клетка должна стоять на месте знака вопроса?',
      matrix: [
        c('triangle', 1, 'black'), c('circle', 2, 'black'), c('square', 3, 'black'),
        c('circle', 3, 'black'), c('square', 1, 'black'), c('triangle', 2, 'black'),
        c('square', 2, 'black'), c('triangle', 3, 'black'), null
      ],
      options: [
        c('square', 1, 'black'), c('circle', 2, 'black'), c('circle', 3, 'black'),
        c('triangle', 1, 'black'), c('circle', 1, 'black'), c('circle', 1, 'none')
      ],
      answer: 4,
      explain: 'В каждой строке и столбце есть круг, квадрат и треугольник, а также по одной клетке с 1, 2 и 3 фигурами. Не хватает одного чёрного круга.'
    },
    {
      id: 'l8', category: 'logic', difficulty: 3,
      text: 'Если в шифре A = 1, B = 2, C = 3 и так далее, а слово CAB записано как 312, то как записать слово BAD?',
      options: ['214', '241', '124', '421'], answer: 0,
      explain: 'B = 2, A = 1, D = 4 → 214.'
    },
    {
      id: 'l9', category: 'logic', difficulty: 3,
      text: 'Число увеличили на 50 %, а затем результат уменьшили на 50 %. Что получилось по сравнению с исходным числом?',
      options: ['Столько же', 'На 25 % меньше', 'На 50 % меньше', 'На 25 % больше'], answer: 1,
      explain: '1,5 × 0,5 = 0,75, то есть на 25 % меньше исходного.'
    },
    {
      id: 'n8', category: 'numbers', difficulty: 3,
      text: 'Какое число продолжает ряд?  1, 2, 6, 24, 120, …',
      options: ['240', '600', '720', '840'], answer: 2,
      explain: 'Множитель растёт на 1: ×2, ×3, ×4, ×5, ×6 → 120 × 6 = 720.'
    },
    {
      id: 'l10', category: 'logic', difficulty: 3,
      text: 'Часы показывают 3:15. Какой угол между часовой и минутной стрелками?',
      options: ['0°', '7,5°', '15°', '22,5°'], answer: 1,
      explain: 'Минутная стрелка указывает на 3 (90°). Часовая прошла четверть пути от 3 к 4: 90° + 30° × ¼ = 97,5°. Разница — 7,5°.'
    }
  ];

  window.IQ_BANK = (window.IQ_BANK || []).concat(questions.map((q) => Object.assign({}, q, { id: 'c-' + q.id })));
})();
