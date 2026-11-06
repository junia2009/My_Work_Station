// 章立てのテキスト（学習テキスト）の表示：目次・章・図・確認問題・「読んだ」印
// 1冊 = { id, name, tagline, icon, genres, level, chapters: [{ id, title, blocks: [...] }] }
// blocks の種類：p / list / steps / tip / warn / code / keys / defs / faq / table / figure / widget / quiz / answer
import { icon } from '../data/icons.js';
import { h, copy, store } from './common.js';

// 図（figure）と動く部品（widget）は、各分野のファイル（netfig.js など）から登録する
const FIGURES = {};
const WIDGETS = {};
export const registerFigures = (o) => Object.assign(FIGURES, o);
export const registerWidgets = (o) => Object.assign(WIDGETS, o);

// 確認問題：選ぶと正解・不正解と解説を表示
function quiz(b) {
  const res = h('div', { class: 'mn-quiz-res', hidden: '' });
  const btns = b.choices.map((c, i) => h('button', { type: 'button', class: 'mn-quiz-c', onclick: () => {
    btns.forEach((x, j) => {
      x.disabled = true;
      x.classList.toggle('ok', j === b.answer);
      x.classList.toggle('ng', j === i && i !== b.answer);
    });
    res.hidden = false;
    res.replaceChildren(h('b', { class: i === b.answer ? 'ok' : 'ng' }, i === b.answer ? '正解！' : '残念……'), h('p', {}, b.explain));
  } }, h('span', {}, 'ABCD'[i]), c));
  return h('div', { class: 'mn-quiz' }, h('div', { class: 'mn-quiz-q' }, h('span', { class: 'mn-quiz-tag' }, 'Q'), b.q), h('div', { class: 'mn-quiz-cs' }, ...btns), res);
}

export const block = (b) => {
  switch (b.type) {
    case 'p': return h('p', { class: 'mn-p' }, b.text);
    case 'list': return h('div', { class: 'mn-list' }, b.title ? h('div', { class: 'mn-sub' }, b.title) : '', h('ul', {}, ...b.items.map((x) => h('li', {}, x))));
    case 'steps': return h('ol', { class: 'mn-steps' }, ...b.items.map((x) => h('li', {}, h('b', {}, x.title), h('p', {}, x.text))));
    case 'tip':
    case 'warn': return h('div', { class: `mn-callout ${b.type}` },
      h('span', { class: 'mn-callout-label' }, b.type === 'tip' ? 'TIP' : '注意'),
      h('div', {}, b.title ? h('b', {}, b.title) : '', h('p', {}, b.text), b.link ? h('a', { class: 'btn ghost small', href: b.link.href, ...(/^https?:/.test(b.link.href) ? { target: '_blank', rel: 'noopener' } : {}) }, b.link.label, /^https?:/.test(b.link.href) ? ' ↗' : '') : ''));
    case 'code': return h('div', { class: 'mn-code' },
      h('div', { class: 'mn-code-head' }, h('span', {}, b.title ?? 'コード'), h('button', { type: 'button', class: 'ghost small', onclick: () => copy(b.code) }, 'コピー')),
      h('pre', {}, b.code));
    case 'keys': return h('table', { class: `mn-keys${b.copy ? ' copyable' : ''}` }, ...b.items.map(([k, d]) => h('tr', {},
      h('th', {}, ...(b.copy ? [h('kbd', { title: 'クリックでコピー', onclick: () => copy(k) }, k)] : k.split(' + ').flatMap((x, i) => [i ? ' + ' : '', h('kbd', {}, x)]))),
      h('td', {}, d))));
    case 'defs': return h('dl', { class: 'mn-defs' }, ...b.items.flatMap(([t, d]) => [h('dt', {}, t), h('dd', {}, d)]));
    case 'faq': return h('div', { class: 'mn-faq' }, ...b.items.map(([q, a]) => h('details', {}, h('summary', {}, q), h('p', {}, a))));
    case 'table': return h('div', { class: 'mn-table-wrap' }, h('table', { class: 'mn-table' },
      b.head ? h('thead', {}, h('tr', {}, ...b.head.map((x) => h('th', {}, x)))) : '',
      h('tbody', {}, ...b.rows.map((r) => h('tr', {}, ...r.map((x, i) => h(i === 0 && b.rowHead !== false ? 'th' : 'td', {}, x)))))));
    case 'quiz': return quiz(b);
    case 'figure': return FIGURES[b.name] ? h('figure', { class: 'mn-figure' }, FIGURES[b.name](), b.caption ? h('figcaption', {}, b.caption) : '') : '';
    case 'widget': return WIDGETS[b.name] ? WIDGETS[b.name](b) : '';
    case 'answer': return h('details', { class: 'mn-answer' }, h('summary', {}, '答えを見る（自分で考えてから！）'), h('p', {}, b.text));
    default: return '';
  }
};

