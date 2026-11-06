// メモ：ブラウザ内に保存する作業メモ（タグで分類・検索・JSON で書き出し / 読み込み）
import { $, h, store, toast, copy, debounce, download, registerReceiver, pallasSay, KEY } from '../ui/common.js';

export const meta = {
  id: 'memo',
  group: '記録',
  name: 'メモ',
  code: 'WORK LOG',
  desc: '作業メモ・定型文をタグで整理して保存',
  icon: 'memo',
  keywords: ['メモ', 'ノート', '記録', '定型文', 'テンプレート', '日報', 'todo'],
};

export const help = {
  when: '作業の記録、よく使う定型文、あとで調べることなどを置いておきたいとき。',
  steps: ['タイトル・タグ・本文を入れて保存', '一覧はタイトルだけ。タイトルを押すと本文が開きます（「すべて開く」「すべて閉じる」もあります）', '一覧の「本文をコピー」で、定型文としてそのまま使えます', '別の端末に移すときは「書き出し」した JSON を「読み込み」します'],
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
      <label for="memoBody">本文</label>
      <textarea id="memoBody" rows="6"></textarea>
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
`;

const MEMO_KEY = KEY('memos');
const load = () => store.get(MEMO_KEY, []);
const save = (list) => {
  if (!store.set(MEMO_KEY, list)) toast('保存できませんでした（ブラウザの保存領域が使えません）');
};
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export function init() {
  const form = $('memoForm');
  const reset = () => {
    form.reset();
    $('memoId').value = '';
    $('memoFormTitle').textContent = 'メモを追加';
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const list = load();
    const item = {
      id: $('memoId').value || newId(),
      title: $('memoTitle').value.trim(),
      tag: $('memoTag').value.trim(),
      body: $('memoBody').value,
      updated: new Date().toISOString(),
    };
    const i = list.findIndex((n) => n.id === item.id);
    if (i >= 0) list.splice(i, 1);
    list.unshift(item); // 更新したものを先頭へ
    save(list);
    reset();
    render();
    toast('保存しました');
    pallasSay({ kind: 'memoSaved', n: list.length, title: item.title, anchor: '#memoList' });
  });
  $('memoCancel').addEventListener('click', reset);
  // 他のツールから「メモに残す」で送られてきたとき
  registerReceiver('memo', (p) => {
    reset();
    $('memoTitle').value = p.title ?? '';
    $('memoTag').value = p.tag ?? '';
    $('memoBody').value = p.body ?? '';
    $('memoTitle').focus();
  });

  function edit(n) {
    $('memoId').value = n.id;
    $('memoTitle').value = n.title;
    $('memoTag').value = n.tag ?? '';
    $('memoBody').value = n.body ?? '';
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
    const list = all.filter((n) => (!tag || n.tag === tag) && (!q || `${n.title}\n${n.tag}\n${n.body}`.toLowerCase().includes(q)));
    shown = list;
    // キーワードが変わったら、本文にだけ当たったメモを開く（どこに当たったか分かるように）
    if (q !== lastQ) {
      lastQ = q;
      if (q) for (const n of list) if (n.body?.toLowerCase().includes(q) && !`${n.title}\n${n.tag}`.toLowerCase().includes(q)) opened.add(n.id);
    }
    $('memoList').replaceChildren(
      ...(list.length ? list.map((n) => {
        const open = !!n.body && opened.has(n.id);
        const bodyId = `memo-body-${n.id}`;
        const toggle = () => {
          if (!n.body) return;
          if (opened.has(n.id)) opened.delete(n.id);
          else opened.add(n.id);
          render();
          document.querySelector(`[aria-controls="${bodyId}"]`)?.focus();
        };
        return h('div', { class: `note memo${open ? ' open' : ''}` },
          h('div', { class: 'head' },
            h('button', {
              type: 'button', class: 'memo-toggle', 'aria-expanded': n.body ? String(open) : null, 'aria-controls': n.body ? bodyId : null,
              title: n.body ? (open ? '本文を閉じる' : '本文を開く') : '本文はありません', onclick: toggle,
            },
            h('span', { class: `memo-chev${n.body ? '' : ' none'}`, 'aria-hidden': 'true' }, '›'),
            n.tag ? h('span', { class: 'tag' }, n.tag) : '',
            h('strong', {}, n.title)),
            h('div', { class: 'row' },
              h('span', { class: 'meta' }, fmtDate(n.updated)),
              n.body ? h('button', { type: 'button', class: 'ghost small', onclick: () => copy(n.body) }, '本文をコピー') : '',
              h('button', { type: 'button', class: 'ghost small', onclick: () => edit(n) }, '編集'),
              h('button', {
                type: 'button', class: 'ghost small',
                onclick: () => {
                  if (!confirm(`「${n.title}」を削除しますか？`)) return;
                  opened.delete(n.id);
                  save(load().filter((x) => x.id !== n.id));
                  render();
                },
              }, '削除'),
            ),
          ),
          open ? h('pre', { id: bodyId }, n.body) : '',
        );
      }) : [h('p', { class: 'hint' }, all.length ? '条件に合うメモがありません。' : 'まだメモがありません。')]),
    );
  }

  $('memoOpenAll').addEventListener('click', () => {
    shown.forEach((n) => n.body && opened.add(n.id));
    render();
  });
  $('memoCloseAll').addEventListener('click', () => {
    opened.clear();
    render();
  });

  $('memoFilter').addEventListener('change', render);
  $('memoSearch').addEventListener('input', debounce(render));

  $('memoExport').addEventListener('click', () => {
    download(JSON.stringify(load(), null, 2), `work-memo-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
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
        .map((n) => ({ id: String(n.id ?? newId()), title: n.title, tag: String(n.tag ?? ''), body: String(n.body ?? ''), updated: String(n.updated ?? '') }));
      const cur = load();
      const ids = new Set(cur.map((n) => n.id));
      const add = clean.filter((n) => !ids.has(n.id));
      save([...cur, ...add]);
      render();
      toast(`${add.length} 件を読み込みました${clean.length > add.length ? `（${clean.length - add.length} 件は登録済み）` : ''}`);
    } catch (err) {
      toast('読み込めませんでした: ' + err.message);
    }
  });

  return render;
}
