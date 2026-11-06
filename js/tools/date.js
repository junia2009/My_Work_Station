// 日付計算：期間・営業日・日付の足し算・カレンダー・和暦・時刻と時差
import * as D from '../lib/dates.js';
import { $, h, copy, debounce, store, toast, registerReceiver, openTab, KEY } from '../ui/common.js';

export const meta = {
  id: 'date',
  group: 'ツール',
  name: '日付計算',
  code: 'DATE CALCULATOR',
  desc: '期間・営業日・〇日後・和暦・時差を計算',
  icon: 'calendar',
  keywords: ['日付', '日数', '期間', '営業日', '祝日', '休日', 'カレンダー', '和暦', '元号', '令和', '平成', '昭和', '年齢', '干支', '時差', 'タイムゾーン', 'unix', '何日後', '締め切り', '納期'],
};

export const help = {
  when: '納期まで何営業日あるか、〇営業日後は何日か、和暦で何年か、海外は今何時か、などを調べたいとき。',
  steps: ['上のタブで、やりたい計算を選ぶ', '日付を入れると、すぐに結果が出ます（結果はクリックでコピー）', '会社独自の休みや年末年始は「休みの設定」で決められます（このブラウザに保存）'],
  sample: '年末年始をはさむ期間の営業日',
};

export const sample = () => ({ tab: 'dt-span', start: `${new Date().getFullYear()}-12-25`, end: `${new Date().getFullYear() + 1}-01-08`, newYear: true });

export const pallas = '日付の計算は、人間が一番うっかりする所だ。祝日に振替休日、月末の扱い……全部僕が覚えている。納期の前に、ここで確かめていこう。';

export const html = `
  <h1>日付計算</h1>
  <details class="card dt-rule" id="dtRule">
    <summary><b>休みの設定</b><span class="hint" id="dtRuleSum"></span></summary>
    <div class="row dt-rule-row">
      <label class="check"><input type="checkbox" id="dtSat" checked> 土曜</label>
      <label class="check"><input type="checkbox" id="dtSun" checked> 日曜</label>
      <label class="check"><input type="checkbox" id="dtHol" checked> 祝日（振替休日を含む）</label>
      <label class="check"><input type="checkbox" id="dtNY"> 年末年始（12/29〜1/3）</label>
    </div>
    <label for="dtExtra">会社の休み（1 行に 1 日。例：2026-12-28 創立記念日）</label>
    <textarea id="dtExtra" rows="3" class="mono" placeholder="2026-08-13 夏季休暇&#10;2026-08-14"></textarea>
    <p class="error" id="dtExtraErr"></p>
  </details>

  <div class="tabs" role="tablist">
    <button type="button" data-tab="dt-span">期間・営業日</button>
    <button type="button" data-tab="dt-add">日付を足す</button>
    <button type="button" data-tab="dt-cal">カレンダー</button>
    <button type="button" data-tab="dt-wareki">和暦</button>
    <button type="button" data-tab="dt-tz">時刻・時差</button>
  </div>
  <div class="tab-panels">
    <div data-panel="dt-span">
      <div class="card">
        <div class="form-grid dt-two">
          <div><label for="dtFrom">開始日</label><div class="row"><input type="date" id="dtFrom" class="grow"><button type="button" class="ghost small" data-today="dtFrom">今日</button></div></div>
          <div><label for="dtTo">終了日</label><div class="row"><input type="date" id="dtTo" class="grow"><button type="button" class="ghost small" data-today="dtTo">今日</button></div></div>
        </div>
      </div>
      <div class="card"><div id="dtSpanOut"></div></div>
    </div>

    <div data-panel="dt-add" hidden>
      <div class="card">
        <div class="form-grid dt-three">
          <div><label for="dtBase">基準日</label><div class="row"><input type="date" id="dtBase" class="grow"><button type="button" class="ghost small" data-today="dtBase">今日</button></div></div>
          <div><label for="dtN">数（マイナスで前）</label><input type="number" id="dtN" value="10" step="1"></div>
          <div><label for="dtUnit">単位</label>
            <select id="dtUnit">
              <option value="bday">営業日</option>
              <option value="day">日</option>
              <option value="week">週</option>
              <option value="month">か月</option>
              <option value="year">年</option>
            </select>
          </div>
        </div>
      </div>
      <div class="card"><div id="dtAddOut"></div></div>
    </div>

    <div data-panel="dt-cal" hidden>
      <div class="card">
        <div class="row between">
          <div class="row">
            <button type="button" class="ghost small" id="dtCalPrev" aria-label="前の月">‹</button>
            <b class="dt-cal-title" id="dtCalTitle"></b>
            <button type="button" class="ghost small" id="dtCalNext" aria-label="次の月">›</button>
          </div>
          <div class="row">
            <input type="month" id="dtCalMonth" aria-label="月を選ぶ">
            <button type="button" class="ghost small" id="dtCalNow">今月</button>
          </div>
        </div>
        <div id="dtCal"></div>
        <p class="hint">日付をクリックするとコピーできます。色の付いた日は休み（休みの設定に従います）。</p>
      </div>
    </div>

    <div data-panel="dt-wareki" hidden>
      <div class="card">
        <label for="dtWa">日付・年（西暦でも和暦でも）</label>
        <input id="dtWa" placeholder="例：2026-11-06 / 令和8年11月6日 / H31.4.30 / 1989 / 昭和60">
        <div class="row cmd-try"><span>例：</span>
          <button type="button" data-wa="令和元年5月1日">令和元年5月1日</button>
          <button type="button" data-wa="H31.4.30">H31.4.30</button>
          <button type="button" data-wa="1989">1989</button>
          <button type="button" data-wa="昭和60">昭和60</button>
        </div>
      </div>
      <div class="card"><div id="dtWaOut"></div></div>
      <details class="card">
        <summary><b>年の早見表（西暦・和暦・干支・今年の年齢）</b></summary>
        <div class="table-wrap"><table class="list dt-years" id="dtYears"></table></div>
      </details>
    </div>

    <div data-panel="dt-tz" hidden>
      <div class="card">
        <div class="form-grid dt-three">
          <div><label for="dtTzTime">日時</label><input type="datetime-local" id="dtTzTime" step="60"></div>
          <div><label for="dtTzFrom">その日時の地域</label><select id="dtTzFrom"></select></div>
          <div><label>&nbsp;</label><button type="button" class="ghost" id="dtTzNow">今の時刻にする</button></div>
        </div>
      </div>
      <div class="card"><div class="table-wrap"><table class="list" id="dtTzOut"></table></div></div>
      <div class="card">
        <label for="dtUnix">UNIX 時間（秒・ミリ秒）</label>
        <div class="row"><input id="dtUnix" class="mono grow" placeholder="例：1700000000"><button type="button" class="ghost small" id="dtUnixNow">今</button></div>
        <table class="kv" id="dtUnixOut"></table>
      </div>
    </div>
  </div>
`;

