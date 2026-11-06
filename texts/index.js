// テキストの一覧（ここに並べた順に、テキストのページに表示されます）
//
// ■ テキストを足すには
//   1. このフォルダ（texts/）に Markdown のファイルを置く（例：texts/release-steps.md）
//   2. 下の TEXTS に 1 行足す
//      id       … 半角英数字とハイフン。URL（#texts/<id>）に使う。他と重ならないように
//      file     … texts/ から見たファイル名
//      title    … 一覧と見出しに出る題名
//      category … 分類（一覧の絞り込みに使う。好きな名前でよい）
//      desc     … 一覧に出る短い説明（省略可）
//      updated  … 更新日（新しいものほどホームの上に並ぶ。省略可）
//      icon     … アイコン名（js/data/icons.js。省略すると書類のアイコン）
//   書き方は「Markdown 早見表」（texts/markdown.md）を見てください。

export const TEXTS = [
  { id: 'guide', file: 'guide.md', title: 'このポータルの使い方', category: 'はじめに', desc: 'できること・データの保存場所・オフラインでの使い方', updated: '2026-11-06', icon: 'home' },
  { id: 'howto-add', file: 'howto-add.md', title: 'ツール・テキストの追加方法', category: 'はじめに', desc: '自分で作ったツールや資料をこのポータルに置く手順', updated: '2026-11-06', icon: 'wrench' },
  { id: 'markdown', file: 'markdown.md', title: 'Markdown 早見表', category: 'はじめに', desc: 'テキストを書くときの記法の一覧', updated: '2026-11-06', icon: 'text' },
];
