// メモ：ブラウザ内に保存する作業メモ（タグで分類・検索・JSON で書き出し / 読み込み）
import { $, h, store, toast, copy, debounce, download, registerReceiver, pallasSay, KEY } from '../ui/common.js';
import { putPhoto, getPhoto, deletePhotos, sweepPhotos, askPersist } from '../lib/photostore.js';
import { shrinkImage, blobToDataUrl, dataUrlToBlob } from '../ui/image.js';
import { photoEditor } from '../ui/photoeditor.js';
import { photoIds, plainText, segments, remapPhotos, normalizeMemo } from '../lib/memobody.js';

export const meta = {
  id: 'memo',
  group: '記録',
  name: 'メモ',
  code: 'WORK LOG',
  desc: '作業メモ・定型文・写真をタグで整理して保存',
  icon: 'memo',
  keywords: ['メモ', 'ノート', '記録', '定型文', 'テンプレート', '日報', 'todo', '写真', '画像', 'スクリーンショット'],
};

export const help = {
  when: '作業の記録、よく使う定型文、あとで調べることなどを置いておきたいとき。',
  steps: ['タイトル・タグ・本文を入れて保存（写真は本文の好きな位置に、貼り付け Ctrl+V・ドロップ・「写真を追加」で入れられます）', '一覧はタイトルだけ。タイトルを押すと本文が開きます（「すべて開く」「すべて閉じる」もあります）', '一覧の「本文をコピー」で、定型文としてそのまま使えます', '別の端末に移すときは「書き出し」した JSON を「読み込み」します'],
};

export const pallas = 'メモは未来の君への手紙だ。書いておけば、同じ調べものを二度しなくて済む。このブラウザの中にだけ保存されるから、大事なものは書き出しておこう。';

export const html = `
  <h1>メモ</h1>
  <p class="hint">このブラウザ内にだけ保存されます（外部には送信されません）。別の端末に移すときは「書き出し」を使ってください。</p>
  <div class="card">
    <h3 id="memoFormTitle">メモを追加</h3>
    <form id="memoForm">
      <input type="hidden" id="memoId">
      <div class="form-grid">
        <div><label for="memoTitle">タイトル</label><input id="memoTitle" required></div>
        <div><label for="memoTag">タグ</label><input id="memoTag" list="memoTagList" placeholder="例: 定型文 / 手順 / TODO"><datalist id="memoTagList"></datalist></div>
      </div>
      <label id="memoBodyLabel">本文</label>
      <div id="memoBody" class="memo-editor empty" aria-labelledby="memoBodyLabel" data-placeholder="本文。写真は好きな位置に貼り付け（Ctrl+V）・ドロップ・下の「写真を追加」で入れられます"></div>
      <div class="memo-photo-bar">
        <label class="btn ghost small" for="memoPhotoIn">写真を追加</label>
        <input type="file" id="memoPhotoIn" accept="image/*" multiple hidden>
        <span class="hint" id="memoPhotoHint"></span>
      </div>
      <div class="row">
        <button type="submit">保存</button>
        <button type="button" class="ghost" id="memoCancel">キャンセル</button>
      </div>
    </form>
  </div>
  <div class="row between">
    <div class="row">
      <input id="memoSearch" placeholder="キーワードで絞り込み" aria-label="メモを絞り込み">
      <select id="memoFilter" aria-label="タグで絞り込み"></select>
    </div>
    <div class="row">
      <button type="button" class="ghost" id="memoOpenAll">すべて開く</button>
      <button type="button" class="ghost" id="memoCloseAll">すべて閉じる</button>
      <button type="button" class="ghost" id="memoExport">書き出し</button>
      <label class="btn ghost" for="memoImport">読み込み</label>
      <input type="file" id="memoImport" accept="application/json" hidden>
    </div>
  </div>
  <div id="memoList" class="note-list"></div>
  <dialog class="memo-viewer" id="memoViewer" aria-label="写真">
    <img id="memoViewerImg" alt="">
    <div class="row between">
      <span class="hint" id="memoViewerInfo"></span>
      <span class="row">
        <button type="button" class="ghost small" id="memoViewerPrev" aria-label="前の写真">‹</button>
        <button type="button" class="ghost small" id="memoViewerNext" aria-label="次の写真">›</button>
        <button type="button" class="ghost small" id="memoViewerSave">保存</button>
        <button type="button" class="small" id="memoViewerClose">閉じる</button>
      </span>
    </div>
  </dialog>
`;

