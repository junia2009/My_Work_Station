// メモの本文の形式：文字の中に、写真の印 {{photo:写真のid}} を置く。画面には依存しない
//   例：'ラックの写真\n{{photo:ph_123}}\n青が本番'

export const PHOTO_RE = /\{\{photo:([\w-]+)\}\}/g;
export const token = (id) => `{{photo:${id}}}`;
const HAS_PHOTO = /\{\{photo:[\w-]+\}\}/; // test 用（g が付いた正規表現は test で位置を覚えてしまうため）

// 本文に出てくる写真の id（出てくる順・重複なし）
export const photoIds = (body) => [...new Set([...String(body ?? '').matchAll(PHOTO_RE)].map((m) => m[1]))];

// 写真を除いた文字だけ（コピー・検索用）。写真だけの行は行ごと消す
export const plainText = (body) => String(body ?? '')
  .split('\n')
  .filter((line) => !(HAS_PHOTO.test(line) && !line.replace(PHOTO_RE, '').trim()))
  .map((line) => line.replace(PHOTO_RE, ''))
  .join('\n')
  .replace(/^\n+|\n+$/g, '');

// 表示用に、文字と写真の並びに分ける：[{ text }, { photo: id }, ...]
export function segments(body) {
  const out = [];
  let last = 0;
  const s = String(body ?? '');
  for (const m of s.matchAll(PHOTO_RE)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ photo: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

// 写真の id を付け替える（読み込みで新しい id になったとき）。map に無い写真は消す
export const remapPhotos = (body, map) => String(body ?? '').replace(PHOTO_RE, (_, id) => (map.has(id) ? token(map.get(id)) : ''));

// 古い形式（v0.4.0：写真を本文と別に photos に持っていた）を、本文の末尾に写真を並べる形にそろえる
export function normalizeMemo(n) {
  let body = String(n.body ?? '');
  const inBody = new Set(photoIds(body));
  const extra = (Array.isArray(n.photos) ? n.photos : []).filter((id) => typeof id === 'string' && !inBody.has(id));
  if (extra.length) body = [body.replace(/\n+$/, ''), ...extra.map(token)].filter(Boolean).join('\n');
  return { ...n, body, photos: photoIds(body) };
}
