// 学習テキスト：分野ごとの教材（図・確認問題つき）を章ごとに読む
import { LEARN as NET } from '../data/learn.js';
import { CRYPTO_TEXTS } from '../data/learn-crypto.js';
import { WEB_TEXTS } from '../data/learn-web.js';
import { WEBVULN_TEXTS } from '../data/learn-webvuln.js';
import { PROXY_TEXTS } from '../data/learn-proxy.js';
import { DFIR_TEXTS } from '../data/learn-dfir.js';
import { INFRA_TEXTS } from '../data/learn-infra.js';
import { CLOUD_TEXTS } from '../data/learn-cloud.js';
import { OBS_TEXTS } from '../data/learn-obs.js';
import { icon } from '../data/icons.js';
import { renderGuide, registerFigures, registerWidgets } from '../ui/guide.js';
import { NET_FIGURES, NET_WIDGETS } from '../ui/netfig.js';
import { CRYPTO_FIGURES, CRYPTO_WIDGETS } from '../ui/cryptofig.js';
import { WEB_FIGURES, WEB_WIDGETS } from '../ui/webfig.js';
import { PROXY_FIGURES, PROXY_WIDGETS } from '../ui/proxyfig.js';
import { DFIR_FIGURES, DFIR_WIDGETS } from '../ui/forensicfig.js';
import { INFRA_FIGURES, INFRA_WIDGETS } from '../ui/infrafig.js';
import { CLOUD_FIGURES, CLOUD_WIDGETS } from '../ui/cloudfig.js';
import { OBS_FIGURES, OBS_WIDGETS } from '../ui/obsfig.js';
import { $, h, store, KEY } from '../ui/common.js';

export const meta = {
  id: 'learn',
  group: '資料',
  name: '学習テキスト',
  code: 'KNOWLEDGE BASE',
  desc: 'ネットワーク・暗号・Web・インフラ運用などの教材',
  icon: 'learn',
  keywords: ['学ぶ', '学習', '教材', '勉強', 'ネットワーク', '暗号', 'web', 'インフラ', 'クラウド', 'フォレンジック', 'プロキシ', '監視'],
};

export const pallas = '知識は裏切らない。ツールが答えを出しても、なぜそうなるかを知っていれば次の仕事でも戦える。章ごとに少しずつ進めよう。';

export const html = `
  <h1>学習テキスト</h1>
  <div id="learnBody"></div>
`;

export const LEARN = [...NET, ...CRYPTO_TEXTS, ...WEB_TEXTS, ...WEBVULN_TEXTS, ...DFIR_TEXTS, ...INFRA_TEXTS, ...CLOUD_TEXTS, ...OBS_TEXTS, ...PROXY_TEXTS];

const READ_KEY = KEY('learnRead');
registerFigures({ ...NET_FIGURES, ...CRYPTO_FIGURES, ...WEB_FIGURES, ...PROXY_FIGURES, ...DFIR_FIGURES, ...INFRA_FIGURES, ...CLOUD_FIGURES, ...OBS_FIGURES });
registerWidgets({ ...NET_WIDGETS, ...CRYPTO_WIDGETS, ...WEB_WIDGETS, ...PROXY_WIDGETS, ...DFIR_WIDGETS, ...INFRA_WIDGETS, ...CLOUD_WIDGETS, ...OBS_WIDGETS });

export function init() {
  const root = $('learnBody');

  function renderIndex() {
    const read = new Set(store.get(READ_KEY, []));
    const subjects = [...new Set(LEARN.map((t) => t.subject))];
    root.replaceChildren(
      h('p', { class: 'lead' }, '仕事で役に立つ知識を、分野ごとのテキストにまとめました。図と確認問題つきで、章ごとに少しずつ読めます。読んだ章には印が付きます。'),
      ...subjects.flatMap((sub) => {
        const list = LEARN.filter((t) => t.subject === sub);
        return [
          h('h2', { class: 'lr-subject' }, sub, h('small', {}, `${list.length} 冊`)),
          h('div', { class: 'mn-index' }, ...list.map((t, i) => {
            const done = t.chapters.filter((c) => read.has(`${t.id}/${c.id}`)).length;
            const pct = Math.round((done / t.chapters.length) * 100);
            // スマホでは説明を折りたたむ：⌄ で開閉（カード全体のタップは本を開く）
            const more = h('button', { type: 'button', class: 'lr-more', 'aria-label': '説明を開く', 'aria-expanded': 'false' }, '⌄');
            const card = h('article', { class: 'mn-card lr-card' },
              h('a', { class: 'lr-stretch', href: `#learn/${t.id}`, 'aria-label': `${t.name} を開く` }),
              h('span', { class: 'mn-card-icon' }, icon(t.icon)),
              h('div', { class: 'mn-card-body' },
                h('b', {}, h('span', { class: 'lr-vol' }, `第 ${i + 1} 冊`), t.name),
                h('p', { class: 'lr-tagline' }, t.tagline),
                h('span', { class: 'mn-card-meta' }, ...t.genres.map((g) => h('span', { class: 'tag' }, g)), h('span', { class: 'hint' }, `${t.chapters.length} 章・${t.level}`)),
                h('span', { class: 'lr-progress', title: `${done} / ${t.chapters.length} 章を読んだ` },
                  h('span', { class: 'lr-bar' }, h('span', { style: `width:${pct}%` })), h('small', {}, done ? `${done} / ${t.chapters.length} 章` : '未読')),
              ),
              more,
              h('span', { class: 'mn-card-go' }, '›'),
            );
            more.addEventListener('click', () => {
              const open = card.classList.toggle('open');
              more.setAttribute('aria-expanded', String(open));
              more.setAttribute('aria-label', open ? '説明を閉じる' : '説明を開く');
            });
            return card;
          })),
        ];
      }),
      h('p', { class: 'hint mn-more' }, 'テキストは分野ごとに順次追加していきます。'),
    );
  }

  return (arg) => {
    const t = LEARN.find((x) => x.id === arg);
    if (t) {
      renderGuide(root, t, { back: '#learn', backLabel: 'テキストの一覧', illust: {}, readKey: READ_KEY });
      // 前後のテキストへの案内
      const i = LEARN.indexOf(t);
      const next = LEARN[i + 1]?.subject === t.subject ? LEARN[i + 1] : null;
      root.append(h('nav', { class: 'lr-next' },
        h('a', { class: 'btn ghost', href: '#learn' }, '‹ 一覧へ'),
        next ? h('a', { class: 'btn', href: `#learn/${next.id}` }, `次のテキスト：${next.name} ›`) : ''));
      window.scrollTo(0, 0);
    } else renderIndex();
  };
}
