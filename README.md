# Free IQ Test

A free, static IQ test written in plain HTML, CSS and JavaScript. No build step, no dependencies and no server: everything runs in the browser and answers are never sent anywhere. Ready to host on GitHub Pages.

Available in 7 languages: English, Russian, Spanish, Portuguese, German, French and Chinese. The language is detected from the browser, can be switched at any time and is remembered.

## Tests

Three tests to choose from (Quick is the default):

| Test | Questions | Time | Content |
|---|---|---|---|
| Quick | 30 | 25 min | number and letter series, words, logic, matrices |
| Mixed | 40 | 30 min | the same types, with more series and word tasks |
| Matrices | 60 | 40 min | 5 series of non-verbal matrices, from easy to hard |

All questions are original. The tests are inspired by classic IQ test formats but do not copy them.

## Features

- **A random set on every attempt.** Quick and Mixed draw questions from a shared bank (`js/bank/`) with fixed quotas per question type and difficulty, so attempts stay comparable. Matrices are generated fresh each time (`js/generator.js`) from fixed rules and a fixed difficulty curve.
- A countdown timer; the test finishes automatically when time runs out.
- Progress is saved in `localStorage`. The question set is restored from its seed, so a test can be resumed after a reload.
- Results: estimated IQ, percentile, a normal distribution chart, a breakdown by question type and a review of every answer with an explanation.
- **Share:** builds a mobile-format image with the result and a link to the test. On phones it opens the system share sheet, so the image and text go straight to a messenger. On desktop it shows a panel to download the image, plus Telegram, WhatsApp and VK links.
- Responsive layout for phone, tablet and desktop; light and dark themes follow the system setting; keyboard controls (1–8 to answer, ← → to navigate).

## Scoring

Each question is worth 1–3 points depending on difficulty. The share of points earned is mapped to an IQ scale with mean 100 and SD 15, assuming an average person scores about half of the points. The result is clamped to 55–145. This is an entertainment estimate, not a clinical measurement.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages

1. Open Settings → Pages.
2. Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. After a minute the site is live at `https://<username>.github.io/free-iq-test/`.

## Project structure

```
index.html          screen markup
css/style.css       styles (light and dark theme, responsive layout)
js/generator.js     matrix question generator
js/bank/*.js        bank of text questions
js/tests.js         test definitions and random set sampling
js/app.js           test flow, timer, scoring, results, sharing
js/i18n.js          localization core (detection, switching, string lookup)
js/i18n/<lang>.js   UI strings and question translations for one language
```

To add a question, append an object to any file in `js/bank/` (the fields are described at the top of `js/bank/classic.js`) and add its translation under the same id to every `js/i18n/<lang>.js`. Russian is the source language, so Russian text lives in the bank itself.

To add a language, copy `js/i18n/en.js`, translate it, register the code in `ORDER` in `js/i18n.js` and add a `<script>` tag in `index.html`.
