// テキスト：texts/ に置いた Markdown の資料を、一覧・検索・目次つきで読む
import { TEXTS } from '../../texts/index.js';
import { parseMarkdown, blocksText, titleOf } from '../lib/markdown.js';
import { normalize } from '../lib/search.js';
import { renderBlocks } from '../ui/markdown-view.js';
import { icon } from '../data/icons.js';
import { $, h, copy, debounce, download, store, KEY } from '../ui/common.js';

export const meta = {
  id: 'texts',
  group: '資料',
  name: 'テキスト',
  code: 'DOCUMENT LIBRARY',
  desc: '手順書・メモ・資料を目次つきで読む',
  icon: 'texts',
  keywords: ['資料', 'ドキュメント', '手順書', 'マニュアル', 'markdown', 'テキスト'],
};

export const help = {
  when: '手順書・社内向けの説明・よく見る資料を、すぐ開けるようにしておきたいとき。',
  steps: ['一覧から読みたいテキストを開く（キーワードで本文まで絞り込めます）', '目次から章へ移動し、コードはボタン 1 つでコピー', '新しいテキストは texts/ に Markdown を置いて texts/index.js に 1 行足すだけ（「ツール・テキストの追加方法」を参照）'],
};

export const pallas = '資料庫だ。手順書は、書いた本人が一番忘れる。だからここに置いておこう。キーワードを入れれば、本文まで僕が探す。';

export const html = `
  <h1>テキスト</h1>
  <div id="txBody"></div>
`;

const BASE = 'texts/';
export const TEXT_LIST = TEXTS;

// 読み込んだテキストの中身（Markdown の文字列）。読み込みは 1 回だけ
const cache = new Map();
export function loadText(t) {
  if (!cache.has(t.id)) {
    cache.set(t.id, fetch(BASE + t.file).then((r) => {
      if (!r.ok) throw new Error(`${t.file} を読み込めませんでした（${r.status}）`);
      return r.text();
    }).catch((e) => {
      cache.delete(t.id); // 失敗したら次に開いたときにやり直す
      throw e;
    }));
  }
  return cache.get(t.id);
}

// 検索用に、全テキストの本文（Markdown の記号を除いた文字）を読み込む
let bodies = null;
export function loadBodies() {
  bodies ??= Promise.all(TEXTS.map(async (t) => {
    try {
      return [t.id, blocksText(parseMarkdown(await loadText(t)))];
    } catch {
      return [t.id, ''];
    }
  })).then((x) => new Map(x));
  return bodies;
}

const fmtDate = (s) => (s ? String(s).replace(/-/g, '/') : '');

