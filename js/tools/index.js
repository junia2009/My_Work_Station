// ツールの一覧（ここに並べた順に、サイドメニュー・ホームのタイル・MODULE 番号が付きます）
//
// ■ ツールを足すには
//   1. js/tools/_template.js をコピーして js/tools/<名前>.js を作り、中身を書く
//   2. 下の import と MODULES に 1 行ずつ足す
//   これだけで、メニュー・ホーム・お気に入り・検索・使い方パネル・PALLAS の案内に出ます。
//   （詳しくは「テキスト」の「ツール・テキストの追加方法」を参照）

import * as texts from './texts.js';
import * as diff from './diff.js';
import * as regex from './regex.js';
import * as memo from './memo.js';
import { ICONS } from '../data/icons.js';

export const MODULES = [texts, diff, regex, memo];

// ---- ここから下は自動で組み立てる（ふだんは触らなくて大丈夫） ----

export const TOOLS = MODULES.map((m) => m.meta);
// グループは MODULES に最初に出てきた順
export const TOOL_GROUPS = [...new Set(TOOLS.map((t) => t.group))];
export const TOOL_LABEL = Object.fromEntries(TOOLS.map((t) => [t.id, t.name]));
export const PAGE_HELP = Object.fromEntries(MODULES.filter((m) => m.help).map((m) => [m.meta.id, m.help]));
export const SAMPLES = Object.fromEntries(MODULES.filter((m) => m.sample).map((m) => [m.meta.id, m.sample]));
export const PAGE_CODES = Object.fromEntries(TOOLS.map((t) => [t.id, t.code ?? t.id.toUpperCase()]));
export const TOOL_LINES = Object.fromEntries(MODULES.filter((m) => m.pallas).map((m) => [m.meta.id, m.pallas]));

// ツールの id でアイコンを引けるようにする（meta.icon はアイコン名か、SVG の path）
for (const t of TOOLS) ICONS[t.id] ??= ICONS[t.icon] ?? t.icon;

// id の重複は、気付きにくい不具合のもとなので起動時に知らせる
const seen = new Set();
for (const t of TOOLS) {
  if (seen.has(t.id)) console.error(`ツールの id が重複しています: ${t.id}`);
  seen.add(t.id);
}
