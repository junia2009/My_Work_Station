// 写真の保存場所（ブラウザの IndexedDB）。メモなどから id で出し入れする
// localStorage は数 MB しか入らないので、写真だけはこちらに置く

const DB_NAME = 'workstation';
const STORE = 'photos';
let dbp = null;

function db() {
  dbp ??= new Promise((ok, ng) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ng(req.error ?? new Error('写真の保存場所を開けませんでした'));
  });
  dbp.catch(() => (dbp = null)); // 失敗したら次に使うときにやり直す
  return dbp;
}

const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((ok, ng) => {
    const t = d.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const result = fn(s);
    t.oncomplete = () => ok(result?.result ?? result);
    t.onerror = () => ng(t.error ?? new Error('写真を保存できませんでした'));
    t.onabort = () => ng(t.error ?? new Error('写真を保存できませんでした（空き容量が足りない可能性があります）'));
  });
};

const newId = () => 'ph_' + (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`);

// 写真を 1 枚保存して id を返す。rec: { blob, w, h, name }
export async function putPhoto(rec) {
  const id = rec.id ?? newId();
  await tx('readwrite', (s) => s.put({ id, blob: rec.blob, type: rec.blob.type, w: rec.w ?? 0, h: rec.h ?? 0, name: rec.name ?? '', created: Date.now() }));
  return id;
}

export const getPhoto = (id) => tx('readonly', (s) => s.get(id));

export async function deletePhotos(ids) {
  const list = [...new Set(ids ?? [])].filter(Boolean);
  if (!list.length) return;
  await tx('readwrite', (s) => list.forEach((id) => s.delete(id)));
}

// どのメモからも使われていない写真を消す（編集を途中でやめたときの残りなど）
// 作ったばかりのもの（別のタブで編集中かもしれない）は残す
export async function sweepPhotos(usedIds, olderThanMs = 60 * 60 * 1000) {
  const used = new Set(usedIds);
  const all = await tx('readonly', (s) => s.getAll());
  const now = Date.now();
  const drop = (all ?? []).filter((r) => !used.has(r.id) && now - (r.created ?? 0) > olderThanMs).map((r) => r.id);
  await deletePhotos(drop);
  return drop.length;
}

// 消されにくくする（ブラウザが空き容量の確保で消すことがあるため）。対応していなければ何もしない
export function askPersist() {
  try {
    navigator.storage?.persist?.();
  } catch { /* 対応していないブラウザ */ }
}
