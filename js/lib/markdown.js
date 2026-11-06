// Markdown を読みやすい部品の並び（ブロックの配列）に変える。画面には依存しない
//
// 対応している書き方：
//   # 見出し（1〜6）／ 段落 ／ 空行で段落を分ける ／ 行末の 2 つの空白か \ で改行
//   - 箇条書き ／ 1. 番号付き ／ - [ ] チェックリスト（字下げで入れ子）
//   ``` コード（言語名やタイトルも書ける：```bash 手順）
//   > 引用 ／ > [!NOTE] > [!TIP] > [!WARNING] > [!IMPORTANT] > [!CAUTION] で囲み
//   | 表 | ／ --- 区切り線
//   インライン：`コード` **太字** *斜体* ~~取り消し~~ [リンク](URL) ![画像](パス) <https://自動リンク>
//
// 生の HTML は書いても文字として表示する（スクリプトなどが動かないように）

// ---------- インライン ----------
// 返り値は配列：文字列、または { t: 'code' | 'b' | 'i' | 's' | 'a' | 'img' | 'br', ... }
export function parseInline(src) {
  const out = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push(buf);
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i], rest = src.slice(i);
    // エスケープ
    if (c === '\\' && i + 1 < src.length) {
      if (src[i + 1] === '\n') {
        flush();
        out.push({ t: 'br' });
        i += 2;
        continue;
      }
      if (/[\\`*_{}[\]()#+\-.!|~<>]/.test(src[i + 1])) {
        buf += src[i + 1];
        i += 2;
        continue;
      }
    }
    // 改行（行末の 2 つ以上の空白は改行、それ以外は空白なしでつなぐ。日本語の文章で余計な空白が入らないように）
    if (c === '\n') {
      if (/ {2,}$/.test(buf)) {
        buf = buf.replace(/ +$/, '');
        flush();
        out.push({ t: 'br' });
      } else {
        buf = buf.replace(/ +$/, '');
        // 英単語どうしの改行だけ空白を入れる
        const next = src[i + 1] ?? '';
        if (/[A-Za-z0-9,.;:!?)]$/.test(buf) && /[A-Za-z0-9(]/.test(next)) buf += ' ';
      }
      i++;
      while (src[i] === ' ') i++;
      continue;
    }
    // コード
    if (c === '`') {
      const ticks = rest.match(/^`+/)[0];
      const end = src.indexOf(ticks, i + ticks.length);
      if (end > 0) {
        flush();
        let code = src.slice(i + ticks.length, end).replace(/\n/g, ' ');
        if (/^ .* $/.test(code)) code = code.slice(1, -1);
        out.push({ t: 'code', v: code });
        i = end + ticks.length;
        continue;
      }
    }
    // 自動リンク <https://...>
    let m = rest.match(/^<((?:https?:\/\/|mailto:)[^\s<>]+)>/);
    if (m) {
      flush();
      out.push({ t: 'a', href: m[1], c: [m[1]] });
      i += m[0].length;
      continue;
    }
    // 画像・リンク
    if (c === '!' && src[i + 1] === '[' || c === '[') {
      const img = c === '!';
      const close = findClose(src, i + (img ? 1 : 0));
      if (close > 0 && src[close + 1] === '(') {
        const end = src.indexOf(')', close + 2);
        if (end > 0) {
          const label = src.slice(i + (img ? 2 : 1), close);
          const [href, ...titleParts] = src.slice(close + 2, end).trim().split(/\s+/);
          const title = titleParts.join(' ').replace(/^["']|["']$/g, '');
          flush();
          if (img) out.push({ t: 'img', src: href, alt: label, title });
          else out.push({ t: 'a', href, title, c: parseInline(label) });
          i = end + 1;
          continue;
        }
      }
    }
    // 太字・斜体・取り消し
    m = rest.match(/^(\*\*|__)(?=\S)([\s\S]*?\S)\1/);
    if (m) {
      flush();
      out.push({ t: 'b', c: parseInline(m[2]) });
      i += m[0].length;
      continue;
    }
    m = rest.match(/^~~(?=\S)([\s\S]*?\S)~~/);
    if (m) {
      flush();
      out.push({ t: 's', c: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    // _ は単語の途中（snake_case）では斜体にしない
    m = rest.match(/^\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/) || (!/\w/.test(src[i - 1] ?? '') ? rest.match(/^_(?=\S)([\s\S]*?\S)_(?!\w)/) : null);
    if (m) {
      flush();
      out.push({ t: 'i', c: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

// [ に対応する ] の位置（入れ子と `コード` を考える）
function findClose(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '`') {
      const e = src.indexOf('`', i + 1);
      if (e > 0) { i = e; continue; }
    }
    if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return i;
  }
  return -1;
}

// インラインの中身を文字だけにする（目次・検索用）
export const inlineText = (nodes) => nodes.map((n) => (typeof n === 'string' ? n : n.t === 'br' ? ' ' : n.t === 'code' ? n.v : n.t === 'img' ? n.alt : inlineText(n.c ?? []))).join('');

// リンク先として許すもの（javascript: などは無効にする）
export function safeUrl(url) {
  const u = String(url ?? '').trim();
  if (/^(https?:|mailto:|tel:|#)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null; // それ以外のスキームは許さない
  return u; // 相対パス
}

// 見出しの id（目次から飛ぶため）
export function slug(text, used = new Map()) {
  const base = text.trim().toLowerCase().replace(/[\s　]+/g, '-').replace(/[^\p{L}\p{N}\-_]/gu, '') || 'section';
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n ? `${base}-${n + 1}` : base;
}

// ---------- ブロック ----------
const CALLOUTS = { NOTE: 'note', TIP: 'tip', IMPORTANT: 'important', WARNING: 'warn', CAUTION: 'warn' };
const LIST_RE = /^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const indentOf = (l) => l.match(/^ */)[0].length;
const isBlank = (l) => !l.trim();

export function parseMarkdown(md, { ids = new Map() } = {}) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  return parseBlocks(lines, ids);
}

function parseBlocks(lines, ids) {
  const blocks = [];
  let i = 0;
  const startsBlock = (l) => /^ {0,3}(#{1,6}\s|```|~~~|>|(?:[-*_] *){3,}$)/.test(l) || LIST_RE.test(l) || /^\s*\|.*\|\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    // 見出し
    let m = line.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (m) {
      const inl = parseInline(m[2]);
      blocks.push({ type: 'h', level: m[1].length, inl, text: inlineText(inl), id: slug(inlineText(inl), ids) });
      i++;
      continue;
    }
    // コード
    m = line.match(/^ {0,3}(```+|~~~+)\s*([^\s`]*)\s*(.*)$/);
    if (m) {
      const fence = m[1], body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', lang: m[2], title: m[3], code: body.join('\n') });
      continue;
    }
    // 区切り線
    if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    // 引用・囲み
    if (/^ {0,3}>/.test(line)) {
      const body = [];
      while (i < lines.length && !isBlank(lines[i]) && (/^ {0,3}>/.test(lines[i]) || !startsBlock(lines[i]))) {
        body.push(lines[i].replace(/^ {0,3}> ?/, ''));
        i++;
      }
      const cm = body[0]?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
      if (cm) {
        const title = cm[2];
        blocks.push({ type: 'callout', kind: CALLOUTS[cm[1].toUpperCase()], label: cm[1].toUpperCase(), title: title ? parseInline(title) : null, blocks: parseBlocks(body.slice(1), ids) });
      } else {
        blocks.push({ type: 'quote', blocks: parseBlocks(body, ids) });
      }
      continue;
    }
    // 表（見出し行の次が | --- | の行）
    if (/^\s*\|?.*\|.*$/.test(line) && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1] ?? '')) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => parseInline(c.trim().replace(/\\\|/g, '|')));
      const head = cells(line);
      const align = lines[i + 1].trim().replace(/^\||\|$/g, '').split('|').map((c) => {
        c = c.trim();
        return c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : null;
      });
      const rows = [];
      i += 2;
      while (i < lines.length && /\|/.test(lines[i]) && !isBlank(lines[i])) rows.push(cells(lines[i++]));
      blocks.push({ type: 'table', head, align, rows });
      continue;
    }
    // 箇条書き
    m = line.match(LIST_RE);
    if (m) {
      const base = m[1].length;
      const ordered = /\d/.test(m[2]);
      const items = [];
      while (i < lines.length) {
        const lm = lines[i].match(LIST_RE);
        if (!lm || lm[1].length !== base || /\d/.test(lm[2]) !== ordered) break;
        const contentIndent = base + lm[2].length + 1;
        const body = [lm[3]];
        i++;
        // 字下げされた続きの行・空行を挟んだ続きを、この項目の中身にする
        while (i < lines.length) {
          const l = lines[i];
          if (isBlank(l)) {
            const next = lines.slice(i + 1).find((x) => !isBlank(x));
            if (next !== undefined && indentOf(next) > base) { body.push(''); i++; continue; }
            break;
          }
          if (indentOf(l) > base) { body.push(l.slice(Math.min(indentOf(l), contentIndent))); i++; continue; }
          if (LIST_RE.test(l) || startsBlock(l)) break;
          body.push(l.trim()); // 字下げのない続きの行（段落の続き）
          i++;
        }
        let checked = null;
        const cb = body[0].match(/^\[([ xX])\]\s+(.*)$/);
        if (cb) {
          checked = cb[1] !== ' ';
          body[0] = cb[2];
        }
        items.push({ checked, blocks: parseBlocks(body, ids) });
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', start: ordered ? parseInt(m[2], 10) : 1, items });
      // 空行を挟んで同じ種類のリストが続く場合は、別のリストとして扱う
      continue;
    }
    // 段落
    const para = [];
    while (i < lines.length && !isBlank(lines[i]) && (!para.length || !startsBlock(lines[i]))) para.push(lines[i++].replace(/^ {0,3}/, ''));
    blocks.push({ type: 'p', inl: parseInline(para.join('\n')) });
  }
  return blocks;
}

// ---------- 検索・目次用 ----------
export function blocksText(blocks) {
  return blocks.map((b) => {
    switch (b.type) {
      case 'h': return b.text;
      case 'p': return inlineText(b.inl);
      case 'code': return b.code;
      case 'quote': case 'callout': return blocksText(b.blocks);
      case 'ul': case 'ol': return b.items.map((it) => blocksText(it.blocks)).join('\n');
      case 'table': return [b.head, ...b.rows].map((r) => r.map(inlineText).join(' ')).join('\n');
      default: return '';
    }
  }).join('\n');
}

// 文書の最初の # 見出しを題名として取り出す（無ければ null）
export function titleOf(blocks) {
  const first = blocks.find((b) => b.type !== 'hr');
  return first?.type === 'h' && first.level === 1 ? first.text : null;
}
