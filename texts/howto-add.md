# ツール・テキストの追加方法

## 全体の仕組み

このポータルは HTML と JavaScript だけで動く静的サイトです。`main` ブランチに push すると、GitHub Actions がテストを実行し、通れば GitHub Pages に公開されます。

```text 置き場所
texts/            テキスト（Markdown）と、その一覧 texts/index.js
js/tools/         ツール（1 ファイル = 1 ツール）と、その一覧 js/tools/index.js
js/tools/_template.js  ツールのひな形
js/lib/           画面に依存しない処理（テストしやすいように分けておく）
js/data/icons.js  アイコン
```

> [!NOTE]
> メニュー・ホームのタイル・お気に入り・検索・MODULE 番号は、一覧（`index.js`）から自動で作られます。index.html を書き換える必要はありません。

## テキストを追加する

1. `texts/` に Markdown のファイルを置く（例：`texts/release-steps.md`）
2. `texts/index.js` の `TEXTS` に 1 行足す

```js texts/index.js
export const TEXTS = [
  // …今あるもの…
  { id: 'release-steps', file: 'release-steps.md', title: 'リリース手順', category: '手順書', desc: '本番に出すまでの確認項目', updated: '2026-11-10' },
];
```

- `##` の見出しごとに章（カード）に分かれ、左に目次が出ます
- 1 行目の `# 題名` は、一覧の題名と同じなので本文には出ません
- 画像は `texts/` の中に置き、`![説明](images/screen.png)` のように書きます
- 別のテキストへのリンクは `[リリース手順](release-steps.md)` と書けば、ポータルの中で開きます

書き方は [Markdown 早見表](markdown.md) を見てください。

## ツールを追加する

1. `js/tools/_template.js` をコピーして、`js/tools/<名前>.js` を作る
2. `meta`（名前・グループ・アイコン）、`html`（画面）、`init`（動き）を書く
3. `js/tools/index.js` に 2 か所、1 行ずつ足す

```js js/tools/index.js
import * as count from './count.js';   // ← 足す

export const MODULES = [texts, learn, dict, diff, regex, memo, count];   // ← 並べたい位置に足す
```

ひな形には「文字数カウント」が例として書いてあります。そのまま登録すると動くので、まずは試してみてください。

### ツールのファイルに書くもの

| 名前 | 必須 | 内容 |
| --- | :---: | --- |
| `meta` | ○ | id・グループ・名前・英字ラベル・説明・アイコン・検索用の言葉 |
| `html` | ○ | 画面の HTML。部品の id には、他と重ならない印を頭に付ける |
| `init` | ○ | 動き。最初に 1 回呼ばれる。関数を返すと、ページを開くたびにそれが呼ばれる |
| `help` |  | 「使い方・こんなときに使う」パネルの中身 |
| `sample` |  | 「▶ 例を試す」で渡すデータ（`registerReceiver` で受け取る） |
| `pallas` |  | PALLAS がそのページで話すこと |

> [!TIP]
> 計算や変換などの処理は `js/lib/` に分けて書き、`tests/run.mjs` にテストを足しておくと、壊れたときにすぐ気付けます。

### よく使う部品

`js/ui/common.js` に、画面を作るための小さな関数がまとめてあります。

| 関数 | 使い方 |
| --- | --- |
| `$('id')` | id で部品を取る |
| `h('div', { class: 'card' }, '中身')` | 部品を作る（文字は安全に入る） |
| `copy(text)` | クリップボードにコピーして「COPIED」と表示 |
| `toast('メッセージ')` | 画面下に短く表示 |
| `store.get(KEY('名前'), 初期値)` / `store.set(…)` | ブラウザに保存・読み出し |
| `download(中身, 'ファイル名')` | ファイルとして保存させる |
| `debounce(fn)` | 入力のたびに重い処理が走らないようにする |
| `pallasSay({ text: '…' })` | PALLAS に話させる |

見た目は既存の部品のクラス（`card`・`row`・`ghost`・`small`・`hint`・`kv`・`list` など）を使うと、ほかのツールとそろいます。

## 手元で確かめる

ES Modules を使っているため、`index.html` を直接開くのではなく、簡易サーバー経由で開きます。

```bash
python3 -m http.server 8000
# http://localhost:8000 を開く
```

テストも手元で実行できます。

```bash
node tests/run.mjs   # 処理のテスト
node tests/e2e.mjs   # 画面のテスト（Playwright が必要。README 参照）
```

## 公開する

- [ ] 手元で動きを確かめた
- [ ] `node tests/run.mjs` が通った
- [ ] `js/data/version.js` のバージョンと日付を上げた
- [ ] `main` に push した（Actions のテストが通ると自動で公開されます）

> [!WARNING]
> GitHub Pages は公開サイトです。社外秘の情報や、パスワード・個人情報をテキストやツールに書かないでください。
