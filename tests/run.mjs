// 処理部分のテスト（画面に依存しない js/lib/ の関数と、ツール・テキストの登録内容）
// 実行: node tests/run.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { diffLines, diffChars, diffBytes, hexDiffRows, byteRanges, asText } from '../js/lib/diff.js';
import * as SH from '../js/lib/sheet.js';
import { parseMarkdown, parseInline, inlineText, safeUrl, blocksText, titleOf } from '../js/lib/markdown.js';
import { searchItems, normalize, snippet } from '../js/lib/search.js';
import { hexToBytes, bytesToHex, latin1Decode } from '../js/lib/bytes.js';
import { TEXTS } from '../texts/index.js';
import * as D from '../js/lib/dates.js';

let passed = 0;
const t = async (name, fn) => {
  try {
    await fn();
    passed++;
  } catch (e) {
    console.error('FAIL:', name, '\n ', e.message);
    process.exitCode = 1;
  }
};
const fixture = (n) => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));

// ---------- バイト列 ----------
await t('バイト列：Hex との相互変換', () => {
  assert.deepEqual([...hexToBytes('0x41 42:43')], [0x41, 0x42, 0x43]);
  assert.equal(bytesToHex(Uint8Array.from([1, 255]), ' '), '01 ff');
  assert.equal(latin1Decode(Uint8Array.from([0x41, 0xe9])), 'Aé');
  assert.throws(() => hexToBytes('abc'));
});

// ---------- Markdown ----------
await t('Markdown：見出し・段落・改行', () => {
  const b = parseMarkdown('# 題名\n\n## 章 A\n本文の\n続き。  \n改行後\n\nEnglish\nwords');
  assert.equal(titleOf(b), '題名');
  assert.deepEqual(b.map((x) => x.type), ['h', 'h', 'p', 'p']);
  assert.equal(b[1].id, '章-a');
  assert.deepEqual(b[2].inl, ['本文の続き。', { t: 'br' }, '改行後']);
  assert.deepEqual(b[3].inl, ['English words']);
});
await t('Markdown：インライン（コード・太字・斜体・リンク・エスケープ）', () => {
  const n = parseInline('a `x*y` **b** *c* ~~d~~ [e](https://ex.com "t") ![f](img.png) \\*g\\* snake_case_name <https://h.jp>');
  assert.deepEqual(n.filter((x) => typeof x !== 'string').map((x) => x.t), ['code', 'b', 'i', 's', 'a', 'img', 'a']);
  assert.equal(n.find((x) => x.t === 'a').title, 't');
  assert.equal(inlineText(n).includes('*g*'), true);
  assert.equal(inlineText(n).includes('snake_case_name'), true);
  assert.deepEqual(parseInline('``a `b` c``'), [{ t: 'code', v: 'a `b` c' }]);
});
await t('Markdown：リスト（入れ子・番号・チェック）', () => {
  const [ul, ol] = parseMarkdown('- a\n  - a1\n  - a2\n- [x] b\n- [ ] c\n\n3. x\n4. y');
  assert.equal(ul.type, 'ul');
  assert.equal(ul.items.length, 3);
  assert.equal(ul.items[0].blocks[1].type, 'ul');
  assert.equal(ul.items[0].blocks[1].items.length, 2);
  assert.deepEqual(ul.items.map((i) => i.checked), [null, true, false]);
  assert.equal(ol.type, 'ol');
  assert.equal(ol.start, 3);
});
await t('Markdown：コード・表・囲み・引用・区切り線', () => {
  const b = parseMarkdown('```bash 手順\necho "# not heading"\n```\n\n| a | b |\n| :-: | --: |\n| 1 | x\\|y |\n\n> [!WARNING] 題\n> 本文\n\n> 引用\n\n---');
  assert.deepEqual(b.map((x) => x.type), ['code', 'table', 'callout', 'quote', 'hr']);
  assert.deepEqual([b[0].lang, b[0].title, b[0].code], ['bash', '手順', 'echo "# not heading"']);
  assert.deepEqual(b[1].align, ['center', 'right']);
  assert.equal(inlineText(b[1].rows[0][1]), 'x|y');
  assert.equal(b[2].kind, 'warn');
  assert.equal(inlineText(b[2].title), '題');
  assert.match(blocksText(b), /本文/);
});
await t('Markdown：危険なリンクは無効にする', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl(' JaVaScRiPt:x'), null);
  assert.equal(safeUrl('data:text/html,x'), null);
  assert.equal(safeUrl('https://ex.com'), 'https://ex.com');
  assert.equal(safeUrl('images/a.png'), 'images/a.png');
  assert.equal(safeUrl('#x'), '#x');
});
await t('Markdown：変な入力でも止まらない', () => {
  for (const s of ['', '#', '-', '>', '|', '```', '* * *', '1.', '- [ ]', '[a](', '**', '`', '> [!NOTE]', '|a|\n|-|', '  - x\n- y\n    - z']) parseMarkdown(s);
});

