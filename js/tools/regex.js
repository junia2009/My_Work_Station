// 正規表現テスト：パターンに当たる部分を色付けし、グループと置換結果を見る
import { $, h, copy, debounce, setTable, registerReceiver, fill } from '../ui/common.js';

export const meta = {
  id: 'regex',
  group: 'ツール',
  name: '正規表現テスト',
  code: 'REGEX TESTER',
  desc: 'パターンの当たり方・グループ・置換を試す',
  icon: 'regex',
  keywords: ['正規表現', 'regex', '置換', '抽出', '検索', 'grep', 'パターン'],
};

export const help = {
  when: '長い文章やログから決まった形の文字列（メールアドレス・日付・番号など）を抜き出したいとき、置換の書き方を確かめたいとき。',
  steps: ['パターンを入れる（「よく使う」から選べます）', 'テストする文字列を貼る', 'マッチした部分とグループを確認する（置換欄に $1 などを書くと置換結果も出ます）'],
  sample: '問い合わせメールから連絡先を抜き出す',
};

export const sample = () => ({
  pattern: String.raw`([\w.+-]+)@([\w-]+\.[\w.-]+)`,
  text: '件名：見積もりのお願い\n担当：山田（yamada.taro@example.co.jp）\nCC：sales-team@example.com, support+jp@example.org\n電話：03-1234-5678\n受付日：2026/11/06',
  replace: '$1 さん（$2）',
});

export const pallas = '正規表現は呪文みたいに見えるけど、慣れれば強力な検索だ。「よく使う」から始めるといい。';

export const html = `
  <h1>正規表現テスト</h1>
  <div class="card">
    <label for="rxPat">パターン</label>
    <div class="row">
      <span class="rx-slash">/</span><input id="rxPat" class="mono grow" placeholder="例: \\d{4}/\\d{2}/\\d{2}"><span class="rx-slash">/</span>
      <label class="check"><input type="checkbox" class="rxFlag" value="g" checked> g</label>
      <label class="check"><input type="checkbox" class="rxFlag" value="i"> i</label>
      <label class="check"><input type="checkbox" class="rxFlag" value="m"> m</label>
      <label class="check"><input type="checkbox" class="rxFlag" value="s"> s</label>
    </div>
    <div class="row" id="rxPresets"></div>
    <p class="error" id="rxErr"></p>
    <label for="rxText">テストする文字列</label>
    <textarea id="rxText" rows="6"></textarea>
    <label for="rxRep">置換（任意。$1 などでグループを参照）</label>
    <input id="rxRep" class="mono">
  </div>
  <div class="card">
    <div class="meta-line" id="rxInfo"></div>
    <div class="rx-highlight" id="rxHl"></div>
    <div class="table-wrap"><table class="list" id="rxTable"></table></div>
    <div id="rxRepOut"></div>
  </div>
`;

export const PRESETS = [
  ['メールアドレス', String.raw`[\w.+-]+@[\w-]+\.[\w.-]+`],
  ['URL', String.raw`https?://[^\s"'<>]+`],
  ['電話番号', String.raw`0\d{1,4}-\d{1,4}-\d{3,4}`],
  ['郵便番号', String.raw`\d{3}-\d{4}`],
  ['日付（YYYY/MM/DD）', String.raw`\d{4}[/-]\d{1,2}[/-]\d{1,2}`],
  ['日時（ISO）', String.raw`\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}`],
  ['IPv4', String.raw`\b(?:\d{1,3}\.){3}\d{1,3}\b`],
  ['空白だけの行', String.raw`^[ \t　]*$`],
];

export function init() {
  $('rxPresets').append(h('span', { class: 'hint' }, 'よく使う：'), ...PRESETS.map(([name, pat]) =>
    h('button', { type: 'button', class: 'ghost small', onclick: () => {
      // 行頭・行末を使うパターンは、行ごとに当てる m を自動で付ける
      if (/[\^$]/.test(pat)) document.querySelector('.rxFlag[value="m"]').checked = true;
      fill('rxPat', pat);
    } }, name)));

  function run() {
    $('rxErr').textContent = '';
    const pat = $('rxPat').value, text = $('rxText').value.slice(0, 200000);
    const flags = [...document.querySelectorAll('.rxFlag:checked')].map((x) => x.value).join('');
    ['rxHl', 'rxTable', 'rxRepOut'].forEach((id) => $(id).replaceChildren());
    $('rxInfo').textContent = '';
    if (!pat) return;
    let re;
    try {
      re = new RegExp(pat, flags.includes('g') ? flags : flags + 'g');
    } catch (e) {
      $('rxErr').textContent = '正規表現が不正です：' + e.message;
      return;
    }
    const matches = [];
    for (const m of text.matchAll(re)) {
      matches.push(m);
      if (!flags.includes('g') || matches.length >= 1000) break;
    }
    $('rxInfo').textContent = `${matches.length} 件マッチ${matches.length >= 1000 ? '（1000 件まで表示）' : ''}`;
    // ハイライト表示
    const parts = [];
    let last = 0;
    for (const m of matches) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push(h('mark', {}, m[0] || '∅'));
      last = m.index + m[0].length;
    }
    parts.push(text.slice(last));
    $('rxHl').append(...parts);
    if (matches.length) {
      const groups = Math.max(0, ...matches.map((m) => m.length - 1));
      setTable($('rxTable'), ['#', '位置', 'マッチ', ...Array.from({ length: groups }, (_, i) => `$${i + 1}`)], matches.slice(0, 300).map((m, i) =>
        h('tr', {}, h('td', { class: 'num' }, i + 1), h('td', { class: 'num' }, m.index), h('td', { class: 'copyable', onclick: () => copy(m[0]) }, m[0]),
          ...Array.from({ length: groups }, (_, g) => h('td', {}, m[g + 1] ?? '')))));
      const all = matches.map((m) => m[0]).join('\n');
      $('rxRepOut').append(h('div', { class: 'row' }, h('button', { type: 'button', class: 'ghost small', onclick: () => copy(all) }, 'マッチした部分を全部コピー（1 行に 1 件）')));
    }
    if ($('rxRep').value) {
      const replaced = text.replace(new RegExp(pat, flags), $('rxRep').value);
      $('rxRepOut').append(h('h4', {}, '置換結果'), h('div', { class: 'mono-out', title: 'クリックでコピー', onclick: () => copy(replaced) }, replaced));
    }
  }
  ['rxPat', 'rxText', 'rxRep'].forEach((id) => $(id).addEventListener('input', debounce(run, 200)));
  document.querySelectorAll('.rxFlag').forEach((c) => c.addEventListener('change', run));
  registerReceiver('regex', (p) => {
    $('rxPat').value = p.pattern;
    $('rxRep').value = p.replace ?? '';
    fill('rxText', p.text);
  });
}
