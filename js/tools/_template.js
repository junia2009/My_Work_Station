// ツールのひな形：このファイルをコピーして js/tools/<名前>.js を作り、js/tools/index.js に登録する
// （このファイル自体はどこからも読み込まれていません）
//
// 例として「文字数カウント」を書いてあります。不要な部分は消して大丈夫です。
import { $, h, copy, debounce, registerReceiver, fill } from '../ui/common.js';

// ---- 1. ツールの情報（メニュー・ホームのタイル・検索に使う） ----
export const meta = {
  id: 'count',                  // 半角英数字。URL（#count）と部品の id の頭に使う。他と重ならないように
  group: 'ツール',               // メニューの区切り。新しい名前にすると区切りが増える
  name: '文字数カウント',         // メニューと見出しに出る名前
  code: 'CHARACTER COUNTER',    // 見出しの上の英字ラベル（MODULE 番号の横）
  desc: '文字数・行数・原稿用紙の枚数を数える', // ホームのタイルの説明
  icon: 'text',                 // js/data/icons.js の名前、または SVG の path（'M4 4h16…'）
  keywords: ['文字数', 'カウント', '字数'], // ホームの検索で引っかけたい言葉
};

// ---- 2. 使い方パネル（見出しの下に出る。不要なら消す） ----
export const help = {
  when: '文章の文字数を数えたいとき。',
  steps: ['文章を貼る', '下に文字数・行数が出ます'],
  sample: '短い文章', // 「▶ 例を試す」の横に出る説明（sample を書いたときだけ）
};

// ---- 3. 例（「▶ 例を試す」で registerReceiver に渡される。不要なら消す） ----
export const sample = () => ({ text: 'これは例の文章です。\n2 行目です。' });

// ---- 4. 案内役 PALLAS がこのページで話すこと（不要なら消す） ----
export const pallas = '数えるのは得意だ。数えるだけならね。';

// ---- 5. 画面（HTML）。id は他のツールと重ならないよう、頭に短い印（ここでは cnt）を付ける ----
export const html = `
  <h1>文字数カウント</h1>
  <div class="card">
    <label for="cntIn">文章</label>
    <textarea id="cntIn" rows="8"></textarea>
  </div>
  <div class="card">
    <table class="kv" id="cntOut"></table>
  </div>
`;

// ---- 6. 動き。ページが作られたあとに 1 回だけ呼ばれる ----
// 関数を return すると、そのページを開くたびに呼ばれる（#count/abc で開くと 'abc' が渡る）
export function init() {
  const run = () => {
    const v = $('cntIn').value;
    const row = (k, x) => h('tr', {}, h('th', {}, k), h('td', { class: 'copyable', onclick: () => copy(String(x)) }, x));
    $('cntOut').replaceChildren(
      row('文字数', [...v].length),
      row('空白・改行を除く', [...v.replace(/\s/g, '')].length),
      row('行数', v ? v.split('\n').length : 0),
      row('原稿用紙（400 字）', Math.ceil([...v.replace(/\n/g, '')].length / 400)),
    );
  };
  $('cntIn').addEventListener('input', debounce(run));
  run();
  // 例・他のツールから値を受け取る
  registerReceiver('count', (p) => fill('cntIn', p.text));
}