// ---------- 検索 ----------
await t('検索：表記ゆれをそろえて、重みで並べる', () => {
  assert.equal(normalize('ＥＸＣＥＬ　エクセル'), 'excel えくせる');
  const items = [
    { id: 'a', title: '差分比較', keywords: ['excel'], desc: '違いを見る' },
    { id: 'b', title: 'Excel 早見表', desc: '' },
    { id: 'c', title: '手順書', body: 'Excel の再計算は F9 です' },
    { id: 'd', title: 'メモ' },
  ];
  assert.deepEqual(searchItems('エクセル', [{ id: 'k', title: 'えくせる' }]).map((x) => x.item.id), ['k']);
  assert.deepEqual(searchItems('excel', items).map((x) => x.item.id), ['b', 'a', 'c']);
  assert.deepEqual(searchItems('excel f9', items).map((x) => x.item.id), ['c']);
  assert.match(searchItems('F9', items)[0].snippet, /F9/);
  assert.deepEqual(searchItems('  ', items), []);
  assert.equal(snippet('abc', 'z'), '');
});

// ---------- 日付 ----------
const dd = (s) => D.parseDate(s);
await t('日付：祝日（振替休日・国民の休日・特例の年）', () => {
  const list = (y) => [...D.holidays(y)].map(([k, v]) => `${k.slice(5)}${v}`);
  assert.deepEqual(list(2026), ['01-01元日', '01-12成人の日', '02-11建国記念の日', '02-23天皇誕生日', '03-20春分の日', '04-29昭和の日', '05-03憲法記念日', '05-04みどりの日', '05-05こどもの日', '05-06振替休日', '07-20海の日', '08-11山の日', '09-21敬老の日', '09-22国民の休日', '09-23秋分の日', '10-12スポーツの日', '11-03文化の日', '11-23勤労感謝の日']);
  assert.equal(D.holidays(2019).get('2019-05-01'), '天皇の即位の日');
  assert.equal(D.holidays(2019).get('2019-04-30'), '国民の休日');
  assert.equal(D.holidays(2019).get('2019-10-22'), '即位礼正殿の儀');
  assert.equal(D.holidays(2020).get('2020-07-24'), 'スポーツの日');
  assert.equal(D.holidays(2021).get('2021-08-09'), '振替休日');
  assert.equal(D.holidays(2027).get('2027-03-22'), '振替休日');
  assert.equal(D.holidays(2018).get('2018-12-24'), '振替休日');
  assert.equal(D.holidays(2019).has('2019-12-23'), false); // 2019 年は天皇誕生日がない
  assert.equal(D.holidays(2026).size, 18);
});
await t('日付：営業日（数える・足す・休みの設定）', () => {
  const r = D.DEFAULT_RULE;
  assert.equal(D.countBusinessDays(dd('2026-11-01'), dd('2026-11-30'), r), 19);
  assert.equal(D.fmt(D.addBusinessDays(dd('2026-04-28'), 3, r)), '2026-05-07');
  assert.equal(D.fmt(D.addBusinessDays(dd('2026-05-07'), -3, r)), '2026-04-28');
  assert.equal(D.fmt(D.addBusinessDays(dd('2026-05-03'), 0, r)), '2026-05-07');
  const ny = { ...r, newYear: true, extra: ['2027-01-04'] };
  assert.equal(D.fmt(D.addBusinessDays(dd('2026-12-28'), 1, ny)), '2027-01-05');
  assert.equal(D.offReason(dd('2027-01-02'), ny), '年末年始');
  assert.equal(D.offReason(dd('2027-01-04'), ny), '会社の休み');
  assert.equal(D.offReason(dd('2026-11-03'), r), '祝日：文化の日');
  assert.equal(D.offReason(dd('2026-11-07'), r), '土曜');
  assert.equal(D.offReason(dd('2026-11-06'), r), null);
  assert.equal(D.countBusinessDays(dd('2026-11-07'), dd('2026-11-08'), { weekend: [], holiday: false }), 2);
  assert.throws(() => D.addBusinessDays(dd('2026-01-01'), 1, { weekend: [0, 1, 2, 3, 4, 5, 6] }));
});
await t('日付：読み取り・月の足し算・期間', () => {
  assert.equal(D.fmt(dd('2026/1/5')), '2026-01-05');
  assert.equal(D.fmt(dd('2026年1月5日')), '2026-01-05');
  assert.equal(dd('2026-02-30'), null);
  assert.equal(D.fmt(D.addMonths(dd('2024-01-31'), 1)), '2024-02-29');
  assert.equal(D.fmt(D.addMonths(dd('2025-01-31'), 1)), '2025-02-28');
  assert.equal(D.fmt(D.addMonths(dd('2026-03-31'), -1)), '2026-02-28');
  assert.equal(D.fmt(D.addYears(dd('2024-02-29'), 1)), '2025-02-28');
  const x = D.diffYMD(dd('2024-01-31'), dd('2026-03-01'));
  assert.deepEqual([x.years, x.months, x.days, x.totalMonths], [2, 1, 1, 25]);
  assert.equal(D.age(dd('1990-11-07'), dd('2026-11-06')), 35);
  assert.equal(D.age(dd('1990-11-06'), dd('2026-11-06')), 36);
  // 2/29 生まれは、うるう年でない年は 2/28 に 1 つ増える（月末にそろえる）
  assert.equal(D.age(dd('2000-02-29'), dd('2026-02-27')), 25);
  assert.equal(D.age(dd('2000-02-29'), dd('2026-02-28')), 26);
  assert.equal(D.daysBetween(dd('2026-03-28'), dd('2026-03-30')), 2); // 夏時間の時期でもずれない
});
await t('日付：和暦', () => {
  assert.equal(D.toWareki(dd('2019-04-30')).text, '平成31年4月30日');
  assert.equal(D.toWareki(dd('2019-05-01')).text, '令和元年5月1日');
  assert.equal(D.toWareki(dd('1989-01-07')).text, '昭和64年1月7日');
  assert.equal(D.toWareki(dd('1989-01-08')).text, '平成元年1月8日');
  assert.equal(D.toWareki(dd('1926-12-25')).text, '昭和元年12月25日');
  assert.equal(D.toWareki(dd('1872-12-31')), null);
  assert.equal(D.fmt(D.fromWareki('令和', 8, 11, 6).t), '2026-11-06');
  assert.equal(D.fmt(D.fromWareki('H', 31, 4, 30).t), '2019-04-30');
  assert.match(D.fromWareki('平成', 31, 5, 1).error, /令和元年5月1日/);
  assert.deepEqual(D.parseWareki('R8.11.6'), { era: 'R', year: 8, month: 11, day: 6 });
  assert.deepEqual(D.parseWareki('平成元年'), { era: '平成', year: 1, month: null, day: null });
  assert.deepEqual(D.parseWareki('令和８年１１月６日'), { era: '令和', year: 8, month: 11, day: 6 });
  assert.deepEqual(D.warekiOfYear(1989), ['昭和64年', '平成元年']);
  assert.deepEqual(D.warekiOfYear(2026), ['令和8年']);
  assert.deepEqual(D.eto(2026), { kanshi: '丙午', animal: 'うま' });
  assert.deepEqual(D.eto(1984), { kanshi: '甲子', animal: 'ねずみ' });
});
await t('日付：タイムゾーンと UNIX 時間', () => {
  const ms = D.fromZoned({ y: 2026, mo: 11, d: 6, h: 9, mi: 0 }, 'Asia/Tokyo');
  assert.equal(new Date(ms).toISOString(), '2026-11-06T00:00:00.000Z');
  const ny = D.zoned(ms, 'America/New_York');
  assert.deepEqual([ny.d, ny.h, ny.offset], [5, 19, -300]);
  // 夏時間：存在しない 2:30 は 3:30（EDT）になる
  assert.equal(new Date(D.fromZoned({ y: 2026, mo: 3, d: 8, h: 2, mi: 30 }, 'America/New_York')).toISOString(), '2026-03-08T07:30:00.000Z');
  assert.equal(D.zoned(Date.UTC(2026, 6, 1), 'Europe/London').offset, 60);
  assert.equal(D.offsetText(330), 'UTC+05:30');
  assert.equal(D.offsetText(-300), 'UTC−05:00');
  assert.equal(D.fromUnix('1700000000'), 1700000000000);
  assert.equal(D.fromUnix('1700000000123'), 1700000000123);
  assert.equal(D.fromUnix('abc'), null);
});

