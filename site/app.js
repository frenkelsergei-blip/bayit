// Bayit site: language (Hebrew RTL / English LTR), theme, the film, chapters, screens and small stop-motion touches.
// A classic script (not a module) so the page also works when opened straight from disk; only the decorative
// sketch renderer is loaded as a module, and the page works without it.
(function () {

const root = document.documentElement;
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const reduced = () => reducedQuery.matches;
const store = {get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }};

const HE = {
  skip: 'דילוג לתוכן', navFeatures: 'מה יש', navScreens: 'מסכים', navTelegram: 'טלגרם', navOwn: 'המפתחות שלכם', navInstall: 'התקנה',
  kicker: 'קוד פתוח · עברית ואנגלית · התקנה משלכם', h1a: 'קצת יותר', h1b: 'ביחד.',
  lead: 'Bayit היא אפליקציית בית חמה לכל המשפחה: התוכנית של היום, לוח השנה, משימות ושגרות, קניות, הגיבורים של הילדים, כסף ובוט טלגרם. כל אחד רואה את מה שצריך, ולא יותר.',
  ctaDemo: 'לנסות את ההדגמה', ctaInstall: 'להתקין אצלכם', factLicense: 'חינמי וקוד פתוח', factLang: 'מימין לשמאל ומשמאל לימין', factKeysB: 'המפתחות שלכם', factKeys: 'Cloudflare או Docker',
  filmLabel: 'Bayit בדקה אחת', captions: 'כתוביות', soundOn: 'הפעלת קול', soundOff: 'השתקה', play: 'הפעלת הסרטון', pause: 'השהיית הסרטון', chaptersLabel: 'מעבר לחלק בסרטון',
  chToday: 'היום', chCalendar: 'לוח שנה', chTasks: 'משימות', chShopping: 'קניות', chKids: 'ילדים', chTelegram: 'טלגרם', chKeys: 'המפתחות שלכם',
  filmTextSummary: 'מה בסרטון', filmText: 'סיור מקריין עם מוזיקה מקורית. הקריינות בקול סינתטי (Azure AI Speech). הלוגו של Bayit מצויר בעיפרון ומתקפל מנייר. אחר כך סיור: מסך היום עם תזכורת שמגיעה לטלפון, לוח השבוע, משימות ושגרות, רשימת קניות משותפת, גיבורי הפיקסלים של הילדים, תזכורת בטלגרם שעונים עליה ב„בוצע”, הודעה לבוט שמוסיפה חלב וביצים אחרי „החלה”, וההתקנה והמפתחות של המשפחה. כל המסכים מציגים משפחה בדיונית.',
  featTitleA: 'כל מה שבית', featTitleB: 'מלהטט.', featLead: 'מקום משותף אחד לכל המשפחה, בעברית או באנגלית, בטלפון, בטאבלט ובמחשב, ביום ובלילה.',
  f1t: 'היום', f1d: 'סדר היום של המשפחה, הדברים הקטנים לעשות והשגרות של הילדים, בעמוד רגוע אחד שאתם מסדרים.',
  f2t: 'לוח שנה', f2d: 'שבוע, סדר יום וחודש, עם הצבע והתמונה של כל אחד, ואירועים חוזרים.',
  f3t: 'משימות ושגרות', f3d: 'לכל משימה יש אחראי, עדיפות ועד חמש תזכורות, ולילדים שגרות עם תורות, אישורים ונקודות.',
  f4t: 'קניות', f4d: 'כמה רשימות משותפות עם קטגוריות וכמויות, והצעות ממה שאתם קונים בדרך כלל.',
  f5t: 'ילדים · הגיבור שלי', f5d: 'גיבורים בפיקסלים לטפל בהם, גינה לגדל, משחקים ומתלבשים, שמרוויחים עם השגרות.',
  f6t: 'תזכורות בכל מקום', f6d: 'התראות בטלפון או במחשב, ובטלגרם, עם שעות שקטות ובלי כפילויות.',
  f7t: 'כסף ובית', f7d: 'ייבוא דפי חשבון של בנק לאומי ו־Max, עם בדיקה של כל סכום. ארוחות, מזווה, תחזוקה ומסמכים פרטיים.',
  f8t: 'לשאול את ה־AI', f8d: 'לבחירתכם Claude, OpenAI, Gemini, Grok או שירות תואם. הוא מכין שינויים, ושום דבר לא נשמר עד שלוחצים „החלה”.',
  f9t: 'פרטי מהיסוד', f9d: 'כל פתק, משימה ואירוע הם פרטיים, למשפחה או לאנשים שבחרתם. השרת אוכף את זה, וה־AI פועל לפי אותם כללים.',
  scrTitleA: 'רואים את זה', scrTitleB: 'בשפה שלכם.', scrLead: 'מסכים אמיתיים עם משפחה בדיונית. הם עוקבים אחרי השפה של הדף ומצב יום או לילה.', screensLabel: 'מסכים',
  tabToday: 'היום', tabCalendar: 'לוח שנה', tabTasks: 'משימות', tabShopping: 'קניות', tabKids: 'הגיבור שלי', tabMoney: 'הוצאות', tabAi: 'לשאול AI',
  tgTitleA: 'בוט משפחתי', tgTitleB: 'משלכם.', tgLead: 'מחברים בוט טלגרם משלכם, וכל אחד מקשר את הצ׳אט שלו. הבוט מדבר בשפה שבחרתם ב־Bayit.',
  tg1t: 'תזכורות שמוצאות אתכם', tg1d: 'משימות ואירועים מגיעים עם כפתורי „בוצע” ו„נודניק”, וסיכום בוקר של היום.',
  tg2t: 'פשוט תגידו לו', tg2d: 'בטקסט, בתמונה או בהודעה קולית הוא מוסיף, מזיז או מסיים משימות, אירועים, פריטי קניות ופתקים. כל שינוי ממתין ל„החלה” ואפשר לבטל אותו.',
  tg3t: 'שינויים, בזמן', tg3d: 'כשמישהו מזיז, משנה שם או מוחק משהו שמשויך אליכם, Bayit מספר לכם בטלגרם.', watch: 'לצפות בחלק הזה',
  kidsTitleA: 'גם בשביל', kidsTitleB: 'הקטנים.', kidsLead: 'לחצו על גיבור כדי למדוד את הכובע ואת גלימת הירח. הבגדים מופיעים בכל המסכים.',
  kNoa: 'נועה', kItai: 'איתי', kMaya: 'מאיה', kAri: 'ארי', kLia: 'ליה', kTom: 'תום',
  ownTitleA: 'הבית שלכם.', ownTitleB: 'המפתחות שלכם.', ownLead: 'אין שרת של חברת Bayit. כל משפחה מריצה עותק משלה עם החשבונות שלה. המפתחות מוצפנים בשרת שלכם ולא נשלחים בחזרה לדפדפן.',
  k1t: 'ההתקנה שלכם', k1d: 'בתוכנית החינמית של Cloudflare, או ב־Docker על מחשב בבית, NAS, ‏Raspberry Pi או שרת.',
  k2t: 'כניסה עם Google שלכם', k2d: 'כל אחד נכנס עם Google. הורה מזמין את השאר בקישורים חד־פעמיים.',
  k3t: 'מפתח AI משלכם', k3d: 'לא חובה. Claude, ‏OpenAI, ‏Gemini, ‏Grok או כל שירות תואם OpenAI, על חשבונכם.',
  k4t: 'בוט טלגרם משלכם', k4d: 'לא חובה. בוט משלכם, כך שההודעות של המשפחה עוברות רק דרכו.',
  insTitleA: 'מתקינים', insTitleB: 'בצהריים אחד.', insLead: 'בחרו איפה ה־Bayit של המשפחה יגור. בשני המקרים זו אותה אפליקציה, עם אותם כללי פרטיות והצפנה.', installLabel: 'דרכי התקנה', tabAgent: 'עם סוכן AI',
  cfLead: 'ברירת המחדל: אין שרת לתחזק, והתוכנית החינמית מספיקה למשפחה. צריך חשבון Cloudflare ולקוח כניסה של Google.',
  cf1: 'מורידים את הקוד', cf2: 'יוצרים מסד נתונים, אחסון קבצים ואתר', cf3: 'מוסיפים סודות ומפרסמים', cfGuide: 'המדריך המלא ל־Cloudflare',
  dkLead: 'רץ על כל דבר עם Docker ‏(amd64 או arm64): מחשב בבית, NAS, ‏Raspberry Pi 4 או 5, או שרת קטן. הודעות קוליות דורשות כרגע Cloudflare; כל השאר עובד.',
  dk1: 'מפעילים', dk2: 'מסתכלים מסביב עם מידע לדוגמה', dk3: 'נותנים לו כתובת https בשביל כניסה עם Google וטלגרם', dk3d: 'דומיין משלכם עם HTTPS אוטומטי, או מנהרה. המדריך מסביר את שתי הדרכים.', dkGuide: 'המדריך המלא ל־Docker',
  agLead: 'במאגר יש כישורים (skills) לסוכני קוד. פתחו אותו ב־Claude Code, ב־Codex או בסוכן אחר שקורא כישורים, ובקשו:',
  ag1: '„תתקין את Bayit על ה־Cloudflare שלי”', ag2: '„תריץ את Bayit עם Docker על ה־Raspberry Pi שלי”', ag3: '„תעזור לי לחבר את טלגרם”', ag4: '„תעדכן את ה־Bayit שלי”', agLink: 'לכישורים',
  footer: 'Bayit חינמית וקוד פתוח ברישיון MIT. נבנתה למשפחות עמוסות.', credits: 'קרדיטים ורישיונות', fictional: 'המסכים והסרטון מציגים משפחה בדיונית.',
  themeToDark: 'מעבר למצב לילה', themeToLight: 'מעבר למצב יום',
};
const EN_ARIA = {captions: 'Captions', filmLabel: 'Bayit in one minute', soundOn: 'Sound on', soundOff: 'Mute', play: 'Play the video', pause: 'Pause the video', chaptersLabel: 'Jump to a part of the video', screensLabel: 'Screens', installLabel: 'Ways to install', themeToDark: 'Switch to night mode', themeToLight: 'Switch to day mode'};
const SHOT_ALT = {
  en: {today: 'Today', calendar: 'Calendar week', tasks: 'Tasks', shopping: 'Shopping list', kids: 'My Hero', money: 'Expenses', ai: 'Ask AI', desktop: 'on a computer', phone: 'on a phone'},
  he: {today: 'היום', calendar: 'לוח שבועי', tasks: 'משימות', shopping: 'רשימת קניות', kids: 'הגיבור שלי', money: 'הוצאות', ai: 'לשאול AI', desktop: 'במחשב', phone: 'בטלפון'},
};

// Keep the English text that is in the HTML so switching back needs no second dictionary.
const english = new Map();
document.querySelectorAll('[data-i18n]').forEach(el => english.set(el, el.innerHTML));

const lang = () => root.lang === 'he' ? 'he' : 'en';
const theme = () => root.dataset.theme || (darkQuery.matches ? 'dark' : 'light');
const word = key => lang() === 'he' ? HE[key] : EN_ARIA[key];

function applyLanguage(next) {
  root.lang = next; root.dir = next === 'he' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.dataset.i18n; el.innerHTML = next === 'he' && HE[k] ? HE[k] : english.get(el); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { const v = word(el.dataset.i18nAria); if (v) el.setAttribute('aria-label', v); });
  const toggle = document.getElementById('lang');
  toggle.textContent = next === 'he' ? 'English' : 'עברית'; toggle.lang = next === 'he' ? 'en' : 'he';
  document.title = next === 'he' ? 'Bayit · קצת יותר ביחד' : 'Bayit · A little more together';
  syncThemeButton(); syncFilm(); syncShots(); syncSound();
}

