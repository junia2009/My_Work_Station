// 写真を本文の中に置ける入力欄（contenteditable）
// 保存する形は lib/memobody.js の「文字＋{{photo:id}}」。見た目と保存の形を、ここで相互に変換する
import { segments, token } from '../lib/memobody.js';

const BLOCK = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'TABLE', 'TR']);

// editor：contenteditable の要素、photoUrl(id) → Promise<{ url, rec } | null>
export function photoEditor(editor, { photoUrl, onFiles, onChange } = {}) {
  editor.setAttribute('contenteditable', 'true');
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-multiline', 'true');
  try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch { /* 対応していないブラウザ */ }

  const img = (id) => {
    const el = document.createElement('img');
    el.dataset.photo = id;
    el.className = 'memo-ed-img';
    el.alt = '写真';
    el.draggable = false;
    photoUrl(id).then((x) => {
      if (x) el.src = x.url;
      else el.alt = '（読み込めない写真）';
    });
    return el;
  };

  // ---------- 保存の形 → 見た目 ----------
  function setBody(body) {
    editor.replaceChildren();
    for (const seg of segments(body)) {
      if (seg.photo) editor.append(img(seg.photo));
      else seg.text.split('\n').forEach((line, i) => {
        if (i) editor.append(document.createElement('br'));
        if (line) editor.append(document.createTextNode(line));
      });
    }
    // 最後が改行だと表示されないので、もう 1 つ足しておく
    if (editor.lastChild?.nodeName === 'BR') editor.append(document.createElement('br'));
    update();
  }

  // ---------- 見た目 → 保存の形 ----------
  function getBody() {
    // 写真は画面では 1 行を占めるので、保存の形でも写真の前後で改行する
    // （写真の直後に文字を打つと、ブラウザが改行の <br> を消してしまうことがあるため）
    let out = '', afterImg = false;
    const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
    const walk = (node) => {
      for (const c of node.childNodes) {
        if (c.nodeType === Node.TEXT_NODE) {
          if (!c.data) continue;
          if (afterImg) { out += '\n'; afterImg = false; }
          out += c.data.replace(/ /g, ' ');
        } else if (c.nodeName === 'BR') {
          out += '\n';
          afterImg = false;
        } else if (c.nodeName === 'IMG') {
          if (!c.dataset.photo) continue;
          nl();
          out += token(c.dataset.photo);
          afterImg = true;
        } else if (BLOCK.has(c.nodeName)) {
          afterImg = false;
          nl();
          walk(c);
          nl();
        } else walk(c);
      }
    };
    walk(editor);
    return out.replace(/\n$/, '');
  }

  const isEmpty = () => !editor.textContent.trim() && !editor.querySelector('img');
  function update() {
    editor.classList.toggle('empty', isEmpty());
  }

  // カーソルの位置を覚えておく（「写真を追加」ボタンを押すと入力欄からフォーカスが外れるため）
  let saved = null;
  const remember = () => {
    const sel = getSelection();
    if (sel.rangeCount && editor.contains(sel.anchorNode)) saved = sel.getRangeAt(0).cloneRange();
  };
  document.addEventListener('selectionchange', remember);

  function placeCaret() {
    editor.focus();
    const sel = getSelection();
    if (sel.rangeCount && editor.contains(sel.anchorNode)) return;
    sel.removeAllRanges();
    if (saved && editor.contains(saved.startContainer)) sel.addRange(saved);
    else {
      const r = document.createRange();
      r.selectNodeContents(editor);
      r.collapse(false); // 末尾
      sel.addRange(r);
    }
  }

  // カーソルの位置に写真を入れる（前後で改行して、写真を 1 行に置く）
  function insertPhoto(id) {
    placeCaret();
    const sel = getSelection();
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const frag = document.createDocumentFragment();
    const before = range.startContainer, off = range.startOffset;
    const atLineStart = (() => {
      if (before.nodeType === Node.TEXT_NODE) return off === 0 ? !before.previousSibling || before.previousSibling.nodeName === 'BR' : false;
      const prev = before.childNodes[off - 1];
      return !prev || prev.nodeName === 'BR' || BLOCK.has(prev.nodeName);
    })();
    if (!atLineStart) frag.append(document.createElement('br'));
    const el = img(id);
    frag.append(el, document.createElement('br'));
    range.insertNode(frag);
    // カーソルを写真の次の行へ
    const after = document.createRange();
    after.setStartAfter(el.nextSibling ?? el);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    saved = after.cloneRange();
    if (!el.nextSibling?.nextSibling) el.after(document.createElement('br')); // 末尾なら、次の行を作る
    update();
    onChange?.();
  }

  // ---------- 貼り付け・ドロップ：画像は写真として、それ以外は文字だけ ----------
  const imageFiles = (dt) => [...(dt?.files ?? [])].filter((f) => f.type.startsWith('image/'));
  const insertText = (text) => {
    if (!text) return;
    if (!document.execCommand('insertText', false, text)) {
      const sel = getSelection();
      const r = sel.getRangeAt(0);
      r.deleteContents();
      r.insertNode(document.createTextNode(text));
      r.collapse(false);
    }
  };
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    const files = imageFiles(e.clipboardData);
    if (files.length) onFiles?.(files);
    else insertText(e.clipboardData?.getData('text/plain') ?? '');
  });
  editor.addEventListener('drop', (e) => {
    e.preventDefault();
    // 落とした位置にカーソルを置く
    const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (r) {
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      saved = r.cloneRange();
    }
    const files = imageFiles(e.dataTransfer);
    if (files.length) onFiles?.(files);
    else insertText(e.dataTransfer?.getData('text/plain') ?? '');
  });
  editor.addEventListener('input', () => {
    update();
    onChange?.();
  });

  // 今ある写真の id（書いた順）
  const photos = () => [...editor.querySelectorAll('img[data-photo]')].map((x) => x.dataset.photo);

  return { setBody, getBody, insertPhoto, photos, clear: () => setBody(''), focus: placeCaret, isEmpty };
}