// ---------- 登録内容 ----------
await t('テキスト：一覧のファイルがそろっていて、id が重ならない', () => {
  const ids = new Set();
  for (const x of TEXTS) {
    assert.ok(/^[\w-]+$/.test(x.id), `id が不正: ${x.id}`);
    assert.ok(!ids.has(x.id), `id が重複: ${x.id}`);
    ids.add(x.id);
    assert.ok(x.title, `${x.id} の title がありません`);
    assert.ok(existsSync(new URL(`../texts/${x.file}`, import.meta.url)), `texts/${x.file} がありません`);
    parseMarkdown(readFileSync(new URL(`../texts/${x.file}`, import.meta.url), 'utf8'));
  }
});

// ---------- PWA ----------
await t('PWA：アプリの id が CTF Portal（同じドメイン）と重ならない', () => {
  const m = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  // id はドメインの直下から読まれるので、"./" だと同じドメインの別アプリと同じ id になってしまう
  const id = new URL(m.id, new URL(m.start_url, 'https://junia2009.github.io/My_Work_Station/').origin).href;
  assert.equal(id, 'https://junia2009.github.io/My_Work_Station/');
});

// ---------- 差分 ----------
await t('差分', () => {
  const d = diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne');
  assert.deepEqual(d.map((x) => x.type + ':' + x.text), ['eq:a', 'del:b', 'add:B', 'eq:c', 'eq:d', 'add:e']);
  const c = diffChars('kitten', 'sitting');
  assert.equal(c.filter((x) => x.type !== 'add').map((x) => x.text).join(''), 'kitten');
  assert.equal(c.filter((x) => x.type !== 'del').map((x) => x.text).join(''), 'sitting');
  assert.deepEqual(diffBytes(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 9, 3])).positions, [1]);
  const A = new Uint8Array(100).map((_, i) => i), B = A.slice();
  B[40] = 0xff;
  B[90] = 0xee;
  const hd = hexDiffRows(A, B);
  assert.equal(hd.diffCount, 2);
  assert.equal(hd.first, 40);
  assert.deepEqual(hd.rows.map((r) => (r.gap ? 'gap' : r.off)), [16, 32, 48, 64, 80, 96]);
  assert.ok(hd.rows.find((r) => r.off === 32).diff && !hd.rows.find((r) => r.off === 16).diff);
  const ins = Uint8Array.from([...A.slice(0, 10), 0x41, 0x42, ...A.slice(10, 50), ...A.slice(53)]);
  assert.deepEqual(byteRanges(A, ins).map((r) => [r.type, r.offA, r.offB, [...r.bytes]]), [['add', 10, 10, [0x41, 0x42]], ['del', 50, 52, [50, 51, 52]]]);
  const rep = Uint8Array.from([...A.slice(0, 20), 0x46, 0x4c, ...A.slice(22)]);
  assert.deepEqual(byteRanges(A, rep).map((r) => [r.type, r.offA, [...r.old], [...r.bytes]]), [['rep', 20, [20, 21], [0x46, 0x4c]]]);
  assert.equal(asText(new TextEncoder().encode('日本語')), '日本語');
  assert.equal(asText(Uint8Array.from([0x41, 0, 0x42])), null);
});