function syncThemeButton() { document.getElementById('theme').setAttribute('aria-label', word(theme() === 'dark' ? 'themeToLight' : 'themeToDark')); }

document.getElementById('lang').addEventListener('click', () => { const next = lang() === 'he' ? 'en' : 'he'; store.set('bayit-site-lang', next); applyLanguage(next); });
document.getElementById('theme').addEventListener('click', () => {
  const next = theme() === 'dark' ? 'light' : 'dark'; root.dataset.theme = next; store.set('bayit-site-theme', next);
  syncThemeButton(); syncFilm(); syncShots(); sketch.refresh();
});
darkQuery.addEventListener('change', () => { if (!root.dataset.theme) { syncThemeButton(); syncFilm(); syncShots(); sketch.refresh(); } });

// ---------- the film ----------
const film = document.getElementById('film'), playButton = document.getElementById('film-play');
let filmVariant = '', userPaused = false;
function syncFilm() {
  const variant = `${lang()}-${theme()}`;
  if (variant === filmVariant) return;
  const time = film.currentTime || 0, wasPlaying = !film.paused;
  filmVariant = variant;
  film.poster = `media/bayit-${variant}-poster.jpg`;
  film.innerHTML = `<source src="media/bayit-${variant}.mp4" type="video/mp4">` +
    `<track kind="captions" src="media/bayit-${lang()}.vtt" srclang="${lang()}" label="${lang() === 'he' ? 'עברית' : 'English'}">`;
  film.load();
  if (time) film.addEventListener('loadedmetadata', () => { film.currentTime = time; }, {once: true});
  if (wasPlaying) film.play().catch(() => {});
}
function showPlay(visible) { playButton.hidden = !visible; }
// Our own controls replace the native ones (kept in the HTML for when this script does not run).
film.removeAttribute('controls');
// Some browsers claim a format and then fail to decode it: drop the failing source and try the next one.
film.addEventListener('error', () => {
  const sources = [...film.querySelectorAll('source')]; if (sources.length < 2) return;
  const failed = sources.find(x => film.currentSrc && x.src === film.currentSrc) || sources[0];
  const time = film.currentTime, playing = !userPaused; failed.remove(); film.load();
  film.addEventListener('loadedmetadata', () => { if (time) film.currentTime = time; }, {once: true});
  if (playing && !reduced()) film.play().catch(() => showPlay(true));
}, true);
// Browsers only autoplay muted video. "Sound on" unmutes and starts the narration from the top.
const soundButton = document.getElementById('film-sound');
function syncSound() {
  soundButton.setAttribute('aria-pressed', String(!film.muted));
  soundButton.querySelector('span').textContent = word(film.muted ? 'soundOn' : 'soundOff');
}
soundButton.addEventListener('click', () => {
  film.muted = !film.muted;
  if (!film.muted) { if (film.currentTime > 2) film.currentTime = 0; userPaused = false; film.play().catch(() => {}); }
  syncSound();
});
film.addEventListener('volumechange', syncSound);
const ccButton = document.getElementById('film-cc');
let captionsOn = false;
function syncCaptions() { const tr = film.textTracks[0]; if (tr) tr.mode = captionsOn ? 'showing' : 'hidden'; ccButton.setAttribute('aria-pressed', String(captionsOn)); }
ccButton.addEventListener('click', () => { captionsOn = !captionsOn; syncCaptions(); });
film.addEventListener('loadedmetadata', syncCaptions);
playButton.addEventListener('click', () => { userPaused = false; film.play().catch(() => {}); });
film.addEventListener('play', () => showPlay(false));
film.addEventListener('pause', () => showPlay(true));
film.addEventListener('click', () => { if (film.paused) { userPaused = false; film.play().catch(() => {}); } else { userPaused = true; film.pause(); } });
const saveData = navigator.connection?.saveData;
showPlay(true);
new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting) { if (!reduced() && !saveData && !userPaused) film.play().catch(() => showPlay(true)); }
  else if (!film.paused) film.pause();
}, {threshold: .35}).observe(film);