const TZS = [
  ['Asia/Tokyo', '日本（東京）'],
  ['UTC', 'UTC（協定世界時）'],
  ['Asia/Seoul', '韓国（ソウル）'],
  ['Asia/Shanghai', '中国（上海）'],
  ['Asia/Taipei', '台湾（台北）'],
  ['Asia/Singapore', 'シンガポール'],
  ['Asia/Bangkok', 'タイ（バンコク）'],
  ['Asia/Kolkata', 'インド'],
  ['Asia/Dubai', 'ドバイ'],
  ['Europe/London', 'イギリス（ロンドン）'],
  ['Europe/Paris', 'フランス・ドイツ（パリ）'],
  ['America/New_York', 'アメリカ東部（ニューヨーク）'],
  ['America/Chicago', 'アメリカ中部（シカゴ）'],
  ['America/Los_Angeles', 'アメリカ西部（ロサンゼルス）'],
  ['Pacific/Honolulu', 'ハワイ'],
  ['Australia/Sydney', 'オーストラリア（シドニー）'],
];

const RULE_KEY = KEY('dateRule');
const DOW = D.WEEK;
const show = (t) => `${D.fmt(t).replace(/-/g, '/')}（${DOW[D.weekday(t)]}）`;
const cell = (v, title = 'クリックでコピー') => h('td', { class: 'copyable', title, onclick: () => copy(String(v)) }, v);
const kv = (k, v, copyValue = v) => h('tr', {}, h('th', {}, k), h('td', { class: 'copyable', title: 'クリックでコピー', onclick: () => copy(String(copyValue)) }, v));
const relToday = (t) => {
  const n = D.daysBetween(D.today(), t);
  return n === 0 ? '今日' : n > 0 ? `今日から ${n} 日後` : `今日の ${-n} 日前`;
};

