// 日付の計算（祝日・営業日・期間・和暦・タイムゾーン）。画面には依存しない
//
// 日付は 'YYYY-MM-DD' の文字列で受け渡しする。中では UTC の 0 時として扱うので、
// 端末のタイムゾーンや夏時間で 1 日ずれることがない。

const DAY = 86400000;
export const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

// ---------- 基本 ----------
export function parseDate(s) {
  const m = String(s ?? '').trim().replace(/[年月/.]/g, '-').replace(/日$/, '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = Date.UTC(y, mo - 1, d);
  const x = new Date(t);
  if (x.getUTCFullYear() !== y || x.getUTCMonth() !== mo - 1 || x.getUTCDate() !== d) return null; // 2/30 など
  return t;
}
const pad = (n) => String(n).padStart(2, '0');
export const fmt = (t) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
export const ymd = (y, m, d) => fmt(Date.UTC(y, m - 1, d));
export const weekday = (t) => new Date(t).getUTCDay();
export const addDays = (t, n) => t + n * DAY;
export const daysBetween = (a, b) => Math.round((b - a) / DAY);
// 端末の今日（日本で使う前提で、端末の時計の日付）
export function today(now = new Date()) {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}
// 月の第 n 月曜日など
const nthWeekday = (y, m, n, wd) => {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
};

// ---------- 祝日 ----------
// 春分・秋分の日は計算式（1980〜2099 年で使える近似式）
const vernal = (y) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const autumnal = (y) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
export const HOLIDAY_RANGE = [1980, 2099];

const cache = new Map();
// その年の祝日：Map<'YYYY-MM-DD', 名前>（振替休日・国民の休日を含む）
export function holidays(y) {
  if (cache.has(y)) return cache.get(y);
  const base = new Map();
  const add = (m, d, name) => base.set(ymd(y, m, d), name);
  add(1, 1, '元日');
  if (y >= 2000) add(1, nthWeekday(y, 1, 2, 1), '成人の日');
  else add(1, 15, '成人の日');
  add(2, 11, '建国記念の日');
  if (y >= 2020) add(2, 23, '天皇誕生日');
  add(3, vernal(y), '春分の日');
  if (y >= 2007) add(4, 29, '昭和の日');
  else if (y >= 1989) add(4, 29, 'みどりの日');
  else add(4, 29, '天皇誕生日');
  add(5, 3, '憲法記念日');
  if (y >= 2007) add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');
  if (y === 2020) add(7, 23, '海の日');
  else if (y === 2021) add(7, 22, '海の日');
  else if (y >= 2003) add(7, nthWeekday(y, 7, 3, 1), '海の日');
  else if (y >= 1996) add(7, 20, '海の日');
  if (y === 2020) add(8, 10, '山の日');
  else if (y === 2021) add(8, 8, '山の日');
  else if (y >= 2016) add(8, 11, '山の日');
  if (y >= 2003) add(9, nthWeekday(y, 9, 3, 1), '敬老の日');
  else add(9, 15, '敬老の日');
  add(9, autumnal(y), '秋分の日');
  if (y === 2020) add(7, 24, 'スポーツの日');
  else if (y === 2021) add(7, 23, 'スポーツの日');
  else if (y >= 2022) add(10, nthWeekday(y, 10, 2, 1), 'スポーツの日');
  else if (y >= 2000) add(10, nthWeekday(y, 10, 2, 1), '体育の日');
  else add(10, 10, '体育の日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');
  if (y >= 1989 && y <= 2018) add(12, 23, '天皇誕生日');
  // その年だけの祝日
  if (y === 1989) add(2, 24, '昭和天皇の大喪の礼');
  if (y === 1990) add(11, 12, '即位礼正殿の儀');
  if (y === 1993) add(6, 9, '皇太子徳仁親王の結婚の儀');
  if (y === 2019) {
    add(5, 1, '天皇の即位の日');
    add(10, 22, '即位礼正殿の儀');
  }

  const out = new Map(base);
  // 国民の休日：祝日に挟まれた平日（日曜でない日）
  if (y >= 1988) {
    for (const k of base.keys()) {
      const t = parseDate(k), mid = addDays(t, 1), next = addDays(t, 2);
      if (base.has(fmt(next)) && !base.has(fmt(mid)) && weekday(mid) !== 0) out.set(fmt(mid), '国民の休日');
    }
  }
  // 振替休日：祝日が日曜なら、その後の最初の「祝日でない日」（2006 年までは翌月曜のみ）
  if (y >= 1973) {
    for (const k of base.keys()) {
      const t = parseDate(k);
      if (weekday(t) !== 0) continue;
      let d = addDays(t, 1);
      if (y >= 2007) while (out.has(fmt(d))) d = addDays(d, 1);
      else if (out.has(fmt(d))) continue;
      out.set(fmt(d), '振替休日');
    }
  }
  const sorted = new Map([...out].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  cache.set(y, sorted);
  return sorted;
}
export const holidayName = (t) => holidays(new Date(t).getUTCFullYear()).get(fmt(t)) ?? null;

// ---------- 営業日 ----------
// opts: { weekend: [0, 6]（休みの曜日）, holiday: true（祝日を休む）, newYear: false（12/29〜1/3 を休む）, extra: ['YYYY-MM-DD', ...]（会社の休み） }
export const DEFAULT_RULE = { weekend: [0, 6], holiday: true, newYear: false, extra: [] };

// 休みなら理由（「土曜」「祝日：元日」など）、営業日なら null
export function offReason(t, opts = DEFAULT_RULE) {
  const o = { ...DEFAULT_RULE, ...opts };
  const k = fmt(t);
  if (o.extra?.includes(k)) return '会社の休み';
  const d = new Date(t), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  if (o.holiday) {
    const n = holidayName(t);
    if (n) return `祝日：${n}`;
  }
  if (o.newYear && ((m === 12 && day >= 29) || (m === 1 && day <= 3))) return '年末年始';
  const wd = weekday(t);
  if (o.weekend.includes(wd)) return `${WEEK[wd]}曜`;
  return null;
}
export const isBusinessDay = (t, opts) => !offReason(t, opts);

// a から b までの営業日の数（両端を含む。a > b なら入れ替える）
export function countBusinessDays(a, b, opts) {
  if (a > b) [a, b] = [b, a];
  let n = 0;
  for (let t = a; t <= b; t = addDays(t, 1)) if (isBusinessDay(t, opts)) n++;
  return n;
}

// n 営業日後（n < 0 なら前）。基準日は数えない。n = 0 なら、基準日が休みなら次の営業日
export function addBusinessDays(t, n, opts) {
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n), d = t;
  if (!left) {
    while (!isBusinessDay(d, opts)) d = addDays(d, 1);
    return d;
  }
  let guard = 0;
  while (left > 0) {
    d = addDays(d, step);
    if (isBusinessDay(d, opts)) left--;
    if (++guard > 40000) throw new Error('営業日が見つかりません（休みの設定を確認してください）');
  }
  return d;
}

// ---------- 月・年の足し算と期間 ----------
// 月末の扱い：1/31 の 1 か月後は 2/28（29）のように、その月の最終日にそろえる
export function addMonths(t, n) {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(day, last));
}
export const addYears = (t, n) => addMonths(t, n * 12);