const chapterButtons = [...document.querySelectorAll('.chapters button')];
function seek(t) { film.currentTime = t; userPaused = false; film.play().catch(() => {}); film.scrollIntoView({behavior: reduced() ? 'auto' : 'smooth', block: 'center'}); }
document.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => seek(+b.dataset.t)));
film.addEventListener('timeupdate', () => {
  const t = film.currentTime; let current = null;
  chapterButtons.forEach(b => { if (t >= +b.dataset.t) current = b; });
  chapterButtons.forEach(b => b.setAttribute('aria-current', String(b === current)));
});

// ---------- screens ----------
let shot = 'today';
const stage = document.querySelector('.stage');
function syncShots(animate = false) {
  const l = lang(), th = theme(), alt = SHOT_ALT[l];
  const d = document.getElementById('shot-desktop'), p = document.getElementById('shot-phone');
  const swap = () => {
    d.src = `assets/shots/${shot}-desktop-${l}-${th}.webp`; d.alt = `Bayit · ${alt[shot]} ${alt.desktop}`;
    p.src = `assets/shots/${shot}-phone-${l}-${th}.webp`; p.alt = `Bayit · ${alt[shot]} ${alt.phone}`;
  };
  if (!animate || reduced()) return swap();
  stage.classList.remove('flip'); void stage.offsetWidth; stage.classList.add('flip');
  setTimeout(swap, 190);
}
function tabs(list, onSelect) {
  const buttons = [...list.querySelectorAll('[role=tab]')];
  buttons.forEach((b, i) => {
    b.addEventListener('click', () => { buttons.forEach(x => x.setAttribute('aria-selected', String(x === b))); onSelect(b); });
    b.addEventListener('keydown', e => {
      const step = {ArrowRight: 1, ArrowLeft: -1}[e.key]; if (!step) return;
      const next = buttons[(i + step * (root.dir === 'rtl' ? -1 : 1) + buttons.length) % buttons.length]; next.focus(); next.click();
    });
  });
}
tabs(document.querySelector('.screens .tabs'), b => { shot = b.dataset.shot; syncShots(true); });
tabs(document.querySelector('.install .tabs'), b => { document.querySelectorAll('.pane').forEach(p => { p.hidden = p.id !== 'pane-' + b.dataset.pane; }); });

