# My_Work_Station

仕事で使うツールとテキスト（手順書・資料）を置いておく作業台ポータルです。[My_CTF_portal](https://github.com/junia2009/My_CTF_portal) と同じ仕組みで、HTML + JavaScript だけで動くので、GitHub Pages でそのまま公開できます。
入力した内容はすべてブラウザ内で処理され、外部には送信されません。

## 機能

ホーム画面の中央の検索バーに言葉を入れると、ツールの名前と**テキストの本文**を横断して探します（Enter でいちばん上の候補を開きます）。

| 分類 | ツール | 内容 |
| --- | --- | --- |
| 資料 | テキスト | `texts/` に置いた Markdown の資料を目次つきで読む。本文まで検索、コードのコピー、ダウンロード |
| 資料 | 学習テキスト | ネットワーク・暗号・Web・フォレンジック・サーバーの守り・インフラ運用・プロキシ構築など 21 冊。図・確認問題つき、読んだ章に印が付く（CTF Portal から移行） |
| 資料 | コマンド辞典 | SQL・Python・Linux・Git・Docker の書式・オプション・例を、コマンドごと / やりたいことで引ける。Git と Docker の全体マップつき（CTF Portal から移行） |
| ツール | 差分比較 | 文章の行・文字単位、CSV / Excel（xlsx / xls）の**セル単位**、バイナリのバイト単位で比べる。非表示のシート・行・列も知らせる |
| ツール | 正規表現テスト | マッチ部分の色付け、グループの一覧、置換結果。メールアドレス・電話番号・日付などのよく使うパターンつき |
| 記録 | メモ | 作業メモや定型文をブラウザ内に保存。タグで絞り込み・検索・JSON の書き出し / 読み込み |

CTF Portal と共通の機能：

- **お気に入り**：各ツールの見出しの上の「☆ お気に入りに追加」で登録（PC はサイドメニュー、スマホは ★ から開く）
- **使い方パネルと「▶ 例を試す」**：各ツールの動きをすぐに確かめられる
- **テーマ**：右上の ☾ / ☀ でダーク / ライト、CYAN / CRIMSON / EMERALD でアクセントカラー
- **案内役 PALLAS**：画面を飛び回る 3D ドローン。ページ案内・ツアー・ヒント・出来事への反応（セリフは `js/data/pallas.js` と各ツールのファイルの `pallas`）
- **PWA**：インストールでき、一度開けばオフラインでも全ツール・全テキストが使える
- **キーボード操作・スマホ表示**

## ツール・テキストの追加

詳しくはポータル内のテキスト「**ツール・テキストの追加方法**」（`texts/howto-add.md`）を見てください。

### テキスト

1. `texts/` に Markdown のファイルを置く
2. `texts/index.js` の `TEXTS` に 1 行足す

### ツール

1. `js/tools/_template.js` をコピーして `js/tools/<名前>.js` を作る（1 ファイル = 1 ツール。画面・使い方・例・PALLAS のセリフ・処理を全部このファイルに書く）
2. `js/tools/index.js` の `import` と `MODULES` に 1 行ずつ足す

メニュー・ホームのタイル・お気に入り・検索・MODULE 番号は、一覧から自動で作られます。

## GitHub Pages での公開

GitHub Actions（`.github/workflows/pages.yml`）で自動公開します。

1. このリポジトリの **Settings → Pages** を開き、**Build and deployment** の Source を「**GitHub Actions**」にする（最初の1回だけ）
2. `main` ブランチに push すると、テスト（処理のテストと画面のテスト）→ 公開が自動で実行されます
   - プルリクエストでも同じテストが走ります（`.github/workflows/test.yml`、公開はしない）
3. 公開先: `https://<ユーザー名>.github.io/My_Work_Station/`

テストが失敗した場合は公開されません。公開されるのは `index.html` / `manifest.webmanifest` / `sw.js` / `css` / `js` / `icons` / `vendor`（three.js）/ `models` / `texts` だけです。

> GitHub Pages は公開サイトです。社外秘の情報・パスワード・個人情報をテキストやツールに書かないでください。

## ローカルで動かす

ES Modules を使っているため、`index.html` を直接開くのではなく簡易サーバー経由で開いてください。

```sh
python3 -m http.server 8000
# http://localhost:8000 を開く
```

## テスト

```sh
node tests/run.mjs   # 処理部分のテスト（Markdown・検索・差分・Excel の読み込みなど）

npm install --no-save --no-package-lock playwright@1.63.0
npx playwright install chromium
node tests/e2e.mjs   # 画面のテスト（ページ移動・検索・テキスト・学習テキスト・コマンド辞典・各ツールの例・メモ・お気に入り・PALLAS・スマホ表示）
```

## 構成

```
index.html            画面の枠（ホームとお気に入りだけ。ツールのページは js/tools/ から自動で作る）
manifest.webmanifest / sw.js / icons/   PWA（インストール・オフライン対応）
scripts/build-sw.mjs  デプロイ時に Service Worker へキャッシュ対象を埋め込む
css/style.css         スタイル（ダーク / ライト × 3色。CTF Portal と同じデザイン）
js/app.js             起動とページ切り替え
js/tools/             ツール（1 ファイル = 1 ツール）と、その一覧 index.js・ひな形 _template.js
js/ui/                画面の共通の動き（ホーム・メニュー・お気に入り・PALLAS・Markdown の表示・学習テキストの表示と図など）
js/lib/               画面に依存しない処理（Markdown・検索・差分・表計算ファイルの読み込み）
js/data/              アイコン・PALLAS のセリフ・バージョン・学習テキストとコマンド辞典の中身
texts/                テキスト（Markdown）と、その一覧 index.js
models/ vendor/three/ PALLAS の 3D モデルと three.js（MIT ライセンス）
tests/                テスト
```

バージョンを変えるときは `js/data/version.js` を書き換えてください。