export function renderGuide(root, m, { back, backLabel = '一覧', readKey = null } = {}) {
  const read = new Set(readKey ? store.get(readKey, []) : []);
  const toc = h('nav', { class: 'mn-toc', 'aria-label': '目次' },
    h('div', { class: 'mn-toc-title' }, 'CONTENTS'),
    ...m.chapters.map((c, i) => h('button', { type: 'button', 'data-ch': c.id, onclick: () => document.getElementById(`mn-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
      h('span', {}, read.has(`${m.id}/${c.id}`) ? '✓' : String(i + 1).padStart(2, '0')), c.title)));
  const chapters = m.chapters.map((c, i) => h('section', { class: 'card mn-chapter', id: `mn-${c.id}` },
    h('h2', { class: 'mn-h' }, h('span', { class: 'mn-h-no' }, String(i + 1).padStart(2, '0')), c.title),
    ...c.blocks.map(block),
    readKey ? readButton(c) : ''));
  root.replaceChildren(
    h('a', { class: 'mn-back', href: back }, `‹ ${backLabel}`),
    h('header', { class: 'mn-hero' },
      h('span', { class: 'mn-hero-icon' }, icon(m.icon)),
      h('div', {},
        h('div', { class: 'mn-hero-name' }, m.name, m.kana ? h('small', {}, m.kana) : ''),
        h('p', {}, m.tagline),
        h('div', { class: 'mn-meta' },
          m.genres ? h('span', {}, h('i', {}, 'ジャンル'), m.genres.join(' / ')) : '',
          m.level ? h('span', {}, h('i', {}, 'むずかしさ'), m.level) : '',
          m.prep ? h('span', {}, h('i', {}, m.prepLabel ?? '準備'), m.prep) : '',
          m.site ? h('a', { href: m.site, target: '_blank', rel: 'noopener' }, m.siteLabel, ' ↗') : '',
        ),
      ),
    ),
    h('div', { class: 'mn-layout' }, toc, h('div', { class: 'mn-chapters' }, ...chapters)),
  );
  // 読んでいる章を目次で光らせる
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      toc.querySelectorAll('button').forEach((b) => b.classList.toggle('active', `mn-${b.dataset.ch}` === e.target.id));
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  chapters.forEach((c) => io.observe(c));

  // 章の「読んだ」印（目次に ✓ が付き、一覧に進み具合が出る）
  function readButton(c) {
    const key = `${m.id}/${c.id}`;
    const btn = h('button', { type: 'button', class: 'ghost small mn-read' });
    const paint = () => {
      btn.textContent = read.has(key) ? '✓ 読んだ（取り消す）' : 'この章を読んだ';
      btn.classList.toggle('on', read.has(key));
      const tb = toc.querySelector(`[data-ch="${c.id}"] span`);
      if (tb) tb.textContent = read.has(key) ? '✓' : String(m.chapters.indexOf(c) + 1).padStart(2, '0');
    };
    btn.addEventListener('click', () => {
      if (read.has(key)) read.delete(key);
      else read.add(key);
      store.set(readKey, [...read]);
      paint();
    });
    paint();
    return h('div', { class: 'mn-read-row' }, btn);
  }
}
