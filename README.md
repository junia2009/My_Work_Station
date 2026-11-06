# My_Work_Station

A workbench portal for keeping the tools and texts (procedure docs, materials) I use at work. It runs on HTML + JavaScript alone, the same mechanism as [My_CTF_portal](https://github.com/junia2009/My_CTF_portal), so it can be published to GitHub Pages as-is.
Everything you enter is processed inside the browser and is never sent anywhere.

## Features

Type into the search bar in the middle of the home screen to search across tool names and **the body text of the texts** (Enter opens the top result).

| Group | Tool | Description |
| --- | --- | --- |
| Materials | Texts | Read Markdown materials placed in `texts/` with a table of contents. Search down to the body text, copy code blocks, download |
| Tools | Diff | Compare text line by line or character by character, CSV / Excel (xlsx / xls) **cell by cell**, and binaries byte by byte. Also flags hidden sheets, rows, and columns |
| Tools | Regex tester | Highlight matches, list groups, preview replacements. Presets such as email addresses, phone numbers, and dates |
| Records | Memo | Save work notes and boilerplate in the browser. Tag filtering, search, JSON export / import |

Shared with CTF Portal:

- **Favorites**: register with "☆ Add to favorites" above each tool's heading (on PC they appear in the side menu, on phones under ★)
- **Usage panel and "▶ Try an example"**: lets you check what each tool does right away
- **Theme**: dark / light with ☾ / ☀ at the top right, accent color with CYAN / CRIMSON / EMERALD
- **Guide PALLAS**: a 3D drone flying around the screen. Gives page guidance, a tour, tips, and reactions (lines are in `js/data/pallas.js` and in each tool file's `pallas`)
- **PWA**: installable, and once opened every tool and text works offline
- **Keyboard navigation and phone layout**

## Adding tools and texts

For details, see the in-portal text "**Adding tools and texts**" (`texts/howto-add.md`).

### Text

1. Put a Markdown file in `texts/`
2. Add one line to `TEXTS` in `texts/index.js`

### Tool

1. Copy `js/tools/_template.js` to create `js/tools/<name>.js` (one file = one tool; the screen, usage, example, PALLAS lines, and logic all go in this file)
2. Add one line each to the `import` and `MODULES` in `js/tools/index.js`

The menu, home tiles, favorites, search, and MODULE numbers are all generated automatically from the list.

## Publishing on GitHub Pages

Published automatically by GitHub Actions (`.github/workflows/pages.yml`).

1. Open this repository's **Settings → Pages** and set the Source under **Build and deployment** to "**GitHub Actions**" (first time only)
2. Pushing to the `main` branch automatically runs the tests (logic tests and screen tests) → publish
   - Pull requests run the same tests too (`.github/workflows/test.yml`, no publishing)
3. Published at: `https://<username>.github.io/My_Work_Station/`

Nothing is published if the tests fail. Only `index.html` / `manifest.webmanifest` / `sw.js` / `css` / `js` / `icons` / `vendor` (three.js) / `models` / `texts` are published.

> GitHub Pages is a public site. Don't put confidential company information, passwords, or personal data in texts or tools.

## Running locally

Because it uses ES Modules, open it through a simple server rather than opening `index.html` directly.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Tests

```sh
node tests/run.mjs   # logic tests (Markdown, search, diff, Excel reading, etc.)

npm install --no-save --no-package-lock playwright@1.63.0
npx playwright install chromium
node tests/e2e.mjs   # screen tests (page navigation, search, texts, each tool's examples, memo, favorites, PALLAS, phone layout)
```

## Structure

```
index.html            Screen frame (home and favorites only; tool pages are generated from js/tools/)
manifest.webmanifest / sw.js / icons/   PWA (install and offline support)
scripts/build-sw.mjs  Embeds the cache targets into the Service Worker at deploy time
css/style.css         Styles (dark / light × 3 colors; same design as CTF Portal)
js/app.js             Startup and page switching
js/tools/             Tools (1 file = 1 tool) and their list index.js, template _template.js
js/ui/                Shared screen behavior (home, menu, favorites, PALLAS, Markdown display, etc.)
js/lib/               Logic independent of the screen (Markdown, search, diff, spreadsheet reading)
js/data/              Icons, PALLAS lines, version
texts/                Texts (Markdown) and their list index.js
models/ vendor/three/ PALLAS 3D model and three.js (MIT license)
tests/                Tests
```

When changing the version, edit `js/data/version.js`.
