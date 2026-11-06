// 差分比較：文章・CSV / Excel の表・バイナリファイルの違いを見る
import { diffLines, diffChars, diffBytes, hexDiffRows, byteRanges, asText } from '../lib/diff.js';
import { sheetKind, readBook, readCsv, decodeText, compareBooks, sheetLines, hiddenStuff, colName } from '../lib/sheet.js';
import { bytesToHex, hexToBytes, latin1Decode } from '../lib/bytes.js';
import { $, h, copy, kvRow, debounce, registerReceiver, fill, fmtSize, download, toast, pallasSay } from '../ui/common.js';

export const meta = {
  id: 'diff',
  group: 'ツール',
  name: '差分比較',
  code: 'DIFF COMPARATOR',
  desc: '文章・CSV / Excel・ファイルの違いを見る',
  icon: 'diff',
  keywords: ['比較', '差分', 'diff', 'excel', 'エクセル', 'csv', '表', '変更点', '版'],
};

export const help = {
  when: '2つの文章や設定ファイル、CSV / Excel の表の違いを見つけたいとき。資料の版の違い、データの更新漏れの確認などに。',
  steps: ['A と B に貼るか、「ファイルを開く」（ドロップでも可）で読み込む', '比較の単位を選ぶ（CSV / Excel は自動で「表」、バイナリは「バイト」に切り替わります）', '違う部分を確認する（表なら、非表示のシート・行・列も知らせます）'],
  sample: '一部だけ書き換えられた議事録',
};

export const sample = () => ({
  mode: 'line',
  a: '定例会議 議事録\n日時：11/5（水）10:00〜11:00\n参加者：佐藤、鈴木、高橋\n決定事項：\n- 次回リリースは 11/20\n- 検証環境は 11/12 までに用意する\n宿題：\n- 鈴木：手順書の更新',
  b: '定例会議 議事録\n日時：11/5（水）10:00〜11:30\n参加者：佐藤、鈴木、高橋、田中\n決定事項：\n- 次回リリースは 11/27\n- 検証環境は 11/12 までに用意する\n宿題：\n- 鈴木：手順書の更新\n- 田中：問い合わせ窓口の確認',
});

export const pallas = '違いを探すなら任せてくれ。間違い探しは得意なんだ。Excel ならセル単位で、隠したシートまで見つけるよ。';

export const html = `
  <h1>差分比較</h1>
  <div class="diff-inputs">
    <div class="card diff-side" id="dfACard">
      <div class="row between">
        <label for="dfA">A（元）</label>
        <span class="row">
          <label class="btn ghost small" for="dfAFile">ファイルを開く</label>
          <input type="file" id="dfAFile" hidden>
          <button type="button" class="ghost small" id="dfAClear" hidden>ファイルを外す</button>
        </span>
      </div>
      <textarea id="dfA" rows="8" class="mono" placeholder="文字列・CSV を貼る、またはファイル（CSV / Excel / バイナリ）をここへドロップ"></textarea>
      <div class="diff-file" id="dfAInfo" hidden></div>
    </div>
    <div class="card diff-side" id="dfBCard">
      <div class="row between">
        <label for="dfB">B（比較先）</label>
        <span class="row">
          <label class="btn ghost small" for="dfBFile">ファイルを開く</label>
          <input type="file" id="dfBFile" hidden>
          <button type="button" class="ghost small" id="dfBClear" hidden>ファイルを外す</button>
        </span>
      </div>
      <textarea id="dfB" rows="8" class="mono" placeholder="文字列・CSV を貼る、またはファイル（CSV / Excel / バイナリ）をここへドロップ"></textarea>
      <div class="diff-file" id="dfBInfo" hidden></div>
    </div>
  </div>
  <div class="card">
    <div class="row">
      <label for="dfMode">比較の単位</label>
      <select id="dfMode"><option value="line">行</option><option value="char">文字</option><option value="sheet">表（セル単位）</option><option value="sheetrow">表（行単位）</option><option value="hex">バイト（ファイル / Hex）</option></select>
      <span class="meta-line" id="dfInfo"></span>
    </div>
    <div class="diff-out" id="dfOut"></div>
  </div>
`;