// a から b まで「x 年 y か月 z 日」（a <= b に並べ替えて計算）
export function diffYMD(a, b) {
  const sign = a > b ? -1 : 1;
  if (a > b) [a, b] = [b, a];
  const A = new Date(a), B = new Date(b);
  let months = (B.getUTCFullYear() - A.getUTCFullYear()) * 12 + (B.getUTCMonth() - A.getUTCMonth());
  if (addMonths(a, months) > b) months--;
  const days = daysBetween(addMonths(a, months), b);
  return { sign, years: Math.floor(months / 12), months: months % 12, totalMonths: months, days };
}

// 満年齢（誕生日に 1 つ増える、ふだんの数え方。2/29 生まれは、うるう年でない年は 2/28 に増える）
export function age(birth, on) {
  if (on < birth) return null;
  return diffYMD(birth, on).years;
}

// ---------- 和暦 ----------
// 明治は改暦（明治 6 年 1 月 1 日）より前は旧暦なので、この変換は明治 6 年以降を対象にする
export const ERAS = [
  { name: '令和', short: 'R', start: '2019-05-01' },
  { name: '平成', short: 'H', start: '1989-01-08' },
  { name: '昭和', short: 'S', start: '1926-12-25' },
  { name: '大正', short: 'T', start: '1912-07-30' },
  { name: '明治', short: 'M', start: '1873-01-01', y1: 1868 },
];
const eraYear1 = (e) => e.y1 ?? +e.start.slice(0, 4);