const MEMO_KEY = KEY('memos');
const PHOTO_HINT = 'カーソルの位置に入ります。長辺 1600px に縮小して、このブラウザに保存します';
// 古い形式（写真を本文の外に持っていたもの）は、読むときに本文の末尾へ写真を並べる形にそろえる
const load = () => store.get(MEMO_KEY, []).map(normalizeMemo);
const save = (list) => {
  if (!store.set(MEMO_KEY, list)) toast('保存できませんでした（ブラウザの保存領域が使えません）');
};
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const photosOf = (n) => photoIds(n.body);

// 写真の表示用 URL（id ごとに 1 回だけ作る）
const urls = new Map();
async function photoUrl(id) {
  if (!urls.has(id)) {
    urls.set(id, getPhoto(id).then((r) => (r ? { url: URL.createObjectURL(r.blob), rec: r } : null)).catch(() => null));
  }
  return urls.get(id);
}
function forgetPhotos(ids) {
  for (const id of ids) {
    urls.get(id)?.then((x) => x && URL.revokeObjectURL(x.url));
    urls.delete(id);
  }
}
// 本文の中の写真：先に枠を出しておき、読み込めたら画像を入れる。押すと大きく見られる
function inlinePhoto(id, onOpen) {
  const btn = h('button', { type: 'button', class: 'memo-inline', 'aria-label': '写真を大きく見る', title: '写真を大きく見る', onclick: onOpen });
  photoUrl(id).then((x) => {
    if (x) btn.append(h('img', { src: x.url, alt: x.rec.name || '写真', loading: 'lazy', width: x.rec.w || null, height: x.rec.h || null }));
    else btn.replaceChildren(h('span', { class: 'hint' }, '（読み込めない写真）'));
  });
  return btn;
}

// 表示用の並び。写真は 1 行を占めるので、写真の前後の改行 1 つずつは表示しない（空行にならないように）
function blockSegments(body) {
  const segs = segments(body);
  return segs.map((seg, i) => {
    if (seg.photo) return seg;
    let t = seg.text;
    if (segs[i - 1]?.photo) t = t.replace(/^\n/, '');
    if (segs[i + 1]?.photo) t = t.replace(/\n$/, '');
    return { text: t };
  }).filter((seg) => seg.photo || seg.text);
}

