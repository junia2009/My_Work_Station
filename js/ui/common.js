// 画面処理の共通ヘルパー

export const $ = (id) => document.getElementById(id);

// 保存キーの頭につける名前（CTF Portal など、同じドメインの別ポータルと混ざらないように）
export const KEY = (name) => `workstation.${name}`;

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false || c === '') continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};

let toastTimer;
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('COPIED');
  } catch {
    toast('コピーできませんでした');
  }
}

// バイト列または文字列をファイルとして保存させる
export function download(data, name, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const kvRow = (k, v, copyable = true) =>
  h('tr', {}, h('th', {}, k), h('td', copyable ? { class: 'copyable', title: 'クリックでコピー', onclick: () => copy(String(v)) } : {}, String(v)));

export const debounce = (fn, ms = 150) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

export const fmtSize = (n) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;

// タブ切り替え（.tabs のボタンと、直後の .tab-panels 内の data-panel を対応させる）
export function initTabs(root = document) {
  root.querySelectorAll('.tabs').forEach((tabs) => {
    const panels = tabs.nextElementSibling;
    const btns = [...tabs.querySelectorAll('[data-tab]')];
    const show = (id) => {
      btns.forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
      panels.querySelectorAll(':scope > [data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== id));
    };
    btns.forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
    if (btns.length) show(btns[0].dataset.tab);
  });
}

export function setTable(table, head, rows) {
  table.replaceChildren(h('tr', {}, ...head.map((x) => h('th', {}, x))), ...rows);
}

// ---------- ツール間のデータ受け渡し ----------
// 各画面が registerReceiver で「受け取り口」を登録し、sendTo でページ移動と同時にデータを渡す
const receivers = {};
export const registerReceiver = (page, fn) => (receivers[page] = fn);
export const currentPage = () => location.hash.slice(1).split('/')[0] || 'home';
export function sendTo(page, payload) {
  if (currentPage() !== page) location.hash = '#' + page;
  setTimeout(() => receivers[page]?.(payload), 0);
}

// 入力欄に値を入れて、入力イベントを発生させる（画面の自動更新を動かすため）
export function fill(id, value) {
  const el = $(id);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export const openTab = (name) => document.querySelector(`[data-tab="${name}"]`)?.click();

// 案内役 PALLAS に話しかけてもらう（mood: talk / happy / think / alert、text でそのまま話す）
export const pallasSay = (detail) => window.dispatchEvent(new CustomEvent('pallas', { detail }));

// 例（サンプル）を作ってから送る。作っている間にユーザーが別のページへ移ったら、引き戻さない
export async function sendSample(page, make) {
  const data = await make();
  if (currentPage() !== page) return false;
  sendTo(page, data);
  return true;
}
