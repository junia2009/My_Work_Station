// 画面の動きのテスト（ブラウザで実際に操作する）
// 実行: node tests/e2e.mjs
// 必要なもの: playwright と Chromium（npm i --no-save playwright && npx playwright install chromium）
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8',
};

// ---------- 静的ファイルを配るだけの小さなサーバー ----------
function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normalize(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// ---------- テストの枠組み ----------
let passed = 0;
const failures = [];
const t = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log('  ok', name);
  } catch (e) {
    failures.push(name);
    console.error('FAIL:', name, '\n ', e.message.split('\n').slice(0, 6).join('\n  '));
  }
};

const server = await serve();
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();

// 起動演出と案内役（PALLAS）の吹き出しを止めた状態で開く。ページ内のエラーは集めて最後に確かめる
async function open(hash = '', { device, keepStorage, pallas } = {}) {
  const ctx = await browser.newContext(device ? { ...devices[device], serviceWorkers: 'block' } : { viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(([keep, pallas]) => {
    try {
      sessionStorage.setItem('workstation.booted', '1');
      // 保存データはテストごとに最初の1回だけ消す（再読み込み後も残るかを確かめられるように）
      if (!keep && !sessionStorage.getItem('e2e.cleared')) { localStorage.clear(); sessionStorage.setItem('e2e.cleared', '1'); }
      localStorage.setItem('workstation.pallas', JSON.stringify(pallas ?? { intro: true, auto: false, roam: false, hidden: true }));
    } catch { /* 保存できない環境でも続ける */ }
  }, [!!keepStorage, pallas ?? null]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(BASE + (hash ? '#' + hash : ''));
  await page.waitForSelector('[data-page]:not([hidden])');
  return { page, ctx };
}

// ページの切り替え（hashchange）が終わるまで待つ
const waitPage = (page, id, timeout) => page.waitForFunction((id) => document.querySelector('[data-page]:not([hidden])')?.dataset.page === id, id, { timeout });
const visiblePage = (page) => page.evaluate(() => document.querySelector('[data-page]:not([hidden])')?.dataset.page);

// ---------- 起動とページ移動 ----------
await t('ホームがエラーなしで表示され、ツールとテキストが並ぶ', async () => {
  const { page, ctx } = await open();
  assert.equal(await visiblePage(page), 'home');
  assert.ok(await page.isVisible('#cmdIn'));
  assert.ok((await page.$$('#toolGrid .tool-tile')).length >= 4);
  assert.ok((await page.$$('#homeTexts .tool-tile')).length >= 3);
  assert.match(await page.textContent('#appVersion'), /^v\d+\.\d+\.\d+$/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await t('メニューはツールの一覧から作られ、全項目が開ける（MODULE 番号つき）', async () => {
  const { page, ctx } = await open();
  const routes = await page.$$eval('#nav a[data-route]:not(.nav-pinned):not(.nav-fav)', (as) => as.map((a) => a.dataset.route));
  assert.deepEqual(routes, ['home', 'texts', 'learn', 'dict', 'date', 'diff', 'regex', 'memo']);
  for (const r of routes) {
    await page.click(`#nav a[data-route="${r}"]:not(.nav-pinned)`);
    await waitPage(page, r, 5000).catch(() => { throw new Error(`${r} が表示されない`); });
    assert.equal(await page.$eval(`#nav a[data-route="${r}"]:not(.nav-pinned)`, (a) => a.classList.contains('active')), true);
    if (r !== 'home') assert.match(await page.textContent(`[data-page="${r}"] .eyebrow`), /^MODULE \d\d \/\/ /);
  }
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await t('存在しないページはホームになる', async () => {
  const { page, ctx } = await open('no-such-page');
  assert.equal(await visiblePage(page), 'home');
  await ctx.close();
});

// ---------- 検索バー ----------
await t('検索バー：ツール名 → Enter でツールが開く', async () => {
  const { page, ctx } = await open();
  await page.fill('#cmdIn', 'エクセル');
  await page.waitForSelector('#cmdOut .cmd-hit');
  assert.match(await page.textContent('#cmdOut .cmd-hit.top'), /差分比較/);
  await page.press('#cmdIn', 'Enter');
  await waitPage(page, 'diff');
  await ctx.close();
});

await t('検索バー：テキストの本文の言葉でも見つかり、テキストが開く', async () => {
  const { page, ctx } = await open();
  await page.focus('#cmdIn');
  await page.fill('#cmdIn', 'systemctl');
  await page.waitForFunction(() => /Markdown 早見表/.test(document.getElementById('cmdOut').innerText));
  await page.press('#cmdIn', 'Enter');
  await page.waitForFunction(() => location.hash === '#texts/markdown');
  await page.waitForSelector('[data-page="texts"] .mn-chapter');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

// ---------- テキスト ----------
await t('テキスト：一覧・絞り込み・本文・目次・テキスト間のリンク', async () => {
  const { page, ctx } = await open('texts');
  await page.waitForSelector('#txList .tx-card');
  const n = (await page.$$('#txList .tx-card')).length;
  assert.ok(n >= 3);
  // 本文の言葉で絞り込む（本文の読み込みを待つ）
  await page.fill('#txSearch', 'MODULES');
  await page.waitForFunction(() => document.querySelectorAll('#txList .tx-card').length === 1);
  assert.match(await page.textContent('#txList'), /ツール・テキストの追加方法/);
  await page.click('#txList .tx-card');
  await page.waitForSelector('[data-page="texts"] .mn-toc');
  assert.ok((await page.$$('[data-page="texts"] .mn-toc button')).length >= 4);
  assert.ok((await page.$$('[data-page="texts"] .mn-code')).length >= 3);
  assert.ok((await page.$$('[data-page="texts"] .mn-callout')).length >= 2);
  // 1 行目の # 題名は本文に重ねて出さない
  assert.equal(await page.$$eval('[data-page="texts"] .mn-chapters h2', (a) => a.filter((x) => x.textContent.includes('ツール・テキストの追加方法')).length), 0);
  // 別のテキストへのリンクはポータルの中で開く
  await page.click('[data-page="texts"] a[href="#texts/markdown"]');
  await page.waitForFunction(() => document.querySelector('[data-page="texts"] .tx-title')?.textContent === 'Markdown 早見表');
  await page.click('[data-page="texts"] .mn-back');
  await page.waitForSelector('#txList');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await t('テキスト：HTML やスクリプトは文字として表示し、危険なリンクは無効', async () => {
  const { page, ctx } = await open();
  const r = await page.evaluate(async () => {
    const { parseMarkdown } = await import('./js/lib/markdown.js');
    const { renderBlocks } = await import('./js/ui/markdown-view.js');
    window.__hit = 0;
    const box = document.createElement('div');
    box.append(...renderBlocks(parseMarkdown('<img src=x onerror="window.__hit=1"> [x](javascript:window.__hit=2) ![y](javascript:1)\n\n| <b>a</b> |\n| - |\n| <script>window.__hit=3</script> |'), 'texts/'));
    document.body.append(box);
    await new Promise((ok) => setTimeout(ok, 200));
    const out = { hit: window.__hit, imgs: box.querySelectorAll('img').length, bold: box.querySelectorAll('b').length, links: [...box.querySelectorAll('a')].map((a) => a.getAttribute('href')), text: box.textContent };
    box.remove();
    return out;
  });
  assert.equal(r.hit, 0);
  assert.equal(r.imgs, 0);
  assert.equal(r.bold, 0);
  assert.deepEqual(r.links, []);
  assert.match(r.text, /<img src=x/);
  await ctx.close();
});

// ---------- 学習テキスト・コマンド辞典 ----------
await t('学習テキスト：全冊を開けて、図・確認問題・「読んだ」印が動く', async () => {
  const { page, ctx } = await open('learn');
  await page.waitForSelector('#learnBody .lr-card');
  const ids = await page.$$eval('#learnBody .lr-stretch', (a) => a.map((x) => x.getAttribute('href').split('/')[1]));
  assert.ok(ids.length >= 20, `冊数が少なすぎます: ${ids.length}`);
  let figures = 0;
  for (const id of ids) {
    await page.goto(BASE + '#learn/' + id);
    await page.waitForSelector('[data-page="learn"] .mn-chapter');
    figures += (await page.$$('[data-page="learn"] .mn-figure svg')).length;
  }
  assert.ok(figures >= 20, `図が少なすぎます: ${figures}`);
  // 確認問題に答える
  await page.goto(BASE + '#learn/' + ids[0]);
  await page.waitForSelector('[data-page="learn"] .mn-quiz');
  await page.click('[data-page="learn"] .mn-quiz .mn-quiz-c');
  assert.ok(await page.isVisible('[data-page="learn"] .mn-quiz-res'));
  // 章を読んだ印 → 一覧に進み具合が出る
  await page.click('[data-page="learn"] .mn-read');
  await page.goto(BASE + '#learn');
  await page.waitForSelector('#learnBody .lr-card');
  assert.match(await page.textContent('#learnBody .lr-card'), /1 \/ \d+ 章/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await t('コマンド辞典：全部の言語を切り替えられ、やりたいことでも引ける', async () => {
  const { page, ctx } = await open('dict');
  await page.waitForSelector('#dcTabs button');
  const n = (await page.$$('#dcTabs button')).length;
  assert.ok(n >= 5);
  for (let i = 0; i < n; i++) {
    await page.click(`#dcTabs button >> nth=${i}`);
    await page.waitForFunction(() => document.querySelector('#dcDetail').innerText.trim().length > 20);
  }
  await page.click('#dcModeTask');
  await page.fill('#dcSearch', '重複');
  await page.waitForFunction(() => document.querySelectorAll('#dcList > *').length > 0);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await t('検索バー：学習テキストも見つかる', async () => {
  const { page, ctx } = await open();
  await page.fill('#cmdIn', 'TLS');
  await page.waitForSelector('#cmdOut .cmd-hit');
  assert.ok(await page.$$eval('#cmdOut .cmd-hit', (a) => a.some((x) => x.textContent.includes('テキストを読む'))));
  await ctx.close();
});

// ---------- ツール ----------
await t('どのツールも「▶ 例を試す」で結果が出る', async () => {
  const { page, ctx } = await open();
  const checks = {
    diff: () => /追加 \d+・削除 \d+/.test(document.getElementById('dfInfo').textContent),
    date: () => /営業日（両端を含む）/.test(document.getElementById('dtSpanOut').textContent) && /年末年始/.test(document.getElementById('dtSpanOut').textContent),
    regex: () => /^3 件マッチ/.test(document.getElementById('rxInfo').textContent) && /yamada\.taro さん/.test(document.getElementById('rxRepOut').textContent),
  };
  for (const [id, ok] of Object.entries(checks)) {
    await page.goto(BASE + '#' + id);
    await waitPage(page, id);
    await page.click(`[data-page="${id}"] details.help button`);
    await page.waitForFunction(ok, null, { timeout: 5000 }).catch(() => { throw new Error(`${id} の例で結果が出ない`); });
  }
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await t('差分比較：Excel ファイルどうしをセル単位で比べ、非表示のシートを知らせる', async () => {
  const { page, ctx } = await open('diff');
  await page.setInputFiles('#dfAFile', join(ROOT, 'tests/fixtures/book_a.xlsx'));
  await page.setInputFiles('#dfBFile', join(ROOT, 'tests/fixtures/book_b.xlsx'));
  await page.waitForFunction(() => /変更のあるセル 5 個/.test(document.getElementById('dfInfo').textContent));
  assert.equal(await page.inputValue('#dfMode'), 'sheet');
  assert.match(await page.textContent('#dfOut'), /secret/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await t('日付計算：営業日・〇営業日後・カレンダー・和暦・時差・会社の休み', async () => {
  const { page, ctx } = await open('date');
  const text = (id) => page.textContent('#' + id);
  // 期間・営業日（2026 年 11 月：営業日 19 日、祝日 2 日）
  await page.fill('#dtFrom', '2026-11-01');
  await page.fill('#dtTo', '2026-11-30');
  await page.waitForFunction(() => /営業日（両端を含む）19 日/.test(document.getElementById('dtSpanOut').textContent));
  assert.match(await text('dtSpanOut'), /29 日/);
  assert.match(await text('dtSpanOut'), /文化の日/);
  // 日付を足す（ゴールデンウィークをまたぐ）
  await page.click('[data-tab="dt-add"]');
  await page.fill('#dtBase', '2026-04-28');
  await page.fill('#dtN', '3');
  await page.selectOption('#dtUnit', 'bday');
  await page.waitForFunction(() => /2026\/05\/07（木）/.test(document.getElementById('dtAddOut').textContent));
  // 会社の休みを足すと、結果が 1 日ずれ、再読み込み後も残る
  await page.click('#dtRule summary');
  await page.fill('#dtExtra', '2026-05-07 創立記念日');
  await page.waitForFunction(() => /2026\/05\/08（金）/.test(document.getElementById('dtAddOut').textContent));
  await page.reload();
  await waitPage(page, 'date');
  assert.equal(await page.inputValue('#dtExtra'), '2026-05-07 創立記念日');
  // カレンダー（2026 年 9 月のシルバーウィーク）
  await page.click('[data-tab="dt-cal"]');
  await page.fill('#dtCalMonth', '2026-09');
  await page.dispatchEvent('#dtCalMonth', 'change');
  await page.waitForFunction(() => /国民の休日/.test(document.getElementById('dtCal').textContent));
  assert.equal(await page.$$eval('#dtCal .dt-day.hol', (a) => a.length), 3);
  // 和暦
  await page.click('[data-tab="dt-wareki"]');
  await page.fill('#dtWa', 'H31.4.30');
  await page.waitForFunction(() => /2019\/04\/30/.test(document.getElementById('dtWaOut').textContent));
  await page.fill('#dtWa', '平成32年');
  await page.waitForFunction(() => /ありません/.test(document.getElementById('dtWaOut').textContent));
  assert.ok((await page.$$('#dtYears tr')).length > 90);
  // 時差
  await page.click('[data-tab="dt-tz"]');
  await page.fill('#dtTzTime', '2026-11-06T09:00');
  await page.selectOption('#dtTzFrom', 'Asia/Tokyo');
  await page.waitForFunction(() => /2026\/11\/05（木）19:00/.test(document.getElementById('dtTzOut').textContent));
  await page.fill('#dtUnix', '1700000000');
  await page.waitForFunction(() => /2023\/11\/15（水）07:13:20/.test(document.getElementById('dtUnixOut').textContent));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await t('メモ：追加・再読み込み後も残る・絞り込み・編集・削除', async () => {
  const { page, ctx } = await open('memo');
  const add = async (title, tag, body) => {
    await page.fill('#memoTitle', title);
    await page.fill('#memoTag', tag);
    await page.fill('#memoBody', body);
    await page.click('#memoForm button[type="submit"]');
  };
  await add('お礼メール', '定型文', 'お世話になっております。');
  await add('リリース手順', '手順', '1. タグを打つ');
  assert.equal((await page.$$('#memoList .note')).length, 2);
  await page.reload();
  await waitPage(page, 'memo');
  assert.equal((await page.$$('#memoList .note')).length, 2);
  await page.selectOption('#memoFilter', '定型文');
  assert.equal((await page.$$('#memoList .note')).length, 1);
  await page.selectOption('#memoFilter', '');
  await page.fill('#memoSearch', 'タグを');
  await page.waitForFunction(() => document.querySelectorAll('#memoList .note').length === 1);
  await page.fill('#memoSearch', '');
  await page.waitForFunction(() => document.querySelectorAll('#memoList .note').length === 2);
  // ふだんはタイトルだけ。押すと本文が開き、もう一度押すと閉じる
  // （直前の検索で本文に当たったメモは開いているので、いったん全部閉じる）
  await page.click('#memoCloseAll');
  assert.equal((await page.$$('#memoList .note pre')).length, 0);
  await page.click('#memoList .note:nth-child(1) .memo-toggle');
  assert.match(await page.textContent('#memoList .note:nth-child(1) pre'), /タグを打つ/);
  assert.equal(await page.getAttribute('#memoList .note:nth-child(1) .memo-toggle', 'aria-expanded'), 'true');
  await page.click('#memoList .note:nth-child(1) .memo-toggle');
  assert.equal((await page.$$('#memoList .note pre')).length, 0);
  await page.click('#memoOpenAll');
  assert.equal((await page.$$('#memoList .note pre')).length, 2);
  await page.click('#memoCloseAll');
  assert.equal((await page.$$('#memoList .note pre')).length, 0);
  // 本文にだけ当たる言葉で探すと、そのメモは開いた状態で出る
  await page.fill('#memoSearch', 'お世話');
  await page.waitForFunction(() => document.querySelectorAll('#memoList .note pre').length === 1);
  await page.fill('#memoSearch', '');
  await page.waitForFunction(() => document.querySelectorAll('#memoList .note').length === 2);
  await page.click('#memoCloseAll');
  // 編集（同じ id のまま、先頭に来る）
  await page.click('#memoList .note:nth-child(2) button:text("編集")');
  await page.fill('#memoTitle', 'お礼メール（改）');
  await page.click('#memoForm button[type="submit"]');
  assert.equal((await page.$$('#memoList .note')).length, 2);
  assert.match(await page.textContent('#memoList .note:first-child strong'), /（改）/);
  page.once('dialog', (d) => d.accept());
  await page.click('#memoList .note:first-child button:text("削除")');
  await page.waitForFunction(() => document.querySelectorAll('#memoList .note').length === 1);
  // 書き出し
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#memoExport')]);
  assert.match(dl.suggestedFilename(), /^work-memo-\d{4}-\d{2}-\d{2}\.json$/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await t('メモの写真：追加・貼り付け・表示・再読み込み後も残る・書き出しと読み込み・削除', async () => {
  const { page, ctx } = await open('memo');
  const photoCount = () => page.evaluate(() => new Promise((ok) => {
    const r = indexedDB.open('workstation');
    r.onsuccess = () => { const q = r.result.transaction('photos').objectStore('photos').count(); q.onsuccess = () => ok(q.result); };
  }));
  // ファイルを選んで追加
  await page.setInputFiles('#memoPhotoIn', join(ROOT, 'icons/icon-512.png'));
  await page.waitForSelector('#memoDraftPhotos .memo-thumb img');
  // 貼り付け（スクリーンショットを Ctrl+V したとき）
  await page.evaluate(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 300, height: 200 });
    c.getContext('2d').fillRect(0, 0, 300, 200);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'shot.png', { type: 'image/png' }));
    document.getElementById('memoBody').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('#memoDraftPhotos .memo-thumb img').length === 2);
  // 1 枚外してから保存
  await page.click('#memoDraftPhotos .memo-thumb:nth-child(2) .memo-thumb-x');
  await page.fill('#memoTitle', '画面のスクショ');
  await page.click('#memoForm button[type="submit"]');
  await page.waitForSelector('#memoList .memo-count');
  assert.match(await page.textContent('#memoList .memo-count'), /写真 1/);
  assert.equal((await page.$$('#memoDraftPhotos .memo-thumb')).length, 0);
  // 写真だけのメモも開ける。押すと大きく見られる
  await page.click('#memoList .memo-toggle');
  await page.waitForSelector('#memoList .memo-body .memo-thumb img');
  await page.click('#memoList .memo-body .memo-thumb-btn');
  await page.waitForFunction(() => document.getElementById('memoViewer').open && document.getElementById('memoViewerImg').naturalWidth === 512);
  assert.match(await page.textContent('#memoViewerInfo'), /512×512/);
  await page.click('#memoViewerClose');
  // 再読み込み後も残る
  await page.reload();
  await waitPage(page, 'memo');
  await page.click('#memoList .memo-toggle');
  await page.waitForSelector('#memoList .memo-body .memo-thumb img');
  // 書き出し（写真は JSON の中に入る）→ 削除 → 読み込みで元に戻る
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#memoExport')]);
  const file = await dl.path();
  const json = JSON.parse(await readFile(file, 'utf8'));
  assert.match(json[0].photos[0].data, /^data:image\/png;base64,/);
  page.once('dialog', (d) => d.accept());
  await page.click('#memoList .note button:text("削除")');
  await page.waitForFunction(() => !document.querySelector('#memoList .note'));
  await page.waitForTimeout(200);
  assert.equal(await photoCount(), 1); // 外した 1 枚は片付けの対象（作ったばかりなので、まだ残る）
  await page.setInputFiles('#memoImport', file);
  await page.waitForSelector('#memoList .memo-count');
  await page.click('#memoList .memo-toggle');
  await page.waitForSelector('#memoList .memo-body .memo-thumb img');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await t('写真の縮小：大きい写真は長辺 1600px の JPEG にする', async () => {
  const { page, ctx } = await open();
  const r = await page.evaluate(async () => {
    const { shrinkImage } = await import('./js/ui/image.js');
    const c = Object.assign(document.createElement('canvas'), { width: 3000, height: 2000 });
    const g = c.getContext('2d');
    // 写真のように細かい模様（PNG では小さくならない）
    const img = g.createImageData(3000, 2000);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i & 3) === 3 ? 255 : (i * 2654435761) >>> 24;
    g.putImageData(img, 0, 0);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    const out = await shrinkImage(new File([blob], 'big.png', { type: 'image/png' }));
    return { w: out.w, h: out.h, type: out.blob.type, name: out.name, smaller: out.blob.size < blob.size };
  });
  assert.deepEqual(r, { w: 1600, h: 1067, type: 'image/jpeg', name: 'big.jpg', smaller: true });
  await ctx.close();
});

await t('ひな形（_template.js）はそのまま登録すれば動く', async () => {
  const { page, ctx } = await open();
  const r = await page.evaluate(async () => {
    const m = await import('./js/tools/_template.js');
    const sec = document.createElement('section');
    sec.dataset.page = m.meta.id;
    sec.innerHTML = m.html;
    document.getElementById('main').append(sec);
    m.init();
    const ta = document.getElementById('cntIn');
    ta.value = 'あいう\nえお';
    ta.dispatchEvent(new Event('input'));
    await new Promise((ok) => setTimeout(ok, 300));
    return { keys: ['meta', 'help', 'sample', 'pallas', 'html', 'init'].filter((k) => k in m), out: document.getElementById('cntOut').innerText };
  });
  assert.equal(r.keys.length, 6);
  assert.match(r.out, /文字数\s+6/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

// ---------- お気に入り・見た目 ----------
await t('お気に入り：☆ で登録するとメニューとお気に入りのページに出て、再読み込み後も残る', async () => {
  const { page, ctx } = await open('regex');
  await page.click('[data-page="regex"] .pin-btn');
  assert.equal(await page.$$eval('#nav a.nav-pinned', (a) => a.map((x) => x.dataset.route).join()), 'regex');
  await page.reload();
  await page.goto(BASE + '#favorites');
  await waitPage(page, 'favorites');
  assert.match(await page.textContent('#favRoot'), /正規表現テスト/);
  assert.equal(await page.textContent('#favCount'), '1');
  await ctx.close();
});

await t('テーマ：明暗と色の切り替えが保存される', async () => {
  const { page, ctx } = await open();
  await page.click('#modeBtn');
  await page.click('#themeBtn');
  await page.reload();
  await page.waitForSelector('[data-page]:not([hidden])');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), 'light');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'crimson');
  await ctx.close();
});

// ---------- 案内役 PALLAS ----------
await t('PALLAS：タップでメニューが出て、ツアーを最後まで進められる', async () => {
  const { page, ctx } = await open('', { pallas: { intro: true, auto: false, roam: false, hidden: false } });
  await page.waitForSelector('.pallas-drone');
  await page.waitForTimeout(1300); // 起動のあいさつを待つ
  await page.evaluate(() => document.querySelector('.pb-close')?.click());
  await page.click('.pallas-drone');
  await page.waitForSelector('.pallas-bubble:not([hidden])');
  // 吹き出しは PALLAS と一緒に動き続けるので、マウスで狙わずにボタンを直接押す（キーボードで押すのと同じ）
  const press = (sel) => page.$eval(sel, (b) => b.click());
  await press('.pb-actions button:text("ツアーを見る")');
  let steps = 0;
  for (let i = 0; i < 10; i++) {
    const btn = await page.waitForSelector('.pallas-bubble:not([hidden]) .pb-actions button.small', { timeout: 15000 });
    const label = await btn.textContent();
    const no = await page.$eval('.pb-text', (t) => (t.dataset.full ?? '').split('　')[0]);
    await btn.evaluate((b) => b.click());
    steps++;
    if (label.includes('終わる')) break;
    // 次の手順（吹き出しの「2 / 6」などの番号が変わる）まで待つ
    await page.waitForFunction((n) => {
      const b = document.querySelector('.pallas-bubble');
      return !b.hidden && (document.querySelector('.pb-text').dataset.full ?? '').split('　')[0] !== n;
    }, no, { timeout: 15000 });
  }
  assert.equal(steps, 6, `ツアーの手順の数が違います: ${steps}`);
  assert.equal(await page.isHidden('.pallas-bubble'), true);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

// ---------- スマホ ----------
await t('スマホ：横にはみ出さず、メニューからページを開ける', async () => {
  const { page, ctx } = await open('', { device: 'iPhone 13' });
  for (const id of ['home', 'texts', 'learn', 'dict', 'date', 'diff', 'regex', 'memo']) {
    await page.goto(BASE + '#' + id);
    await waitPage(page, id);
    await page.waitForTimeout(150);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(over <= 1, `${id} が横に ${over}px はみ出しています`);
  }
  await page.goto(BASE + '#texts/howto-add');
  await page.waitForSelector('[data-page="texts"] .mn-chapter');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, 'テキストが横にはみ出しています');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

await browser.close();
server.close();
console.log(`${passed} 件成功${failures.length ? `、${failures.length} 件失敗` : ''}`);
if (failures.length) process.exitCode = 1;