export function toWareki(t) {
  const e = ERAS.find((x) => t >= parseDate(x.start));
  if (!e) return null;
  const d = new Date(t);
  const n = d.getUTCFullYear() - eraYear1(e) + 1;
  return { era: e.name, short: e.short, year: n, month: d.getUTCMonth() + 1, day: d.getUTCDate(), text: `${e.name}${n === 1 ? '元' : n}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日` };
}

// 和暦 → 西暦。その元号の期間外（平成 32 年など）は error を付けて返す
export function fromWareki(eraName, year, month = 1, day = 1) {
  const e = ERAS.find((x) => x.name === eraName || x.short === String(eraName).toUpperCase());
  if (!e) return { error: '元号が分かりません' };
  const y = eraYear1(e) + Number(year) - 1;
  const t = parseDate(`${y}-${month}-${day}`);
  if (t === null) return { error: '日付が正しくありません' };
  const w = toWareki(t);
  if (!w || w.era !== e.name) return { t, error: `${e.name}${year}年${month}月${day}日はありません（${w ? w.text : '対象外の日付'}）` };
  return { t };
}

// 「令和8年」「R8」「H31.4.30」「平成元年」のような書き方を読む
export function parseWareki(s) {
  const m = String(s ?? '').normalize('NFKC').trim().match(/^(令和|平成|昭和|大正|明治|[RHSTMrhstm])\s*(元|\d{1,2})\s*(?:年|[.\-/])?\s*(?:(\d{1,2})\s*(?:月|[.\-/])?\s*(?:(\d{1,2})\s*日?)?)?$/);
  if (!m) return null;
  return { era: m[1], year: m[2] === '元' ? 1 : +m[2], month: m[3] ? +m[3] : null, day: m[4] ? +m[4] : null };
}

// 西暦の年 → その年に使われた元号（年の途中で変わる年は 2 つ）
export function warekiOfYear(y) {
  const out = [];
  for (const e of [...ERAS].reverse()) {
    const start = +e.start.slice(0, 4), y1 = eraYear1(e);
    const next = ERAS[ERAS.indexOf(e) - 1];
    const end = next ? +next.start.slice(0, 4) : 9999;
    if (y >= Math.max(y1, e.name === '明治' ? 1873 : start) && y <= end) out.push(`${e.name}${y - y1 + 1 === 1 ? '元' : y - y1 + 1}年`);
  }
  return out;
}

const ETO_K = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ETO_S = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ETO_A = ['ねずみ', 'うし', 'とら', 'うさぎ', 'たつ', 'へび', 'うま', 'ひつじ', 'さる', 'とり', 'いぬ', 'いのしし'];
export const eto = (y) => ({ kanshi: ETO_K[(((y - 4) % 10) + 10) % 10] + ETO_S[(((y - 4) % 12) + 12) % 12], animal: ETO_A[(((y - 4) % 12) + 12) % 12] });

// ---------- タイムゾーン ----------
// その地域の「壁掛け時計の時刻」を読む
export function zoned(ms, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = Math.round((local - Math.floor(ms / 1000) * 1000) / 60000); // 分
  return { y: +parts.year, mo: +parts.month, d: +parts.day, h: +parts.hour, mi: +parts.minute, s: +parts.second, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday), offset };
}
export const offsetText = (min) => `UTC${min < 0 ? '−' : '+'}${pad(Math.floor(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}`;

// その地域での日時（壁掛け時計の時刻）→ 実際の時刻（ミリ秒）
// 夏時間の切り替えで存在しない時刻は、切り替え後の時刻にする
export function fromZoned({ y, mo, d, h = 0, mi = 0, s = 0 }, timeZone) {
  const local = Date.UTC(y, mo - 1, d, h, mi, s);
  let guess = local;
  for (let i = 0; i < 3; i++) {
    const off = zoned(guess, timeZone).offset;
    const next = local - off * 60000;
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

// UNIX 時間（秒・ミリ秒どちらでも）→ ミリ秒
export function fromUnix(v) {
  const s = String(v ?? '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Math.abs(n) >= 1e11 ? Math.round(n) : Math.round(n * 1000); // 1e11 秒 ≒ 西暦 5000 年。それより大きければミリ秒
}
