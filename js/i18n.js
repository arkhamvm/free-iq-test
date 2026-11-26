/*
 * Локализация. Каждый язык подключается файлом js/i18n/<код>.js и вызывает
 * I18N.add(код, { name, ui, q }):
 *   name — название языка на нём самом (для переключателя)
 *   ui   — строки интерфейса (вложенные объекты, ключи через точку)
 *   q    — переводы заданий банка: { id: { t: текст, o: [варианты], e: объяснение } }
 * Русский — исходный язык: тексты заданий лежат прямо в банке.
 */
(function () {
  'use strict';
  const LANG_KEY = 'free-iq-test:lang';
  const ORDER = ['en', 'ru', 'es', 'pt', 'de', 'fr', 'zh'];
  const DEFAULT = 'en';
  const packs = {};
  let lang = DEFAULT;

  function get(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  }

  const I18N = {
    add(code, pack) { packs[code] = pack; },
    langs() { return ORDER.filter((c) => packs[c]).map((c) => ({ code: c, name: packs[c].name })); },
    get lang() { return lang; },

    // Строка интерфейса с подстановкой {name}.
    t(key, params) {
      let s = get(packs[lang].ui, key);
      if (s === undefined) s = get(packs[DEFAULT].ui, key);
      if (s === undefined) return key;
      if (typeof s !== 'string') return s;
      return params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m)) : s;
    },
    // Перевод задания банка.
    q(id) { return (packs[lang].q || {})[id]; },
    num(n, digits) {
      return new Intl.NumberFormat(packs[lang].locale || lang, { maximumFractionDigits: digits || 0 }).format(n);
    },

    detect() {
      let saved = null;
      try { saved = localStorage.getItem(LANG_KEY); } catch (e) { /* ignore */ }
      if (saved && packs[saved]) return saved;
      const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || DEFAULT]);
      for (const p of prefs) {
        const code = String(p).toLowerCase().split('-')[0];
        if (packs[code]) return code;
      }
      return DEFAULT;
    },
    set(code, remember) {
      lang = packs[code] ? code : DEFAULT;
      if (remember) {
        try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
      }
      document.documentElement.lang = packs[lang].htmlLang || lang;
      document.title = I18N.t('meta.title');
      // Статические строки разметки: data-i18n="ключ" и data-i18n-aria="ключ".
      document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = I18N.t(el.dataset.i18n); });
      // data-i18n-html: тот же текст, но **так** выделяется жирным.
      document.querySelectorAll('[data-i18n-html]').forEach((el) => {
        const safe = I18N.t(el.dataset.i18nHtml).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        el.innerHTML = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      });
      document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', I18N.t(el.dataset.i18nAria)); });
      document.querySelectorAll('[data-i18n-alt]').forEach((el) => { el.setAttribute('alt', I18N.t(el.dataset.i18nAlt)); });
      document.querySelectorAll('[data-i18n-list]').forEach((el) => {
        const items = I18N.t(el.dataset.i18nList);
        el.innerHTML = '';
        (Array.isArray(items) ? items : []).forEach((txt) => {
          const li = document.createElement('li');
          li.textContent = txt;
          el.appendChild(li);
        });
      });
    }
  };

  window.I18N = I18N;
})();