export function init() {
  const root = $('txBody');
  let category = store.get(KEY('textCategory'), '');
  let query = '';
  let bodyMap = null;
  let io = null;

  // ---------- 一覧 ----------
  function renderIndex() {
    const cats = [...new Set(TEXTS.map((t) => t.category).filter(Boolean))];
    if (!cats.includes(category)) category = '';
    const search = h('input', { id: 'txSearch', class: 'grow', placeholder: 'タイトル・本文から探す', 'aria-label': 'テキストを探す', value: query });
    const list = h('div', { class: 'mn-index', id: 'txList' });
    const chips = h('div', { class: 'row tx-cats', role: 'group', 'aria-label': '分類で絞り込み' },
      ...['', ...cats].map((c) => h('button', {
        type: 'button', class: `chip${c === category ? ' active' : ''}`, 'aria-pressed': String(c === category),
        onclick: () => {
          category = c;
          store.set(KEY('textCategory'), c);
          renderIndex();
        },
      }, c || 'すべて')));
    const fill = () => {
      const terms = normalize(query).split(/\s+/).filter(Boolean);
      const hit = (t) => {
        const text = normalize(`${t.title} ${t.desc ?? ''} ${t.category ?? ''} ${bodyMap?.get(t.id) ?? ''}`);
        return terms.every((x) => text.includes(x));
      };
      const shown = TEXTS.filter((t) => (!category || t.category === category) && hit(t));
      list.replaceChildren(...(shown.length ? shown.map(card) : [h('p', { class: 'hint' }, TEXTS.length ? '条件に合うテキストがありません。' : 'まだテキストがありません。texts/ に Markdown を置いて、texts/index.js に登録してください。')]));
    };
    search.addEventListener('input', debounce(() => {
      query = search.value;
      fill();
    }, 120));
    root.replaceChildren(
      h('p', { class: 'lead' }, '仕事で使う手順書や資料を置いておく場所です。すべてこのポータルの中にあるので、オフラインでも読めます。'),
      h('div', { class: 'row' }, search),
      cats.length > 1 ? chips : '',
      list,
    );
    fill();
    // 本文検索のために、裏で全テキストを読み込んでおく
    if (!bodyMap) loadBodies().then((m) => {
      bodyMap = m;
      if (root.contains(list)) fill();
    });
  }

  const card = (t) => h('a', { class: 'mn-card tx-card', href: `#texts/${t.id}` },
    h('span', { class: 'mn-card-icon' }, icon(t.icon ?? 'texts')),
    h('div', { class: 'mn-card-body' },
      h('b', {}, t.title),
      t.desc ? h('span', {}, t.desc) : '',
      h('span', { class: 'mn-card-meta' }, t.category ? h('span', { class: 'tag' }, t.category) : '', t.updated ? h('span', { class: 'hint' }, `更新 ${fmtDate(t.updated)}`) : ''),
    ),
    h('span', { class: 'mn-card-go' }, '›'),
  );

  // ---------- 本文 ----------
  async function renderDoc(t, anchor) {
    root.replaceChildren(h('a', { class: 'mn-back', href: '#texts' }, '‹ テキストの一覧'), h('p', { class: 'hint' }, '読み込み中…'));
    let md;
    try {
      md = await loadText(t);
    } catch (e) {
      root.replaceChildren(h('a', { class: 'mn-back', href: '#texts' }, '‹ テキストの一覧'), h('p', { class: 'error' }, e.message));
      return;
    }
    if (location.hash.slice(1).split('/')[1] !== t.id) return; // 読み込み中に別のページへ移った
    let blocks = parseMarkdown(md);
    // 先頭の # 見出しは題名と同じなので、本文からは外す
    if (titleOf(blocks)) blocks = blocks.slice(blocks.findIndex((b) => b.type === 'h') + 1);

    // ## 見出しごとにカードに分ける（## が無ければ全体を 1 枚に）
    const sections = [];
    for (const b of blocks) {
      if (b.type === 'h' && b.level === 2) sections.push({ head: b, blocks: [] });
      else {
        if (!sections.length) sections.push({ head: null, blocks: [] });
        sections.at(-1).blocks.push(b);
      }
    }
    const heads = sections.filter((s) => s.head);
    const no = (s) => String(heads.indexOf(s) + 1).padStart(2, '0');
    const cards = sections.map((s) => h('section', { class: 'card mn-chapter', id: s.head ? `tx-${s.head.id}` : null },
      s.head ? h('h2', { class: 'mn-h' }, h('span', { class: 'mn-h-no' }, no(s)), s.head.text) : '',
      ...renderBlocks(s.blocks, BASE)));
    const toc = heads.length > 1 ? h('nav', { class: 'mn-toc', 'aria-label': '目次' },
      h('div', { class: 'mn-toc-title' }, 'CONTENTS'),
      ...heads.map((s) => h('button', { type: 'button', 'data-ch': s.head.id, onclick: () => $(`tx-${s.head.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
        h('span', {}, no(s)), s.head.text))) : null;

    root.replaceChildren(
      h('a', { class: 'mn-back', href: '#texts' }, '‹ テキストの一覧'),
      h('header', { class: 'mn-hero' },
        h('span', { class: 'mn-hero-icon' }, icon(t.icon ?? 'texts')),
        h('div', {},
          h('div', { class: 'mn-hero-name tx-title' }, t.title),
          t.desc ? h('p', {}, t.desc) : '',
          h('div', { class: 'mn-meta' },
            t.category ? h('span', {}, h('i', {}, '分類'), t.category) : '',
            t.updated ? h('span', {}, h('i', {}, '更新'), fmtDate(t.updated)) : '',
            h('button', { type: 'button', class: 'ghost small', onclick: () => copy(md) }, 'Markdown をコピー'),
            h('button', { type: 'button', class: 'ghost small', onclick: () => download(md, t.file.split('/').pop(), 'text/markdown') }, 'ダウンロード'),
          ),
        ),
      ),
      toc ? h('div', { class: 'mn-layout' }, toc, h('div', { class: 'mn-chapters' }, ...cards)) : h('div', { class: 'mn-chapters' }, ...cards),
    );
    // 読んでいる章を目次で光らせる
    io?.disconnect();
    if (toc) {
      io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          toc.querySelectorAll('button').forEach((b) => b.classList.toggle('active', `tx-${b.dataset.ch}` === e.target.id));
        }
      }, { rootMargin: '-30% 0px -60% 0px' });
      cards.forEach((c) => c.id && io.observe(c));
    }
    if (anchor) setTimeout(() => (document.getElementById(`tx-${anchor}`) ?? document.getElementById(anchor))?.scrollIntoView({ block: 'start' }), 50);
  }

  // #texts/<id> または #texts/<id>/<見出し> で開く
  return (arg) => {
    io?.disconnect();
    const anchor = location.hash.slice(1).split('/')[2];
    const t = TEXTS.find((x) => x.id === arg);
    if (t) renderDoc(t, anchor && decodeURIComponent(anchor));
    else renderIndex();
  };
}