// ---------- 表計算ファイルの比較 ----------
const book = (n) => SH.readBook(n, fixture(n));
const changesOf = (r) => r.pairs[0].changes.map((c) => `${c.ref}:${c.kind}:${c.a}>${c.b}`);
await t('表: xlsx を読む（共有文字列・数式・日付・非表示・コメント）', async () => {
  const b = await book('book_b_lo.xlsx');
  const s = b.sheets[0];
  assert.deepEqual(b.sheets.map((x) => `${x.name}:${x.state}`), ['売上:visible', 'memo:visible', 'secret:hidden']);
  assert.equal(s.cells.get('A4').v, '名古屋駅前');
  assert.equal(s.cells.get('B1').v, '4月'); // 書式つき（リッチテキスト）の文字列
  assert.equal(s.cells.get('D2').v, '320');
  assert.equal(s.cells.get('D2').f, '=SUM(B2:C2)');
  assert.equal(s.cells.get('F1').v, '2026/11/02 09:30:00');
  assert.ok(s.hiddenRows.has(2));
  assert.equal(s.comments.get('B3'), 'ここを見て');
});
await t('表: xls（BIFF8）を読む', async () => {
  const b = await book('book_b.xls');
  const s = b.sheets[0];
  assert.equal(b.format, 'xls');
  assert.deepEqual(b.sheets.map((x) => x.state), ['visible', 'visible', 'hidden']);
  assert.equal(s.cells.get('A4').v, '名古屋駅前');
  assert.equal(s.cells.get('B2').v, '120');
  assert.equal(s.cells.get('D2').v, '320');
  assert.equal(s.cells.get('F1').v, '2026/11/02 09:30:00');
  assert.equal(s.cells.get('E5').v, 'flag{d1ff_th3_sh33t}');
  assert.ok(s.hiddenRows.has(2));
  // 共有文字列が CONTINUE レコードにまたがる大きなファイル
  const big = (await book('big.xls')).sheets[0];
  assert.equal(big.cells.get('A1000').v, '項目0999_データ_abc');
  assert.equal(big.cells.get('A1001').v, 'item-1000-ascii-text');
  assert.equal(big.cells.get('A1500').v, '項目1499_データ_abc');
  assert.equal(big.cells.get('B1500').v, 'flag{c0nt1nu3_r3c0rd}');
  assert.equal(big.cells.size, 1501);
});
await t('表: CSV（UTF-8 / Shift_JIS）と、形式をまたいだ比較', async () => {
  const sj = await book('book_b_sjis.csv');
  assert.match(sj.info, /Shift_JIS/);
  assert.equal(sj.sheets[0].cells.get('A4').v, '名古屋駅前');
  assert.deepEqual(SH.parseCsv('a,"b,c","d""e"\n1,2,3').rows, [['a', 'b,c', 'd"e'], ['1', '2', '3']]);
  // xlsx 同士：値・文字・削除・追加・数式の変更、B だけにある非表示シート
  const r = SH.compareBooks(await book('book_a.xlsx'), await book('book_b.xlsx'));
  assert.deepEqual(changesOf(r), ['B2:mod:100>120', 'F2:del:0.1>', 'D3:formula:>', 'A4:mod:名古屋>名古屋駅前', 'E5:add:>flag{d1ff_th3_sh33t}']);
  assert.deepEqual(r.onlyB.map((x) => x.name), ['secret']);
  assert.deepEqual(r.pairs[0].hiddenRows.added, [2]);
  // xls と xlsx、CSV と xls（日付の表記ゆれは同じとみなす）
  assert.deepEqual(changesOf(SH.compareBooks(await book('book_a.xls'), await book('book_b_lo.xlsx'))), ['B2:mod:100>120', 'D2:mod:300>320', 'F2:del:0.1>', 'A4:mod:名古屋>名古屋駅前', 'E5:add:>flag{d1ff_th3_sh33t}']);
  assert.deepEqual(changesOf(SH.compareBooks(await book('book_a.csv'), await book('book_a.xls'))), []);
  assert.ok(SH.hiddenStuff(await book('book_b.xls')).some((x) => x.includes('secret')));
});

console.log(`${passed} 件成功${process.exitCode ? '（失敗あり）' : ''}`);
