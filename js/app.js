// 起動とページ切り替え
import { initTabs } from './ui/common.js';
import { initTheme, initClock, initBoot, initEyebrows, initHelp } from './ui/portal.js';
import { initHome, buildNav, buildPages, decorateNav } from './ui/home.js';
import { initPwa } from './ui/pwa.js';
import { initPallas } from './ui/pallas.js';
import { initPins, initFavorites, initNavFade, initSkipLink, focusAfterRoute } from './ui/nav.js';
import { MODULES } from './tools/index.js';
import { VERSION, BUILD_DATE } from './data/version.js';

const elVer = document.getElementById('appVersion');
if (elVer) { elVer.textContent = VERSION; elVer.title = `${VERSION}（${BUILD_DATE}）`; }
const onShow = {};
let pallas = null;

// moved: ページを移ったとき（初回表示以外）は、キーボード操作のフォーカスを新しいページへ移す
function route(moved = false) {
  const [page, arg] = (location.hash.slice(1) || 'home').split('/');
  const target = document.querySelector(`[data-page="${page}"]`) ? page : 'home';
  document.querySelectorAll('[data-page]').forEach((s) => (s.hidden = s.dataset.page !== target));
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === target));
  onShow[target]?.(arg ? decodeURIComponent(arg) : undefined);
  pallas?.onRoute(target);
  window.scrollTo(0, 0);
  if (moved) focusAfterRoute();
}

// ツールの一覧（js/tools/index.js）から、メニューとページを作る
buildNav();
buildPages(MODULES);

initBoot();
initPwa();
initTheme();
initClock();
initEyebrows();
decorateNav();
const navFade = initNavFade();
const pins = initPins(navFade);
onShow.favorites = initFavorites(pins);
initSkipLink();
initHome();
initHelp();
initTabs();
// 各ツールの初期化。1 つが失敗しても、ほかのツールは動くようにする
for (const m of MODULES) {
  try {
    const show = m.init?.();
    if (typeof show === 'function') onShow[m.meta.id] = show;
  } catch (e) {
    console.error(`ツール「${m.meta.name}」の初期化に失敗しました`, e);
  }
}
pallas = initPallas();
window.addEventListener('hashchange', () => route(true));
route();
