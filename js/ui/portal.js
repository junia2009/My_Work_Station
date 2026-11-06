// ポータル全体の画面：テーマ / 時計 / 起動演出 / 見出しの英字ラベル / 各ツールの「使い方」パネル
import { PAGE_CODES, PAGE_HELP, SAMPLES } from '../tools/index.js';
import { $, h, store, toast, sendSample, KEY } from './common.js';

// ---------- テーマ（カラー切替） ----------
const THEMES = ['cyan', 'crimson', 'emerald'];
export function initTheme() {
  const apply = (t) => {
    document.documentElement.dataset.theme = t;
    $('themeName').textContent = t.toUpperCase();
  };
  let cur = store.get(KEY('theme'), 'cyan');
  if (!THEMES.includes(cur)) cur = 'cyan';
  apply(cur);
  $('themeBtn').addEventListener('click', () => {
    cur = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    apply(cur);
    store.set(KEY('theme'), cur);
    window.dispatchEvent(new CustomEvent('themechange'));
  });

  // ライト / ダーク（カラーとは別に切り替える）
  const meta = document.querySelector('meta[name="theme-color"]');
  const applyMode = (m) => {
    if (m === 'light') document.documentElement.dataset.mode = 'light';
    else delete document.documentElement.dataset.mode;
    $('modeBtn').setAttribute('aria-label', m === 'light' ? 'ダークモードに切り替え' : 'ライトモードに切り替え');
    meta?.setAttribute('content', m === 'light' ? '#f7fafc' : '#04080f');
  };
  let mode = store.get(KEY('mode'), 'dark') === 'light' ? 'light' : 'dark';
  applyMode(mode);
  $('modeBtn').addEventListener('click', () => {
    mode = mode === 'light' ? 'dark' : 'light';
    if (document.startViewTransition) document.startViewTransition(() => applyMode(mode));
    else applyMode(mode);
    store.set(KEY('mode'), mode);
    window.dispatchEvent(new CustomEvent('themechange'));
  });
}

// ---------- 時計 ----------
export function initClock() {
  const tick = () => {
    $('clock').textContent = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

// ---------- 起動演出（セッション中に1回だけ） ----------
export function initBoot() {
  const boot = $('boot');
  let seen = false;
  try {
    seen = sessionStorage.getItem(KEY('booted')) === '1';
    sessionStorage.setItem(KEY('booted'), '1');
  } catch { /* 保存できない環境では毎回表示 */ }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (seen || reduce) {
    boot.hidden = true;
    return;
  }
  const lines = [
    '> INITIALIZING WORKBENCH ........... OK',
    '> MOUNTING TOOL RACK ............... OK',
    '> INDEXING DOCUMENT LIBRARY ........ OK',
    '> WORK LOG STORAGE ................. ONLINE',
    '> SUPPORT DRONE .................... STANDBY',
    '> ALL SYSTEMS NOMINAL. WELCOME, OPERATOR.',
  ];
  const log = $('bootLog');
  const timers = [];
  lines.forEach((l, i) => timers.push(setTimeout(() => (log.textContent += l + '\n'), 180 + i * 220)));
  const finish = () => {
    timers.forEach(clearTimeout);
    boot.classList.add('done');
    setTimeout(() => (boot.hidden = true), 700);
  };
  timers.push(setTimeout(finish, 180 + lines.length * 220 + 500));
  boot.addEventListener('click', finish, { once: true });
}

// ---------- 各ページ見出しの英字ラベル ----------
// 番号はサイドメニューの並び順で振る（ページを足しても通し番号がずれない）
export function initEyebrows() {
  // ホームとお気に入り（ツールではなく入口のページ）は番号を振らない
  const skip = (id) => id === 'home' || id === 'favorites';
  const order = [...document.querySelectorAll('#nav a[data-route]')].map((a) => a.dataset.route).filter((id) => !skip(id));
  // メニューに無いページも、後ろに続けて番号を振る
  for (const sec of document.querySelectorAll('[data-page]')) if (!skip(sec.dataset.page) && !order.includes(sec.dataset.page)) order.push(sec.dataset.page);
  order.forEach((id, i) => {
    const h1 = document.querySelector(`[data-page="${id}"] h1`);
    if (!h1) return;
    h1.parentElement.querySelector(':scope > .eyebrow')?.remove();
    h1.before(h('div', { class: 'eyebrow' }, `MODULE ${String(i + 1).padStart(2, '0')} // ${PAGE_CODES[id] ?? id.toUpperCase()}`));
  });
}

// ---------- 各ツールの「使い方」パネル ----------
export function initHelp() {
  const open = store.get(KEY('helpOpen'), true);
  for (const [page, help] of Object.entries(PAGE_HELP)) {
    const h1 = document.querySelector(`[data-page="${page}"] h1`);
    if (!h1) continue;
    const sample = SAMPLES[page];
    const panel = h('details', { class: 'help', open: open ? '' : null },
      h('summary', {}, '使い方・こんなときに使う'),
      h('div', { class: 'help-body' },
        h('p', { class: 'help-when' }, h('span', { class: 'lbl' }, 'こんなとき'), help.when),
        h('ol', { class: 'steps' }, ...help.steps.map((s) => h('li', {}, s))),
        sample
          ? h('div', { class: 'row' },
              h('button', {
                type: 'button', class: 'small',
                onclick: async () => {
                  if (await sendSample(page, sample)) toast('例を読み込みました');
                },
              }, '▶ 例を試す'),
              help.sample ? h('span', { class: 'hint' }, `サンプル: ${help.sample}`) : '',
            )
          : '',
      ),
    );
    panel.addEventListener('toggle', () => {
      if (panel.dataset.tourOpen) return; // ツアーが一時的に開け閉めしたときは、設定を変えない
      store.set(KEY('helpOpen'), panel.open);
      // 1つ開閉したら、他のページのパネルもそろえる
      document.querySelectorAll('details.help').forEach((d) => d !== panel && (d.open = panel.open));
    });
    // 説明文（lead）がある場合はその後ろに置く
    const after = h1.nextElementSibling?.classList.contains('lead') ? h1.nextElementSibling : h1;
    after.after(panel);
  }
}
