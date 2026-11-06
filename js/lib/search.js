// ツールとテキストを横断して探す（ホームの検索バーで使う）。画面には依存しない

// 比べやすい形にそろえる：全角英数→半角、大文字→小文字、カタカナ→ひらがな
export function normalize(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// items: { id, title, desc?, keywords?: string[], category?, body? }
// 空白で区切った語が「すべて」どこかに含まれるものを、当たった場所の重みで並べる
export function searchItems(query, items, { limit = 20 } = {}) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits = [];
  for (const it of items) {
    const f = {
      title: normalize(it.title),
      keywords: normalize((it.keywords ?? []).join(' ')),
      desc: normalize(it.desc),
      category: normalize(it.category),
      body: normalize(it.body),
    };
    let score = 0, ok = true, bodyTerm = null;
    for (const t of terms) {
      let s = 0;
      if (f.title.includes(t)) s += f.title.startsWith(t) ? 14 : 10;
      if (f.keywords.includes(t)) s += 6;
      if (f.desc.includes(t)) s += 4;
      if (f.category.includes(t)) s += 3;
      if (!s && f.body.includes(t)) {
        s += 1;
        bodyTerm ??= t;
      }
      if (!s) { ok = false; break; }
      score += s;
    }
    if (ok) hits.push({ item: it, score, snippet: bodyTerm ? snippet(it.body, bodyTerm) : '' });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// 本文の中で語が出てくるあたりを短く切り出す
export function snippet(body, term, width = 36) {
  const text = String(body ?? '').replace(/\s+/g, ' ');
  const pos = normalize(text).indexOf(normalize(term));
  if (pos < 0) return '';
  const start = Math.max(0, pos - width), end = Math.min(text.length, pos + term.length + width);
  return `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}