export function init() {
  // ---------- 休みの設定 ----------
  const saved = store.get(RULE_KEY, null);
  if (saved) {
    $('dtSat').checked = saved.weekend?.includes(6) ?? true;
    $('dtSun').checked = saved.weekend?.includes(0) ?? true;
    $('dtHol').checked = saved.holiday ?? true;
    $('dtNY').checked = !!saved.newYear;
    $('dtExtra').value = saved.extraText ?? '';
  }
  let extraNames = new Map();
  function rule() {
    const extra = [];
    extraNames = new Map();
    const bad = [];
    for (const line of $('dtExtra').value.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      const [d, ...rest] = s.split(/\s+/);
      const t = D.parseDate(d);
      if (t === null) { bad.push(d); continue; }
      extra.push(D.fmt(t));
      extraNames.set(D.fmt(t), rest.join(' '));
    }
    $('dtExtraErr').textContent = bad.length ? `日付として読めない行があります：${bad.slice(0, 3).join('、')}` : '';
    const weekend = [...($('dtSun').checked ? [0] : []), ...($('dtSat').checked ? [6] : [])];
    return { weekend, holiday: $('dtHol').checked, newYear: $('dtNY').checked, extra };
  }
  const reason = (t, r) => {
    const why = D.offReason(t, r);
    return why === '会社の休み' && extraNames.get(D.fmt(t)) ? `会社の休み：${extraNames.get(D.fmt(t))}` : why;
  };
  function saveRule() {
    const r = rule();
    store.set(RULE_KEY, { ...r, extraText: $('dtExtra').value });
    const parts = [r.weekend.length === 2 ? '土日' : r.weekend.length ? `${DOW[r.weekend[0]]}曜` : '', r.holiday ? '祝日' : '', r.newYear ? '年末年始' : '', r.extra.length ? `会社の休み ${r.extra.length} 日` : ''].filter(Boolean);
    $('dtRuleSum').textContent = parts.length ? `休み：${parts.join('・')}` : '休みなし（毎日が営業日）';
    renderAll();
  }
  ['dtSat', 'dtSun', 'dtHol', 'dtNY'].forEach((id) => $(id).addEventListener('change', saveRule));
  $('dtExtra').addEventListener('input', debounce(saveRule, 300));

  const outOfRange = (...ts) => ts.some((t) => {
    const y = new Date(t).getUTCFullYear();
    return y < D.HOLIDAY_RANGE[0] || y > D.HOLIDAY_RANGE[1];
  }) ? h('p', { class: 'hint' }, `祝日は ${D.HOLIDAY_RANGE[0]}〜${D.HOLIDAY_RANGE[1]} 年に対応しています。範囲外の年は祝日を数えていません。`) : '';

  // ---------- 期間・営業日 ----------
  function renderSpan() {
    const a = D.parseDate($('dtFrom').value), b = D.parseDate($('dtTo').value);
    const out = $('dtSpanOut');
    if (a === null || b === null) return out.replaceChildren(h('p', { class: 'hint' }, '開始日と終了日を入れてください。'));
    const r = rule();
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const days = D.daysBetween(lo, hi);
    if (days > 366 * 50) return out.replaceChildren(h('p', { class: 'error' }, '期間が長すぎます（50 年まで）。'));
    const ymd = D.diffYMD(lo, hi);
    const bdays = D.countBusinessDays(lo, hi, r);
    const offs = [];
    for (let t = lo; t <= hi; t = D.addDays(t, 1)) {
      const why = reason(t, r);
      if (why && !/曜$/.test(why)) offs.push([t, why]);
    }
    // 祝日などが土日と重なった日は「土日」に数える（合計が休みの日数と合うように）
    const offWeekday = offs.filter(([t]) => !r.weekend.includes(D.weekday(t))).length;
    const weekendDays = days + 1 - bdays - offWeekday;
    out.replaceChildren(
      a > b ? h('p', { class: 'hint' }, '開始日が終了日より後なので、入れ替えて計算しています。') : '',
      h('table', { class: 'kv' },
        kv('日数', `${days} 日（${show(lo)} → ${show(hi)}）`, days),
        kv('両端を含めると', `${days + 1} 日`, days + 1),
        kv('週', `${Math.floor(days / 7)} 週と ${days % 7} 日`),
        kv('年・月・日', `${ymd.years ? `${ymd.years} 年 ` : ''}${ymd.months ? `${ymd.months} か月 ` : ''}${ymd.days} 日（${ymd.totalMonths} か月と ${ymd.days} 日）`),
        kv('営業日（両端を含む）', `${bdays} 日`, bdays),
        kv('休み（両端を含む）', `${days + 1 - bdays} 日（うち${r.weekend.length ? `${r.weekend.map((w) => DOW[w]).join('・')}曜 ${weekendDays} 日、` : ''}祝日など ${offWeekday} 日）`, days + 1 - bdays),
      ),
      outOfRange(lo, hi),
      offs.length ? h('div', {},
        h('p', { class: 'diff-sub' }, `期間中の祝日・休み（${offs.length} 日）`),
        h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
          h('tr', {}, h('th', {}, '日付'), h('th', {}, '曜日'), h('th', {}, '理由')),
          ...offs.slice(0, 200).map(([t, why]) => h('tr', {}, cell(D.fmt(t)), h('td', {}, DOW[D.weekday(t)]), h('td', {}, why)))))) : '',
    );
  }

  // ---------- 日付を足す ----------
  function addBy(t, n, unit, r) {
    switch (unit) {
      case 'bday': return D.addBusinessDays(t, n, r);
      case 'day': return D.addDays(t, n);
      case 'week': return D.addDays(t, n * 7);
      case 'month': return D.addMonths(t, n);
      default: return D.addYears(t, n);
    }
  }
  const UNIT = { bday: '営業日', day: '日', week: '週', month: 'か月', year: '年' };
  function renderAdd() {
    const base = D.parseDate($('dtBase').value), n = Number($('dtN').value), unit = $('dtUnit').value;
    const out = $('dtAddOut');
    if (base === null || !Number.isInteger(n)) return out.replaceChildren(h('p', { class: 'hint' }, '基準日と数（整数）を入れてください。'));
    if (Math.abs(n) > (unit === 'year' ? 500 : unit === 'month' ? 6000 : 100000)) return out.replaceChildren(h('p', { class: 'error' }, '数が大きすぎます。'));
    const r = rule();
    let res;
    try {
      res = addBy(base, n, unit, r);
    } catch (e) {
      return out.replaceChildren(h('p', { class: 'error' }, e.message));
    }
    const why = reason(res, r);
    const w = D.toWareki(res);
    const label = `${show(base)} の ${Math.abs(n)} ${UNIT[unit]}${n < 0 ? '前' : '後'}`;
    const notes = [];
    if (unit === 'bday') notes.push('基準日は数えずに、翌営業日から 1、2、3…と数えています。');
    if ((unit === 'month' || unit === 'year') && new Date(base).getUTCDate() !== new Date(res).getUTCDate()) notes.push('その月に同じ日が無いので、月末にそろえています。');
    if (why && unit !== 'bday') {
      notes.push(`この日は休み（${why}）です。前の営業日は ${show(D.addBusinessDays(D.addDays(res, 1), -1, r))}、次の営業日は ${show(D.addBusinessDays(D.addDays(res, -1), 1, r))}。`);
    }
    // 早見表：よく使う数
    const quick = unit === 'bday' ? [1, 2, 3, 5, 10, 15, 20, 30] : unit === 'day' ? [1, 3, 7, 10, 14, 30, 60, 90] : unit === 'week' ? [1, 2, 3, 4, 6, 8, 12, 26] : unit === 'month' ? [1, 2, 3, 6, 9, 12, 18, 24] : [1, 2, 3, 5, 10];
    const sign = n < 0 ? -1 : 1;
    out.replaceChildren(
      h('div', { class: 'dt-big copyable', title: 'クリックでコピー', onclick: () => copy(D.fmt(res)) },
        h('span', { class: 'dt-big-label' }, label),
        h('b', {}, show(res)),
        h('span', {}, `${w ? w.text : ''}　${relToday(res)}${why ? `　休み：${why}` : ''}`)),
      ...notes.map((x) => h('p', { class: 'hint' }, x)),
      outOfRange(base, res),
      h('p', { class: 'diff-sub' }, `早見表（${show(base)} から）`),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('tr', {}, h('th', {}, ''), h('th', {}, '日付'), h('th', {}, '曜日'), h('th', {}, '休み')),
        ...quick.map((q) => {
          const t = addBy(base, q * sign, unit, r);
          return h('tr', {}, h('th', {}, `${q} ${UNIT[unit]}${sign < 0 ? '前' : '後'}`), cell(D.fmt(t)), h('td', {}, DOW[D.weekday(t)]), h('td', {}, reason(t, r) ?? ''));
        }))),
    );
  }

  // ---------- カレンダー ----------
  let calY, calM;
  const setMonth = (y, m) => {
    const d = new Date(Date.UTC(y, m - 1, 1));
    calY = d.getUTCFullYear();
    calM = d.getUTCMonth() + 1;
    $('dtCalMonth').value = `${calY}-${String(calM).padStart(2, '0')}`;
    renderCal();
  };
  function renderCal() {
    const r = rule();
    const first = Date.UTC(calY, calM - 1, 1), last = Date.UTC(calY, calM, 0);
    const today = D.today();
    $('dtCalTitle').textContent = `${calY} 年 ${calM} 月${D.toWareki(first) ? `（${D.toWareki(first).era}${D.toWareki(first).year === 1 ? '元' : D.toWareki(first).year}年）` : ''}`;
    const cells = [];
    for (let i = 0; i < D.weekday(first); i++) cells.push(h('div', { class: 'dt-day empty' }));
    const offs = [];
    let bdays = 0;
    for (let t = first; t <= last; t = D.addDays(t, 1)) {
      const why = reason(t, r), hol = D.holidayName(t), wd = D.weekday(t);
      if (!why) bdays++;
      if (why && !/曜$/.test(why)) offs.push([t, why]);
      cells.push(h('button', {
        type: 'button',
        class: `dt-day${why ? ' off' : ''}${hol && r.holiday ? ' hol' : ''}${wd === 0 ? ' sun' : wd === 6 ? ' sat' : ''}${t === today ? ' today' : ''}`,
        title: `${D.fmt(t)}${why ? `　${why}` : '　営業日'}`,
        onclick: () => copy(D.fmt(t)),
      }, h('b', {}, new Date(t).getUTCDate()), why && !/曜$/.test(why) ? h('small', {}, why.replace(/^祝日：|^会社の休み：?/, '') || '休み') : ''));
    }
    $('dtCal').replaceChildren(
      h('div', { class: 'dt-cal' }, ...DOW.map((d, i) => h('div', { class: `dt-dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}` }, d)), ...cells),
      h('p', { class: 'meta-line' }, `営業日 ${bdays} 日・休み ${D.daysBetween(first, last) + 1 - bdays} 日`),
      outOfRange(first),
      offs.length ? h('ul', { class: 'dt-offs' }, ...offs.map(([t, why]) => h('li', {}, h('b', {}, `${new Date(t).getUTCDate()} 日（${DOW[D.weekday(t)]}）`), why))) : '',
    );
  }
  $('dtCalPrev').addEventListener('click', () => setMonth(calY, calM - 1));
  $('dtCalNext').addEventListener('click', () => setMonth(calY, calM + 1));
  $('dtCalNow').addEventListener('click', () => setMonth(new Date().getFullYear(), new Date().getMonth() + 1));
  $('dtCalMonth').addEventListener('change', () => {
    const [y, m] = $('dtCalMonth').value.split('-').map(Number);
    if (y && m) setMonth(y, m);
  });

  // ---------- 和暦 ----------
  function renderWareki() {
    const v = $('dtWa').value.normalize('NFKC').trim();
    const out = $('dtWaOut');
    if (!v) return out.replaceChildren(h('p', { class: 'hint' }, '日付や年を入れてください。'));
    const thisYear = new Date().getFullYear();
    const yearRows = (y) => {
      const e = D.eto(y);
      return [kv('西暦', `${y} 年`, y), kv('和暦', D.warekiOfYear(y).join(' / ') || '（対象外）'), kv('干支', `${e.kanshi}（${e.animal}）`), kv(`${thisYear} 年の誕生日を過ぎたあとの年齢`, `${thisYear - y} 歳`, thisYear - y)];
    };
    const dateRows = (t) => {
      const w = D.toWareki(t), e = D.eto(new Date(t).getUTCFullYear()), a = D.age(t, D.today());
      return [
        kv('西暦', show(t), D.fmt(t)),
        kv('和暦', w ? w.text : '（明治 6 年より前は対象外）'),
        w ? kv('略記', `${w.short}${w.year}.${w.month}.${w.day}`) : '',
        kv('干支（年）', `${e.kanshi}（${e.animal}）`),
        kv('今日まで', relToday(t)),
        a !== null ? kv('この日に生まれた人の今日の年齢', `${a} 歳`, a) : '',
        D.holidayName(t) ? kv('祝日', D.holidayName(t)) : '',
      ];
    };
    // 西暦の年だけ
    if (/^\d{4}$/.test(v)) return out.replaceChildren(h('table', { class: 'kv' }, ...yearRows(+v)));
    // 西暦の日付
    const t = D.parseDate(v);
    if (t !== null) return out.replaceChildren(h('table', { class: 'kv' }, ...dateRows(t)));
    // 和暦
    const w = D.parseWareki(v);
    if (w) {
      if (!w.month) {
        const r = D.fromWareki(w.era, w.year, 1, 1);
        if (r.error && !r.t) return out.replaceChildren(h('p', { class: 'error' }, r.error));
        const y = new Date(r.t).getUTCFullYear();
        const era = D.ERAS.find((x) => x.name === w.era || x.short === w.era.toUpperCase());
        const end = D.ERAS[D.ERAS.indexOf(era) - 1];
        if (end && y > +end.start.slice(0, 4)) return out.replaceChildren(h('p', { class: 'error' }, `${era.name}${w.year}年はありません（${era.name}は ${+end.start.slice(0, 4) - (era.y1 ?? +era.start.slice(0, 4)) + 1} 年まで）`));
        return out.replaceChildren(h('table', { class: 'kv' }, ...yearRows(y)));
      }
      const r = D.fromWareki(w.era, w.year, w.month, w.day ?? 1);
      if (r.error) return out.replaceChildren(h('p', { class: 'error' }, r.error));
      return out.replaceChildren(h('table', { class: 'kv' }, ...dateRows(r.t)));
    }
    out.replaceChildren(h('p', { class: 'error' }, '読めませんでした。「2026-11-06」「令和8年11月6日」「H31.4.30」「1989」のように入れてください。'));
  }
  $('dtWa').addEventListener('input', debounce(renderWareki, 150));
  document.querySelectorAll('[data-wa]').forEach((b) => b.addEventListener('click', () => {
    $('dtWa').value = b.dataset.wa;
    renderWareki();
  }));
  function renderYears() {
    const thisYear = new Date().getFullYear();
    const rows = [];
    for (let y = thisYear + 1; y >= 1926; y--) {
      const e = D.eto(y);
      rows.push(h('tr', { class: y === thisYear ? 'dt-now' : '' }, cell(String(y)), h('td', {}, D.warekiOfYear(y).join(' / ')), h('td', {}, `${e.kanshi}（${e.animal}）`), h('td', { class: 'num' }, y <= thisYear ? `${thisYear - y} 歳` : '')));
    }
    $('dtYears').replaceChildren(h('tr', {}, h('th', {}, '西暦'), h('th', {}, '和暦'), h('th', {}, '干支'), h('th', {}, `${thisYear} 年の年齢`)), ...rows);
  }

  // ---------- 時刻・時差 ----------
  $('dtTzFrom').append(...TZS.map(([id, name]) => h('option', { value: id }, name)));
  const pad = (n) => String(n).padStart(2, '0');
  const setNow = () => {
    const z = D.zoned(Date.now(), $('dtTzFrom').value);
    $('dtTzTime').value = `${z.y}-${pad(z.mo)}-${pad(z.d)}T${pad(z.h)}:${pad(z.mi)}`;
    renderTz();
  };
  function renderTz() {
    const m = $('dtTzTime').value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return $('dtTzOut').replaceChildren();
    const from = $('dtTzFrom').value;
    const ms = D.fromZoned({ y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] }, from);
    const jp = D.zoned(ms, 'Asia/Tokyo');
    const base = Date.UTC(jp.y, jp.mo - 1, jp.d);
    const rows = TZS.map(([id, name]) => {
      const z = D.zoned(ms, id);
      const diff = (z.offset - jp.offset) / 60;
      const dayDiff = D.daysBetween(base, Date.UTC(z.y, z.mo - 1, z.d));
      const text = `${z.y}/${pad(z.mo)}/${pad(z.d)}（${DOW[z.wd]}）${pad(z.h)}:${pad(z.mi)}`;
      return h('tr', { class: id === from ? 'dt-now' : '' },
        h('th', {}, name),
        cell(text),
        h('td', {}, D.offsetText(z.offset)),
        h('td', {}, id === 'Asia/Tokyo' ? '—' : `日本より ${diff === 0 ? '同じ' : `${Math.abs(diff)} 時間${diff < 0 ? '遅い' : '早い'}`}${dayDiff ? `（${dayDiff < 0 ? '前日' : '翌日'}）` : ''}`));
    });
    $('dtTzOut').replaceChildren(h('tr', {}, h('th', {}, '地域'), h('th', {}, '日時'), h('th', {}, 'UTC との差'), h('th', {}, '日本との時差')), ...rows);
  }
  $('dtTzTime').addEventListener('input', renderTz);
  $('dtTzFrom').addEventListener('change', renderTz);
  $('dtTzNow').addEventListener('click', setNow);

  function renderUnix() {
    const v = $('dtUnix').value;
    const out = $('dtUnixOut');
    if (!v.trim()) return out.replaceChildren();
    const ms = D.fromUnix(v);
    if (ms === null || !Number.isFinite(new Date(ms).getTime())) return out.replaceChildren(kv('エラー', '数字（秒またはミリ秒）を入れてください'));
    const z = D.zoned(ms, 'Asia/Tokyo');
    out.replaceChildren(
      kv('日本時間', `${z.y}/${pad(z.mo)}/${pad(z.d)}（${DOW[z.wd]}）${pad(z.h)}:${pad(z.mi)}:${pad(z.s)}`),
      kv('UTC（ISO 8601）', new Date(ms).toISOString()),
      kv('秒', Math.floor(ms / 1000)),
      kv('ミリ秒', ms),
      kv('読み方', Math.abs(Number(v)) >= 1e11 ? 'ミリ秒として読みました' : '秒として読みました'),
    );
  }
  $('dtUnix').addEventListener('input', debounce(renderUnix, 120));
  $('dtUnixNow').addEventListener('click', () => {
    $('dtUnix').value = String(Math.floor(Date.now() / 1000));
    renderUnix();
  });

  // ---------- 共通 ----------
  const todayStr = () => D.fmt(D.today());
  document.querySelectorAll('[data-today]').forEach((b) => b.addEventListener('click', () => {
    $(b.dataset.today).value = todayStr();
    renderAll();
  }));
  ['dtFrom', 'dtTo'].forEach((id) => $(id).addEventListener('input', renderSpan));
  ['dtBase', 'dtN', 'dtUnit'].forEach((id) => $(id).addEventListener('input', renderAdd));
  $('dtUnit').addEventListener('change', renderAdd);

  function renderAll() {
    renderSpan();
    renderAdd();
    renderCal();
  }

  // 初期値：今日から 1 か月
  $('dtFrom').value = todayStr();
  $('dtTo').value = D.fmt(D.addMonths(D.today(), 1));
  $('dtBase').value = todayStr();
  calY = new Date().getFullYear();
  calM = new Date().getMonth() + 1;
  $('dtCalMonth').value = `${calY}-${pad(calM)}`;
  saveRule();
  renderYears();
  setNow();
  // 休みの設定はふだん閉じておく（見出しの横に今の設定を 1 行で出している）

  // 例・他のツールから：{ tab（dt-span など）, start, end, base, n, unit, newYear, wareki }
  registerReceiver('date', (p) => {
    if (p.newYear !== undefined) {
      $('dtNY').checked = !!p.newYear;
      saveRule();
    }
    if (p.start) $('dtFrom').value = p.start;
    if (p.end) $('dtTo').value = p.end;
    if (p.base) $('dtBase').value = p.base;
    if (p.n !== undefined) $('dtN').value = p.n;
    if (p.unit) $('dtUnit').value = p.unit;
    if (p.wareki) $('dtWa').value = p.wareki;
    if (p.tab) openTab(p.tab);
    renderAll();
    renderWareki();
    if (p.newYear) toast('年末年始を休みにしました（休みの設定で戻せます）');
  });

  // カレンダーのタブを開いたら、今日が分かるように描き直す（日付が変わっていても大丈夫なように）
  document.querySelector('[data-page="date"] [data-tab="dt-cal"]').addEventListener('click', renderCal);
}