export function init() {
  // ファイルを読み込んだ側は、そのバイト列で比べる（テキストなら入力欄にも表示する）
  const files = { A: null, B: null };
  const hexOf = (b) => [...b].map((x) => x.toString(16).padStart(2, '0'));
  const sha256 = async (b) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');

  async function loadFile(side, file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // 表計算ファイル（CSV / xlsx / xls）はセルとして読む。CSV は Shift_JIS などでも文字にして表示する
    const kind = sheetKind(file.name, bytes);
    let book = null;
    if (kind) {
      try {
        book = await readBook(file.name, bytes);
      } catch (e) {
        toast(e.message);
      }
    }
    const text = kind === 'csv' ? decodeText(bytes).text : asText(bytes);
    files[side] = { name: file.name, bytes, text, book, kind, hash: await sha256(bytes) };
    const ta = $('df' + side);
    ta.value = text ?? '';
    ta.hidden = text == null;
    $(`df${side}Clear`).hidden = false;
    const info = $(`df${side}Info`);
    info.hidden = false;
    info.replaceChildren(
      h('b', {}, file.name), h('span', {}, `${fmtSize(bytes.length)}（${bytes.length.toLocaleString()} バイト）`),
      h('span', {}, book ? `表（${book.format}・${book.info}）` : text != null ? 'テキスト' : 'バイナリ'), h('span', { class: 'hint', title: files[side].hash }, `SHA-256 ${files[side].hash.slice(0, 16)}…`),
    );
    // 表どうしならセル単位、どちらかがバイナリならバイト単位の比較に切り替える
    const other = files[side === 'A' ? 'B' : 'A'];
    if (book && (other?.book || (!other && $('df' + (side === 'A' ? 'B' : 'A')).value.trim() === ''))) $('dfMode').value = 'sheet';
    else if (Object.values(files).some((f) => f && f.text == null && !f.book)) $('dfMode').value = 'hex';
    run();
  }
  function clearFile(side) {
    files[side] = null;
    $('df' + side).hidden = false;
    $('df' + side).value = '';
    $(`df${side}Clear`).hidden = true;
    $(`df${side}Info`).hidden = true;
    run();
  }
  for (const side of ['A', 'B']) {
    $(`df${side}File`).addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) loadFile(side, f);
    });
    $(`df${side}Clear`).addEventListener('click', () => clearFile(side));
    const card = $(`df${side}Card`);
    ['dragenter', 'dragover'].forEach((ev) => card.addEventListener(ev, (e) => { e.preventDefault(); card.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => card.addEventListener(ev, (e) => { e.preventDefault(); card.classList.remove('over'); }));
    card.addEventListener('drop', (e) => e.dataTransfer.files[0] && loadFile(side, e.dataTransfer.files[0]));
    // テキストを手で直したら、ファイルの中身ではなく入力欄の文字で比べる
    $('df' + side).addEventListener('input', () => {
      if (files[side]?.text != null) files[side] = { ...files[side], bytes: new TextEncoder().encode($('df' + side).value), edited: true, book: files[side].kind === 'csv' ? null : files[side].book };
    });
  }

  // バイト列：ファイルがあればその中身、なければ入力欄を Hex として読む
  const bytesOf = (side) => (files[side] ? files[side].bytes : hexToBytes($('df' + side).value));

  const show = (b) => `${hexOf(b.subarray(0, 24)).join(' ')}${b.length > 24 ? ' …' : ''}  ${latin1Decode(b.subarray(0, 24)).replace(/[^\x20-\x7e]/g, '·')}`;

  function renderBytes(A, B) {
    const out = $('dfOut');
    const hd = hexDiffRows(A, B);
    const same = A.length === B.length && hd.diffCount === 0;
    $('dfInfo').textContent = same ? '完全に一致しています' : `違うバイト ${hd.diffCount.toLocaleString()} 個（A ${A.length.toLocaleString()} B / B ${B.length.toLocaleString()} B）`;
    const parts = [];
    const sum = [
      kvRow('サイズ', `A ${A.length.toLocaleString()} バイト / B ${B.length.toLocaleString()} バイト${A.length !== B.length ? `（差 ${(B.length - A.length).toLocaleString()}）` : ''}`, false),
      kvRow('最初に違う位置', hd.first >= 0 ? `0x${hd.first.toString(16)}（${hd.first} バイト目）` : 'なし', false),
    ];
    if (files.A && files.B) sum.push(kvRow('SHA-256', files.A.hash === files.B.hash ? '一致' : '不一致', false));
    parts.push(h('table', { class: 'kv' }, ...sum));
    if (same) {
      out.replaceChildren(...parts);
      return;
    }
    // 長さが違う＝途中に挿入・削除がある可能性。小さいファイルなら、ずれを考えた差分も出す
    if (A.length !== B.length) {
      if (A.length + B.length <= 400000) {
        const ranges = byteRanges(A, B);
        if (ranges.length && ranges.length <= 300) {
          parts.push(h('p', { class: 'diff-sub' }, `挿入・削除を考えた差分（${ranges.length} か所）`),
            h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
              h('tr', {}, h('th', {}, '種類'), h('th', {}, 'A の位置'), h('th', {}, 'B の位置'), h('th', {}, 'バイト数'), h('th', {}, '中身')),
              ...ranges.slice(0, 200).map((r) => h('tr', { class: `diff-${r.type}` },
                h('td', {}, r.type === 'add' ? '追加（B のみ）' : r.type === 'del' ? '削除（A のみ）' : '置き換え'),
                h('td', { class: 'num' }, `0x${r.offA.toString(16)}`), h('td', { class: 'num' }, `0x${r.offB.toString(16)}`), h('td', { class: 'num' }, r.old ? `${r.old.length} → ${r.bytes.length}` : r.bytes.length),
                h('td', { class: 'mono copyable', title: 'クリックで中身（Hex）をコピー', onclick: () => copy(bytesToHex(r.bytes)) }, r.old ? `${show(r.old)}  →  ${show(r.bytes)}` : show(r.bytes)),
              )))));
        }
      } else parts.push(h('p', { class: 'hint' }, '長さが違います。途中にデータが挿入・削除されていると、それ以降はすべて「違う」と表示されます（大きいファイルのため、ずれを考えた差分は省略）。'));
    }
    // 同じ位置どうしの比較（16進ダンプを上下に並べる）
    const cell = (x, y) => (x === undefined ? h('i', { class: 'hx none' }, '  ') : h('i', { class: x !== y ? 'hx d' : 'hx' }, x.toString(16).padStart(2, '0')));
    const asc = (row, other) => [...row].map((x, i) => h('i', { class: x !== other[i] ? 'd' : '' }, x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : '.'));
    const lines = hd.rows.map((r) => {
      if (r.gap) return h('div', { class: 'hx-gap' }, '⋯');
      const pad = (row, other) => Array.from({ length: 16 }, (_, i) => cell(row[i], other[i]));
      return h('div', { class: `hx-pair${r.diff ? ' changed' : ''}` },
        h('div', { class: 'hx-line a' }, h('span', { class: 'hx-off' }, r.off.toString(16).padStart(8, '0')), h('span', { class: 'hx-tag' }, 'A'), h('span', { class: 'hx-bytes' }, ...pad(r.a, r.b)), h('span', { class: 'hx-asc' }, ...asc(r.a, r.b))),
        h('div', { class: 'hx-line b' }, h('span', { class: 'hx-off' }), h('span', { class: 'hx-tag' }, 'B'), h('span', { class: 'hx-bytes' }, ...pad(r.b, r.a)), h('span', { class: 'hx-asc' }, ...asc(r.b, r.a))),
      );
    });
    parts.push(h('p', { class: 'diff-sub' }, '同じ位置どうしの比較（違うバイトを強調、前後 1 行つき）'), h('div', { class: 'hx-diff' }, ...lines),
      hd.truncated ? h('p', { class: 'hint' }, '違いが多いため、途中までを表示しています。') : '');
    // 違うバイトだけを並べる・XOR
    const d = diffBytes(A, B);
    const onlyB = Uint8Array.from(d.positions.filter((p) => p < B.length).slice(0, 4096).map((p) => B[p]));
    parts.push(h('table', { class: 'kv' },
      kvRow('B で違うバイトだけ（文字）', latin1Decode(onlyB).replace(/[^\x20-\x7e]/g, '·') || '（なし）'),
      kvRow('A XOR B（Hex、先頭 4KB）', bytesToHex(d.xor.subarray(0, 4096))),
      kvRow('A XOR B（文字、先頭 4KB）', latin1Decode(d.xor.subarray(0, 4096)).replace(/[^\x20-\x7e]/g, '·')),
    ), h('div', { class: 'row' }, h('button', { type: 'button', class: 'ghost small', onclick: () => download(d.xor, 'xor.bin') }, 'A XOR B を保存')));
    out.replaceChildren(...parts);
  }

  // ---------- 表（CSV / xlsx / xls）の比較 ----------
  const bookOf = (side) => {
    const f = files[side];
    if (f?.book) return f.book;
    const t = $('df' + side).value;
    if (f && f.text == null) return null;
    return t.trim() ? readCsv(t, f?.name ?? `${side}（貼り付け）`) : null;
  };
  const KIND = { add: '追加', del: '削除', mod: '変更', formula: '数式だけ変更' };
  const cellText = (v, f) => h('div', {}, v === '' ? h('span', { class: 'hint' }, '（空）') : v, f ? h('div', { class: 'sh-f' }, f) : '');

  function renderSheets(rowMode) {
    const out = $('dfOut');
    const A = bookOf('A'), B = bookOf('B');
    if (!A || !B) {
      out.replaceChildren(h('p', { class: 'hint' }, '表として比べるには、A と B の両方に CSV / xlsx / xls を読み込むか、CSV を貼り付けてください。'));
      $('dfInfo').textContent = '';
      return;
    }
    const res = compareBooks(A, B);
    const total = res.pairs.reduce((n, p) => n + p.changes.length, 0);
    $('dfInfo').textContent = total || res.onlyA.length || res.onlyB.length ? `変更のあるセル ${total} 個（シート ${res.pairs.length} 組を比較）` : '内容は一致しています';
    const parts = [];
    parts.push(h('table', { class: 'kv' }, kvRow('A', `${A.format}・${A.info}`, false), kvRow('B', `${B.format}・${B.info}`, false)));
    // 見落としやすい隠し場所
    const hid = [...hiddenStuff(A).map((x) => `A：${x}`), ...hiddenStuff(B).map((x) => `B：${x}`)];
    if (hid.length) parts.push(h('div', { class: 'alert' }, h('b', {}, '隠れているものがあります（見落としに注意）'), h('ul', {}, ...hid.map((x) => h('li', {}, x)))));
    const onlyList = (label, list) => list.map((sh) => h('div', { class: 'alert' },
      `${label}だけにあるシート「${sh.name}」${sh.state !== 'visible' ? '（非表示）' : ''}：${sh.cells.size} セル`,
      sh.cells.size ? h('div', { class: 'sh-only' }, ...[...sh.cells].slice(0, 40).map(([ref, c]) => h('span', {}, h('b', {}, ref), ` ${c.v}`))) : ''));
    parts.push(...onlyList('A', res.onlyA), ...onlyList('B', res.onlyB));
    for (const p of res.pairs) {
      const title = p.a.name === p.b.name ? `シート「${p.a.name}」` : `「${p.a.name}」↔「${p.b.name}」`;
      parts.push(h('p', { class: 'diff-sub' }, `${title}　${p.changes.length ? `${p.changes.length} セルが違います` : '違いはありません'}`));
      const notes = [];
      if (p.state) notes.push(`表示状態：${p.state.a} → ${p.state.b}`);
      if (p.hiddenRows.added.length) notes.push(`B で非表示になった行：${p.hiddenRows.added.map((r) => r + 1).join(', ')}`);
      if (p.hiddenRows.removed.length) notes.push(`B で再表示された行：${p.hiddenRows.removed.map((r) => r + 1).join(', ')}`);
      if (p.hiddenCols.added.length) notes.push(`B で非表示になった列：${p.hiddenCols.added.map(colName).join(', ')}`);
      if (p.hiddenCols.removed.length) notes.push(`B で再表示された列：${p.hiddenCols.removed.map(colName).join(', ')}`);
      for (const c of p.comments) notes.push(`コメント ${c.ref}：「${c.a || '（なし）'}」→「${c.b || '（なし）'}」`);
      if (notes.length) parts.push(h('ul', { class: 'sh-notes' }, ...notes.map((x) => h('li', {}, x))));
      if (rowMode) {
        const ops = diffLines(sheetLines(p.a).join('\n'), sheetLines(p.b).join('\n'));
        let ra = 0, rb = 0;
        parts.push(h('div', { class: 'sh-rows' }, ...ops.slice(0, 3000).map((o) => {
          const n = o.type === 'del' ? ++ra : o.type === 'add' ? ++rb : (++ra, ++rb);
          return h('div', { class: `dl ${o.type}` }, h('span', { class: 'dm' }, o.type === 'add' ? '+' : o.type === 'del' ? '−' : ' '), h('span', { class: 'sh-rn' }, n), (o.text || ' ').split('\t').join('  │  '));
        })));
        continue;
      }
      if (!p.changes.length) continue;
      // 変わったセルの一覧
      parts.push(h('div', { class: 'table-wrap' }, h('table', { class: 'list sh-list' },
        h('tr', {}, h('th', {}, 'セル'), h('th', {}, '変化'), h('th', {}, 'A'), h('th', {}, 'B')),
        ...p.changes.slice(0, 500).map((c) => h('tr', { class: `sh-${c.kind}` },
          h('td', { class: 'num' }, c.ref), h('td', {}, KIND[c.kind]), h('td', {}, cellText(c.a, c.fa)), h('td', {}, cellText(c.b, c.fb)))))),
      p.changes.length > 500 ? h('p', { class: 'hint' }, `ほか ${p.changes.length - 500} セル`) : '');
      // 表の形で見る：変わったセルのある行・列（と前後 1 つ）だけを並べ、間の変化の無い所は「⋯」で詰める
      // （離れた場所の変更も全部見えるように）
      const near = (vals, max) => {
        const set = new Set();
        for (const v of vals) for (let d = -1; d <= 1; d++) if (v + d >= 0 && v + d <= max) set.add(v + d);
        return [...set].sort((x, y) => x - y);
      };
      const maxR = Math.max(p.a.maxRow, p.b.maxRow, 0), maxC = Math.max(p.a.maxCol, p.b.maxCol, 0);
      const LIMIT_R = 400, LIMIT_C = 60;
      const rowsAll = near(p.changes.map((c) => c.r), maxR), colsAll = near(p.changes.map((c) => c.c), maxC);
      const rowList = rowsAll.slice(0, LIMIT_R), colList = colsAll.slice(0, LIMIT_C);
      const byRef = new Map(p.changes.map((c) => [c.ref, c]));
      // 列の見出し（間が空く所に ⋯ の列を入れる）
      const head = [h('th', {})];
      colList.forEach((c, i) => {
        if (i && c !== colList[i - 1] + 1) head.push(h('th', { class: 'sh-gap' }, '⋯'));
        head.push(h('th', { class: p.b.hiddenCols.has(c) ? 'sh-hidden' : '' }, colName(c)));
      });
      const rows = [h('tr', {}, ...head)];
      const span = head.length;
      rowList.forEach((r, i) => {
        if (i && r !== rowList[i - 1] + 1) rows.push(h('tr', { class: 'sh-gap-row' }, h('td', { colspan: span }, `⋯ ${rowList[i - 1] + 2}〜${r} 行目は変化なし ⋯`)));
        const tds = [];
        colList.forEach((c, j) => {
          if (j && c !== colList[j - 1] + 1) tds.push(h('td', { class: 'sh-gap' }, ''));
          const ref = colName(c) + (r + 1);
          const ch = byRef.get(ref);
          const v = p.b.cells.get(ref)?.v ?? '';
          if (!ch) tds.push(h('td', {}, v));
          else tds.push(h('td', { class: `sh-${ch.kind}`, title: `${ref}　A：${ch.a || '（空）'} → B：${ch.b || '（空）'}${ch.fa || ch.fb ? `\n数式：${ch.fa ?? '（なし）'} → ${ch.fb ?? '（なし）'}` : ''}` },
            ch.kind === 'del' ? h('s', {}, ch.a) : ch.kind === 'mod' ? [h('s', {}, ch.a), h('br'), ch.b] : v));
        });
        rows.push(h('tr', {}, h('th', { class: p.b.hiddenRows.has(r) ? 'sh-hidden' : '' }, r + 1), ...tds));
      });
      if (rowsAll.length > LIMIT_R || colsAll.length > LIMIT_C) rows.push(h('tr', { class: 'sh-gap-row' }, h('td', { colspan: span }, '変更が多いため、ここまでを表示しています（全部は上の一覧で確認できます）')));
      parts.push(h('p', { class: 'hint sh-legend' }, h('span', { class: 'sh-mod' }, '変更'), h('span', { class: 'sh-add' }, '追加'), h('span', { class: 'sh-del' }, '削除'), h('span', { class: 'sh-formula' }, '数式だけ変更'), '　セルにカーソルを合わせると A → B を表示（表示は B の内容）'),
        h('div', { class: 'table-wrap sh-grid-wrap' }, h('table', { class: 'sh-grid' }, ...rows)));
    }
    out.replaceChildren(...parts);
  }

  function run() {
    const a = $('dfA').value, b = $('dfB').value, mode = $('dfMode').value;
    const out = $('dfOut');
    if (!a && !b && !files.A && !files.B) {
      out.replaceChildren();
      $('dfInfo').textContent = '';
      return;
    }
    if (mode === 'sheet' || mode === 'sheetrow') {
      renderSheets(mode === 'sheetrow');
      return;
    }
    if (mode === 'hex') {
      let A, B;
      try {
        A = bytesOf('A');
        B = bytesOf('B');
      } catch (e) {
        out.replaceChildren(h('p', { class: 'error' }, `${e.message}（ファイルを開くか、16進のバイト列を入れてください）`));
        return;
      }
      renderBytes(A, B);
      return;
    }
    if (Object.values(files).some((f) => f && f.text == null)) {
      out.replaceChildren(h('p', { class: 'hint' }, Object.values(files).some((f) => f?.book) ? 'Excel ファイルは「表」単位で比べてください。' : 'バイナリファイルは「バイト」単位で比べてください。'));
      $('dfInfo').textContent = '';
      return;
    }
    const ops = mode === 'char' ? diffChars(a, b) : diffLines(a, b);
    const add = ops.filter((o) => o.type === 'add').length, del = ops.filter((o) => o.type === 'del').length;
    $('dfInfo').textContent = add + del ? `追加 ${add}・削除 ${del}（${mode === 'char' ? '文字' : '行'}）` : '違いはありません';
    react(add + del);
    if (mode === 'char') {
      out.replaceChildren(h('div', { class: 'diff-inline' }, ...ops.map((o) => (o.type === 'eq' ? o.text : h(o.type === 'add' ? 'ins' : 'del', {}, o.text)))));
    } else {
      out.replaceChildren(...ops.slice(0, 5000).map((o) => h('div', { class: `dl ${o.type}` }, h('span', { class: 'dm' }, o.type === 'add' ? '+' : o.type === 'del' ? '−' : ' '), o.text || ' ')));
    }
  }
  // 案内役 PALLAS のひとこと（同じ結果では繰り返さない）
  let lastReact = '';
  function react(n) {
    if (!$('dfA').value.trim() || !$('dfB').value.trim()) return;
    // 「完全に一致」のときだけ話す（違いがあるのは見れば分かるので、入力中に話しかけない）
    const key = n ? 'found' : 'same';
    if (key === lastReact) return;
    lastReact = key;
    if (!n) pallasSay({ kind: 'diffSame', anchor: '#dfOut', mood: 'happy' });
  }
  ['dfA', 'dfB'].forEach((id) => $(id).addEventListener('input', debounce(run, 250)));
  $('dfMode').addEventListener('change', run);
  registerReceiver('diff', (p) => {
    if (p instanceof File) return loadFile(files.A ? 'B' : 'A', p);
    clearFile('A');
    clearFile('B');
    $('dfMode').value = p.mode ?? 'line';
    $('dfA').value = p.a;
    fill('dfB', p.b);
  });
}