const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export function init() {
  const form = $('memoForm');
  // 本文の入力欄（写真を中に置ける）
  const ed = photoEditor($('memoBody'), { photoUrl, onFiles: (files) => addFiles(files) });
  // この編集で足した写真と、編集を始めたときの写真
  let added = [], original = [];
  const reset = () => {
    form.reset();
    $('memoId').value = '';
    $('memoFormTitle').textContent = 'メモを追加';
    ed.clear();
    added = [];
    original = [];
    $('memoPhotoHint').textContent = PHOTO_HINT;
  };
  // キャンセル：この編集で足した写真は消す
  const cancel = () => {
    deletePhotos(added).catch(() => {});
    forgetPhotos(added);
    reset();
  };

  async function addFiles(files) {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    $('memoPhotoHint').textContent = `写真を保存しています…（${list.length} 枚）`;
    let ok = 0;
    for (const f of list) {
      try {
        const id = await putPhoto(await shrinkImage(f));
        added.push(id);
        await photoUrl(id);
        ed.insertPhoto(id);
        ok++;
      } catch (e) {
        toast(`${f.name || '写真'}：${e.message}`);
      }
    }
    if (ok) askPersist();
    $('memoPhotoHint').textContent = ok ? `${ok} 枚を入れました。「保存」でメモに残ります` : PHOTO_HINT;
  }
  $('memoPhotoHint').textContent = PHOTO_HINT;
  $('memoPhotoIn').addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  });
  // 本文の外（タイトルなど）に貼り付け・ドロップした写真も、本文に入れる
  form.addEventListener('paste', (e) => {
    if ($('memoBody').contains(e.target)) return;
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  });
  const card = form.closest('.card');
  ['dragenter', 'dragover'].forEach((ev) => card.addEventListener(ev, (e) => {
    if (![...(e.dataTransfer?.types ?? [])].includes('Files')) return;
    e.preventDefault();
    card.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((ev) => card.addEventListener(ev, () => card.classList.remove('over')));
  card.addEventListener('drop', (e) => {
    if ($('memoBody').contains(e.target) || !e.dataTransfer?.files?.length) return;
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const list = load();
    const item = {
      id: $('memoId').value || newId(),
      title: $('memoTitle').value.trim(),
      tag: $('memoTag').value.trim(),
      body: ed.getBody(),
      updated: new Date().toISOString(),
    };
    item.photos = photoIds(item.body);
    const i = list.findIndex((n) => n.id === item.id);
    if (i >= 0) list.splice(i, 1);
    list.unshift(item); // 更新したものを先頭へ
    save(list);
    // 編集で外した写真（足してから消したものも）は消す
    const removed = [...original, ...added].filter((id) => !item.photos.includes(id));
    deletePhotos(removed).catch(() => {});
    forgetPhotos(removed);
    reset();
    render();
    toast('保存しました');
    pallasSay({ kind: 'memoSaved', n: list.length, title: item.title, anchor: '#memoList' });
  });
  $('memoCancel').addEventListener('click', cancel);
  // 他のツールから「メモに残す」で送られてきたとき
  registerReceiver('memo', (p) => {
    reset();
    $('memoTitle').value = p.title ?? '';
    $('memoTag').value = p.tag ?? '';
    ed.setBody(p.body ?? '');
    $('memoTitle').focus();
  });

  function edit(n) {
    if (added.length) cancel(); // 前の編集で足した写真を残さない
    $('memoId').value = n.id;
    original = photosOf(n);
    added = [];
    $('memoTitle').value = n.title;
    $('memoTag').value = n.tag ?? '';
    ed.setBody(n.body ?? '');
    $('memoFormTitle').textContent = 'メモを編集';
    form.scrollIntoView({ behavior: 'smooth' });
  }

  function renderTags(all) {
    const tags = [...new Set(all.map((n) => n.tag).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    const cur = $('memoFilter').value;
    $('memoFilter').replaceChildren(h('option', { value: '' }, 'すべてのタグ'), ...tags.map((t) => h('option', { value: t }, t)));
    $('memoFilter').value = tags.includes(cur) ? cur : '';
    $('memoTagList').replaceChildren(...tags.map((t) => h('option', { value: t })));
  }

  // 本文を開いているメモ（ふだんはタイトルだけ。ページを開き直すと閉じた状態に戻る）
  const opened = new Set();
  let shown = [];
  let lastQ = '';

  function render() {
    const all = load();
    renderTags(all);
    const tag = $('memoFilter').value;
    const q = $('memoSearch').value.trim().toLowerCase();
    const list = all.filter((n) => (!tag || n.tag === tag) && (!q || `${n.title}\n${n.tag}\n${plainText(n.body)}`.toLowerCase().includes(q)));
    shown = list;
    // キーワードが変わったら、本文にだけ当たったメモを開く（どこに当たったか分かるように）
    if (q !== lastQ) {
      lastQ = q;
      if (q) for (const n of list) if (plainText(n.body).toLowerCase().includes(q) && !`${n.title}\n${n.tag}`.toLowerCase().includes(q)) opened.add(n.id);
    }
    $('memoList').replaceChildren(
      ...(list.length ? list.map((n) => {
        const photos = photosOf(n);
        const text = plainText(n.body);
        const has = !!n.body.trim();
        const open = has && opened.has(n.id);
        const bodyId = `memo-body-${n.id}`;
        const toggle = () => {
          if (!has) return;
          if (opened.has(n.id)) opened.delete(n.id);
          else opened.add(n.id);
          render();
          document.querySelector(`[aria-controls="${bodyId}"]`)?.focus();
        };
        return h('div', { class: `note memo${open ? ' open' : ''}` },
          h('div', { class: 'head' },
            h('button', {
              type: 'button', class: 'memo-toggle', 'aria-expanded': has ? String(open) : null, 'aria-controls': has ? bodyId : null,
              title: has ? (open ? '本文を閉じる' : '本文を開く') : '本文はありません', onclick: toggle,
            },
            h('span', { class: `memo-chev${has ? '' : ' none'}`, 'aria-hidden': 'true' }, '›'),
            n.tag ? h('span', { class: 'tag' }, n.tag) : '',
            h('strong', {}, n.title),
            photos.length ? h('span', { class: 'memo-count', title: `写真 ${photos.length} 枚` }, `写真 ${photos.length}`) : ''),
            h('div', { class: 'row' },
              h('span', { class: 'meta' }, fmtDate(n.updated)),
              text ? h('button', { type: 'button', class: 'ghost small', title: '写真を除いた文字をコピーします', onclick: () => copy(text) }, '本文をコピー') : '',
              h('button', { type: 'button', class: 'ghost small', onclick: () => edit(n) }, '編集'),
              h('button', {
                type: 'button', class: 'ghost small',
                onclick: () => {
                  if (!confirm(`「${n.title}」を削除しますか？`)) return;
                  opened.delete(n.id);
                  save(load().filter((x) => x.id !== n.id));
                  deletePhotos(photos).catch(() => {});
                  forgetPhotos(photos);
                  render();
                },
              }, '削除'),
            ),
          ),
          open ? h('div', { id: bodyId, class: 'memo-body' }, ...blockSegments(n.body).map((seg) => (seg.photo
            ? inlinePhoto(seg.photo, () => viewer(photos, photos.indexOf(seg.photo)))
            : h('span', { class: 'memo-text' }, seg.text)))) : '',
        );
      }) : [h('p', { class: 'hint' }, all.length ? '条件に合うメモがありません。' : 'まだメモがありません。')]),
    );
  }

  $('memoOpenAll').addEventListener('click', () => {
    shown.forEach((n) => n.body.trim() && opened.add(n.id));
    render();
  });
  $('memoCloseAll').addEventListener('click', () => {
    opened.clear();
    render();
  });

  $('memoFilter').addEventListener('change', render);
  $('memoSearch').addEventListener('input', debounce(render));

  // ---------- 写真を大きく見る ----------
  const dlg = $('memoViewer');
  let vList = [], vIdx = 0;
  async function showPhoto() {
    const x = await photoUrl(vList[vIdx]);
    $('memoViewerImg').src = x?.url ?? '';
    $('memoViewerInfo').textContent = x ? `${vIdx + 1} / ${vList.length}　${x.rec.w}×${x.rec.h}` : '読み込めませんでした';
    $('memoViewerPrev').hidden = $('memoViewerNext').hidden = vList.length < 2;
  }
  function viewer(list, i) {
    vList = [...list];
    vIdx = i;
    showPhoto();
    if (dlg.open) return;
    if (dlg.showModal) dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  const step = (d) => {
    vIdx = (vIdx + d + vList.length) % vList.length;
    showPhoto();
  };
  $('memoViewerPrev').addEventListener('click', () => step(-1));
  $('memoViewerNext').addEventListener('click', () => step(1));
  $('memoViewerClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => e.target === dlg && dlg.close()); // 枠の外を押したら閉じる
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  $('memoViewerSave').addEventListener('click', async () => {
    const x = await photoUrl(vList[vIdx]);
    if (x) download(x.rec.blob, x.rec.name || 'photo.jpg', x.rec.type);
  });

  // ---------- 書き出し・読み込み（写真は JSON の中に入れる） ----------
  $('memoExport').addEventListener('click', async () => {
    const list = load();
    const out = [];
    let missing = 0;
    for (const n of list) {
      const photos = [];
      for (const id of photosOf(n)) {
        const r = await getPhoto(id).catch(() => null);
        if (!r) { missing++; continue; }
        photos.push({ id, name: r.name, w: r.w, h: r.h, data: await blobToDataUrl(r.blob) });
      }
      out.push({ ...n, photos });
    }
    download(JSON.stringify(out, null, 2), `work-memo-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    if (missing) toast(`読み込めない写真が ${missing} 枚ありました（書き出しから外しました）`);
  });

  $('memoImport').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('形式が違います');
      const clean = data
        .filter((n) => n && typeof n.title === 'string')
        .map((n) => ({ id: String(n.id ?? newId()), title: n.title, tag: String(n.tag ?? ''), body: String(n.body ?? ''), updated: String(n.updated ?? ''), photos: Array.isArray(n.photos) ? n.photos : [] }));
      const cur = load();
      const ids = new Set(cur.map((n) => n.id));
      const add = clean.filter((n) => !ids.has(n.id));
      // 写真（data URL）を保存し直して、本文の中の写真の印を新しい id に置き換える
      let bad = 0;
      for (const n of add) {
        const map = new Map();
        const order = [];
        for (const p of n.photos) {
          try {
            if (!p || typeof p.data !== 'string') throw new Error();
            const id = await putPhoto({ blob: await dataUrlToBlob(p.data), w: p.w, h: p.h, name: String(p.name ?? 'photo') });
            if (p.id) map.set(String(p.id), id);
            order.push(id);
          } catch {
            bad++;
          }
        }
        // 本文に印が無い写真（古い形式の書き出し）は、末尾に並べる
        const body = remapPhotos(n.body, map);
        const fixed = normalizeMemo({ ...n, body, photos: order });
        n.body = fixed.body;
        n.photos = fixed.photos;
      }
      if (bad) toast(`読み込めない写真が ${bad} 枚ありました`);
      save([...cur, ...add]);
      render();
      toast(`${add.length} 件を読み込みました${clean.length > add.length ? `（${clean.length - add.length} 件は登録済み）` : ''}`);
    } catch (err) {
      toast('読み込めませんでした: ' + err.message);
    }
  });

  // どのメモからも使われていない写真を片付ける（編集を途中で閉じたときの残りなど）
  setTimeout(() => sweepPhotos(load().flatMap(photosOf)).catch(() => {}), 3000);

  return render;
}
