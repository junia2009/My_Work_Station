// Markdown（lib/markdown.js で読んだブロック）を画面の部品にする
// 文字はすべて textContent で入れるので、テキストに HTML を書いても実行されない
import { h, copy } from './common.js';
import { safeUrl } from '../lib/markdown.js';

// base：画像や相対リンクの基準（texts/ に置いた md なら 'texts/'）
export function renderInline(nodes, base = '') {
  return nodes.map((n) => {
    if (typeof n === 'string') return n;
    switch (n.t) {
      case 'br': return h('br');
      case 'code': return h('code', { class: 'md-code', title: 'クリックでコピー', onclick: () => copy(n.v) }, n.v);
      case 'b': return h('strong', {}, ...renderInline(n.c, base));
      case 'i': return h('em', {}, ...renderInline(n.c, base));
      case 's': return h('s', {}, ...renderInline(n.c, base));
      case 'img': {
        const src = safeUrl(n.src);
        if (!src || /^(mailto|tel):/i.test(src)) return n.alt;
        return h('img', { class: 'md-img', src: resolve(src, base), alt: n.alt, title: n.title || null, loading: 'lazy' });
      }
      case 'a': {
        const href = safeUrl(n.href);
        if (!href) return h('span', {}, ...renderInline(n.c, base));
        const external = /^https?:/i.test(href);
        // 別のテキストへのリンク（other.md）は、ポータルの中で開く
        const md = !external && href.match(/^(?:\.\/)?([\w-]+)\.md(#.*)?$/);
        const target = md ? `#texts/${md[1]}` : resolve(href, base);
        return h('a', { href: target, title: n.title || null, ...(external ? { target: '_blank', rel: 'noopener' } : {}) }, ...renderInline(n.c, base), external ? ' ↗' : '');
      }
      default: return '';
    }
  });
}

const resolve = (url, base) => (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(url) ? url : base + url.replace(/^\.\//, ''));

export function renderBlocks(blocks, base = '') {
  return blocks.map((b) => renderBlock(b, base));
}

const LABEL = { note: 'NOTE', tip: 'TIP', important: '重要', warn: '注意' };

function renderBlock(b, base) {
  const inl = (x) => renderInline(x, base);
  switch (b.type) {
    case 'h': return h(`h${Math.min(6, b.level + 1)}`, { class: `md-h md-h${b.level}`, id: b.id }, ...inl(b.inl));
    case 'p': return h('p', { class: 'mn-p' }, ...inl(b.inl));
    case 'hr': return h('hr', { class: 'md-hr' });
    case 'code': return h('div', { class: 'mn-code' },
      h('div', { class: 'mn-code-head' }, h('span', {}, b.title || b.lang || 'コード'), h('button', { type: 'button', class: 'ghost small', onclick: () => copy(b.code) }, 'コピー')),
      h('pre', {}, b.code));
    case 'quote': return h('blockquote', { class: 'md-quote' }, ...renderBlocks(b.blocks, base));
    case 'callout': return h('div', { class: `mn-callout ${b.kind}` },
      h('span', { class: 'mn-callout-label' }, LABEL[b.kind] ?? b.label),
      h('div', {}, b.title ? h('b', {}, ...inl(b.title)) : '', ...renderBlocks(b.blocks, base)));
    case 'ul':
    case 'ol': {
      const task = b.items.some((it) => it.checked !== null);
      return h('div', { class: 'mn-list md-list' }, h(b.type, { start: b.type === 'ol' && b.start !== 1 ? b.start : null, class: task ? 'md-task' : null },
        ...b.items.map((it) => {
          // 項目が段落 1 つだけなら、段落の余白を付けずに並べる
          const body = it.blocks.length === 1 && it.blocks[0].type === 'p' ? inl(it.blocks[0].inl)
            : it.blocks.map((x, i) => (i === 0 && x.type === 'p' ? h('span', {}, ...inl(x.inl)) : renderBlock(x, base)));
          if (it.checked === null) return h('li', {}, ...body);
          return h('li', { class: it.checked ? 'done' : '' }, h('span', { class: 'md-check', 'aria-label': it.checked ? '済み' : '未完了' }, it.checked ? '✓' : ''), h('span', {}, ...body));
        })));
    }
    case 'table': return h('div', { class: 'mn-table-wrap' }, h('table', { class: 'mn-table' },
      h('thead', {}, h('tr', {}, ...b.head.map((c, i) => h('th', { style: b.align[i] ? `text-align:${b.align[i]}` : null }, ...inl(c))))),
      h('tbody', {}, ...b.rows.map((r) => h('tr', {}, ...b.head.map((_, i) => h('td', { style: b.align[i] ? `text-align:${b.align[i]}` : null }, ...inl(r[i] ?? []))))))));
    default: return '';
  }
}