// ---------- kids: outfits swap frame by frame ----------
const outfits = ['', '-cap', '-cape'];
document.querySelectorAll('.crew button').forEach((b, i) => {
  let o = 0; const img = b.querySelector('img');
  const set = n => { o = n % 3; img.src = `assets/kids/${b.dataset.kid}${outfits[o]}.webp`; };
  b.addEventListener('click', () => set(o + 1));
  b.setAttribute('aria-label', b.textContent.trim());
  b._set = set; b._next = () => set(o + 1);
});
let crewTimer = 0;
function crewCycle() {
  clearInterval(crewTimer); if (reduced()) return;
  const kids = [...document.querySelectorAll('.crew button')]; let k = 0;
  crewTimer = setInterval(() => { if (document.hidden) return; kids[k % kids.length]._next(); k += 5; }, 700);
}

// ---------- stop-motion reveals ----------
const revealer = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); } }), {rootMargin: '0px 0px -8% 0px'});
document.querySelectorAll('.reveal').forEach(el => revealer.observe(el));

// ---------- the app's own paper sketch, drawn live behind the hero ----------
let createMaterials = null, renderSketchFrame = null;
const sketch = (() => {
  const canvas = document.querySelector('.hero .sketch'), ctx = canvas.getContext('2d');
  let images = null, materials = null, w = 0, h = 0, clock = performance.now(), frame = -1, raf = 0, visible = true;
  let scene = {id: 'horizon', seed: 37, mirror: false};
  function size() {
    const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    if (!box.width) return;
    if (box.width === w && box.height === h) return;
    w = box.width; h = box.height; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); frame = -1;
  }
  function refresh() { if (images) materials = {...createMaterials(ctx, images, theme() === 'dark'), night: theme() === 'dark'}; frame = -1; if (reduced()) draw(performance.now()); }
  function draw(now) {
    if (!materials) return;
    size();
    let seconds = (now - clock) / 1000;
    if (seconds >= 9) { const n = (scene.n || 0) + 1; scene = {id: 'horizon', n, seed: 37 + n * 71, mirror: n % 2 === 1}; clock = now; seconds = 0; } // the app's horizon scene, re-seeded each cycle
    const f = Math.floor(seconds * 24);
    if (f !== frame || reduced()) {
      renderSketchFrame(ctx, {width: w, height: h, seconds: reduced() ? 4 : seconds, scene: {...scene, mirror: scene.mirror !== (root.dir === 'rtl')}, materials, reduced: reduced()});
      frame = f;
    }
  }
  function loop(now) { draw(now); if (!reduced() && visible && !document.hidden) raf = requestAnimationFrame(loop); }
  function start() { cancelAnimationFrame(raf); if (reduced()) draw(performance.now()); else raf = requestAnimationFrame(loop); }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }, {threshold: 0}).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) start(); });
  addEventListener('resize', () => { size(); if (reduced()) draw(performance.now()); });
  Promise.all([import('./assets/js/sketch-renderer.js'), ...['cobalt', 'yellow'].map(n => new Promise((res, rej) => { const i = new Image(); i.onload = () => res([n, i]); i.onerror = rej; i.src = `assets/paper/paper-${n}-small.webp`; }))])
    .then(([lib, ...list]) => { createMaterials = lib.createMaterials; renderSketchFrame = lib.renderSketchFrame; images = Object.fromEntries(list); refresh(); clock = performance.now(); start(); })
    .catch(() => { /* decorative only */ });
  return {refresh, start};
})();

reducedQuery.addEventListener('change', () => { sketch.start(); crewCycle(); if (reduced() && !film.paused) film.pause(); });

applyLanguage(lang());
crewCycle();
requestAnimationFrame(() => root.classList.add('ready'));
})();
