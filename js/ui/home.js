// ホーム：検索バー（ツールとテキストを横断して探す）/ ツールのタイル / テキストの一覧
import { TOOLS, TOOL_GROUPS } from '../tools/index.js';
import { TEXT_LIST, loadBodies } from '../tools/texts.js';
import { LEARN } from '../tools/learn.js';
import { searchItems } from '../lib/search.js';
import { icon } from '../data/icons.js';
import { $, h, debounce } from './common.js';

export function initHome() {
  initCommand();
  initTools();
  initTexts();
}

// ---------- 検索バー ----------
function initCommand() {
  const input = $('cmdIn'), out = $('cmdOut');
  let bodies = null;
  const items = () => [
    ...TOOLS.map((t) => ({ ...t, kind: 'tool', title: t.name, category: t.group, href: `#${t.id}` })),
    ...TEXT_LIST.map((t) => ({ ...t, kind: 'text', icon: t.icon ?? 'texts', href: `#texts/${t.id}`, body: bodies?.get(t.id) ?? '' })),
    // 学習テキスト：題名・説明・章の見出しで探す
    ...LEARN.map((t) => ({ id: t.id, kind: 'text', icon: t.icon, title: t.name, desc: t.tagline, category: t.subject, keywords: [...(t.genres ?? []), ...t.chapters.map((c) => c.title)], href: `#learn/${t.id}` })),
  ];
  const open = (it) => (location.hash = it.href);

  function run() {
    const v = input.value;
    if (!v.trim()) {
      out.replaceChildren();
      return [];
    }
    const hits = searchItems(v, items(), { limit: 6 });
    out.replaceChildren(
      ...(hits.length ? hits.map(({ item: it, snippet }, i) =>
        h('button', { type: 'button', class: `cmd-hit ${it.kind === 'tool' ? 'lv3' : 'lv2'}${i === 0 ? ' top' : ''}`, onclick: () => open(it) },
          h('span', { class: 'cmd-lv' }, it.kind === 'tool' ? 'TOOL' : 'TEXT'),
          h('span', { class: 'cmd-body' }, h('b', {}, it.title), h('span', {}, snippet || it.desc || '')),
          h('span', { class: 'cmd-tool' }, icon(it.kind === 'tool' ? it.id : it.icon, 'ico'), it.kind === 'tool' ? 'ツールを開く' : 'テキストを読む', icon('arrow', 'ico arrow')),
        )) : [h('p', { class: 'hint' }, '見つかりませんでした。別の言葉で試してください。')]),
    );
    return hits;
  }

  input.addEventListener('input', debounce(run, 150));
  // 本文検索のために、最初に入力したときにテキストを読み込んでおく
  input.addEventListener('focus', () => {
    if (!bodies) loadBodies().then((m) => {
      bodies = m;
      if (input.value.trim()) run();
    });
  }, { once: true });
  // Enter：いちばん上の候補を開く
  $('cmdForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const top = run()[0];
    if (top) open(top.item);
  });
  document.querySelectorAll('[data-cmd-try]').forEach((b) => b.addEventListener('click', () => {
    input.value = b.dataset.cmdTry;
    run();
    input.focus();
  }));
}

// ---------- ツールのタイル ----------
function initTools() {
  $('toolGrid').replaceChildren(
    ...TOOL_GROUPS.map((g) =>
      h('div', { class: 'tool-group' },
        h('div', { class: 'tool-group-name' }, g),
        h('div', { class: 'tool-tiles' },
          ...TOOLS.filter((t) => t.group === g).map((t) =>
            h('a', { class: 'tool-tile', href: `#${t.id}` },
              h('span', { class: 'tt-icon' }, icon(t.id)),
              h('span', { class: 'tt-body' }, h('b', {}, t.name), h('span', {}, t.desc)),
              icon('arrow', 'ico tt-go'),
            ),
          ),
        ),
      ),
    ),
  );
}

// ---------- テキスト（新しく更新したものから） ----------
function initTexts() {
  const list = [...TEXT_LIST].sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? ''))).slice(0, 6);
  $('homeTexts').replaceChildren(
    h('div', { class: 'tool-tiles' },
      ...list.map((t) => h('a', { class: 'tool-tile', href: `#texts/${t.id}` },
        h('span', { class: 'tt-icon' }, icon(t.icon ?? 'texts')),
        h('span', { class: 'tt-body' }, h('b', {}, t.title), h('span', {}, t.desc ?? '')),
        icon('arrow', 'ico tt-go'),
      )),
    ),
    h('a', { class: 'cmd-more home-more', href: '#texts' }, `すべてのテキスト（${TEXT_LIST.length} 件）›`),
  );
}

// サイドメニュー：ツールの一覧から組み立てる（グループごとに区切りを入れる）
export function buildNav() {
  const nav = $('nav');
  for (const g of TOOL_GROUPS) {
    nav.append(h('div', { class: 'nav-group' }, g));
    for (const t of TOOLS.filter((x) => x.group === g)) nav.append(h('a', { href: `#${t.id}`, 'data-route': t.id }, t.name));
  }
}

// サイドメニューにアイコンを付ける
export function decorateNav() {
  document.querySelectorAll('#nav a[data-route]').forEach((a) => {
    a.prepend(icon(a.dataset.route, 'ico nav-ico'));
  });
}

// ツールのページ（section）を、各ツールの html から作る
export function buildPages(modules) {
  const main = $('main');
  for (const m of modules) {
    if (document.querySelector(`[data-page="${m.meta.id}"]`)) continue; // index.html に直接書いたページはそのまま使う
    const sec = h('section', { 'data-page': m.meta.id, hidden: '' });
    sec.innerHTML = m.html ?? `<h1>${m.meta.name}</h1>`;
    main.append(sec);
  }
}
