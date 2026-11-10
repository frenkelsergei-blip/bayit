// Connection registry (Modular Bayit, work packages 1.2 and 1.3, 2026-11-10): every outside account Bayit uses, in one list.
// Settings › Accounts & connections renders from it (concept A, "quiet checklist", AGENTS.md), and first-run setup reads
// the guides (SETUP_GUIDES in shared/setup-guides.mjs is derived from here). Live status and the panel for each id stay
// in the client (app/src/connections-hub.jsx); an extension registers its panel in app/src/extensions/connection-panels.jsx.
// Extensions add entries in shared/extensions/connections.mjs, never here.
//
// An entry:
//  id           lowercase id, also the row's anchor (#connection-<id>) and ?open=<id>
//  group        one of CONNECTION_GROUPS: 'start' (the To start checklist; never optional, counted in its bar),
//               'more' (More connections, optional) or 'about' (About this installation; not a connection to set up)
//  icon, tone   Phosphor icon name for the row and its colour tone; iconWeight 'fill' for a filled logo
//  name, description  {en,he}; description is the row's one plain line
//  optional     an optional connection; it is never counted, so it cannot be in 'start'
//  manage       'household': a parent sets it up once; 'person': each person connects their own
//  feature      the feature (shared/features.mjs) it belongs to; when that feature is off for a person, the row is gone
//  adultsOnly   children never see the row
//  setupId      the key first-run setup uses for its guide, when it differs from id
//  action       'about' rows only: the label of the row's one link {en,he}
//  guide        {icon,en,he,why,need,supported?,unsupported?,warning?,intro?,steps,then?,note?}; required except in 'about'.
//               A step is [title, text, ...actions]; an action is {link:'https://…'} for an outside page, {card:id} to
//               open a connection's window (inside that window, the step holds its form instead), or {route:'…'}.
//               warning {title,text} opens the guide in a yellow box; intro is one plain line before the steps;
//               then [title,text] is a greyed "later" step after them; note is the window's footer line.
//  personal     optional second guide {en,he,why,need,steps,note} for people who only link their own part
//               (Telegram: "My Telegram chat" for everyone but parents).
import {joinRegistry} from './extension-registry.mjs';
import {FEATURE_IDS} from './features.mjs';
import {EXTRA_CONNECTIONS} from './extensions/connections.mjs';

const DOCS='https://github.com/frenkelsergei-blip/bayit/blob/main/docs/';

export const CONNECTION_GROUPS=[
 {id:'start',icon:'ListChecks',tone:'blue',name:{en:'To start',he:'להתחלה'}},
 {id:'more',icon:'PlugsConnected',tone:'green',name:{en:'More connections',he:'עוד חיבורים'},note:{en:'Optional · you can skip',he:'לא חובה · אפשר לדלג'},
  intro:{en:'Bayit works well without them. Add one only if it helps you.',he:'Bayit עובד מצוין גם בלעדיהם. מוסיפים רק אם זה מועיל לכם.'}},
 {id:'about',icon:'Info',tone:'lilac',name:{en:'About this installation',he:'על ההתקנה הזו'}},
];

const CODE_SAFE={en:'It is kept encrypted in your home and never shown again.',he:'הקוד נשמר מוצפן בבית שלכם ולא יוצג שוב.'};
const CHECK={en:'Check before saving',he:'בדיקה לפני שמירה'};

const CORE_CONNECTIONS=[
 {id:'ai',group:'start',icon:'Sparkle',iconWeight:'fill',tone:'ai',manage:'household',feature:'ai',
  name:{en:'AI helper',he:'עוזר AI'},
  description:{en:'Ask questions about your home and get suggestions you approve.',he:'שואלים שאלות על הבית ומקבלים הצעות שאתם מאשרים.'},
  guide:{icon:'Sparkle',en:'AI helper',he:'עוזר AI',
   why:{en:'Ask questions about your home and get suggestions you approve first.',he:'שואלים שאלות על הבית ומקבלים הצעות שאתם מאשרים קודם.'},
   warning:{title:{en:'A ChatGPT Plus or Claude Pro subscription is not a connection code.',he:'מנוי ChatGPT Plus או Claude Pro הוא לא קוד חיבור.'},
    text:{en:'The subscription is for chatting on their website. Bayit needs a separate developer account with the provider, with credit you add in advance. A typical family spends about $1–5 a month.',he:'המנוי מיועד לצ׳אט באתר שלהם. ל־Bayit צריך חשבון מפתחים נפרד אצל הספק, עם יתרה שמטעינים מראש. משפחה רגילה מוציאה בערך 1–5 דולר בחודש.'}},
   need:[['Clock',{en:'About 5 minutes',he:'בערך 5 דקות'}],['Wallet',{en:'You pay the provider per use',he:'משלמים לספק לפי שימוש'}],['Key',{en:'A connection code (API key)',he:'קוד חיבור (API key)'}]],
   supported:[{en:'Claude (Anthropic)',he:'Claude (Anthropic)'},{en:'OpenAI',he:'OpenAI'},{en:'Google Gemini',he:'Google Gemini'},{en:'xAI Grok',he:'xAI Grok'},{en:'Any OpenAI-compatible service at an https address',he:'כל שירות תואם OpenAI בכתובת https'}],
   unsupported:[{en:'A ChatGPT or Claude chat subscription',he:'מנוי צ׳אט של ChatGPT או Claude'},{en:'A free account without credit',he:'חשבון חינמי בלי יתרה'}],
   steps:[[{en:'Choose a provider',he:'בחרו ספק'},{en:'Not sure? Claude or OpenAI are the simplest to start with.',he:'לא בטוחים? Claude או OpenAI הכי פשוטים להתחלה.'}],
    [{en:'Create a connection code on the provider’s site',he:'צרו קוד חיבור באתר של הספק'},{en:'Add a little credit there, for example $5, and set a monthly limit.',he:'מטעינים שם יתרה קטנה, למשל 5 דולר, ומגדירים תקרה חודשית.'},{link:'https://console.anthropic.com/settings/keys',en:'Claude’s site',he:'לאתר של Claude'},{link:'https://platform.openai.com/api-keys',en:'OpenAI’s site',he:'לאתר של OpenAI'}],
    [{en:'Paste the code here',he:'הדביקו כאן את הקוד'},CODE_SAFE,{card:'ai',en:'Open the AI helper',he:'לעוזר ה־AI'}],
    [CHECK,{en:'Bayit asks the provider a small question. Nothing is saved until the check passes.',he:'Bayit שולח שאלה קטנה לספק. שום דבר לא נשמר עד שהבדיקה עוברת.'}]]}},
 {id:'telegram',group:'start',icon:'TelegramLogo',tone:'telegram',manage:'household',feature:'telegram',
  name:{en:'Telegram',he:'טלגרם'},
  description:{en:'Reminders, a morning summary and quick adds from your phone.',he:'תזכורות, סיכום בוקר והוספה מהירה מהטלפון.'},
  guide:{icon:'TelegramLogo',en:'Telegram',he:'טלגרם',
   why:{en:'Reminders, a morning summary and quick adds from your phone.',he:'תזכורות, סיכום בוקר והוספה מהירה מהטלפון.'},
   need:[['Clock',{en:'About 3 minutes',he:'בערך 3 דקות'}],['Wallet',{en:'Free',he:'חינם'}],['User',{en:'A Telegram account',he:'חשבון טלגרם'}]],
   intro:{en:'A parent creates the home bot once. Then each person links only their own chat.',he:'הורה יוצר את בוט הבית פעם אחת. אחר כך כל אחד מקשר רק את הצ׳אט שלו.'},
   steps:[[{en:'Open BotFather in Telegram',he:'פתחו את BotFather בטלגרם'},{en:'It’s Telegram’s official bot for creating bots.',he:'זה הבוט הרשמי של טלגרם ליצירת בוטים.'},{link:'https://t.me/BotFather',en:'Open BotFather',he:'פתיחת BotFather'}],
    [{en:'Send /newbot and pick a name',he:'שלחו ‎/newbot ובחרו שם'},{en:'For example “Levi home”. The username must end with “bot”.',he:'למשל ״הבית של לוי״. שם המשתמש חייב להסתיים ב־bot.'}],
    [{en:'Paste the code you received here',he:'הדביקו כאן את הקוד שקיבלתם'},CODE_SAFE,{card:'telegram',en:'Open Telegram',he:'לטלגרם'}],
    [CHECK,{en:'Bayit makes sure with Telegram that the bot answers, and only then saves.',he:'Bayit מוודא מול טלגרם שהבוט עונה, ורק אז שומר.'}]],
   then:[{en:'Later: each person links their own chat',he:'אחר כך: כל אחד מקשר את הצ׳אט שלו'},{en:'You can send each family member a link from here.',he:'תוכלו לשלוח קישור לכל בן משפחה מכאן.'}],
   note:{en:'Messages include only what each person may see',he:'הודעות כוללות רק מה שכל אחד רשאי לראות'}},
  personal:{en:'My Telegram chat',he:'הצ׳אט שלי בטלגרם',
   why:{en:'Reminders and a morning summary straight to your phone.',he:'תזכורות וסיכום בוקר ישירות לטלפון שלך.'},
   need:[['Clock',{en:'One minute',he:'דקה אחת'}],['Wallet',{en:'Free',he:'חינם'}],['DeviceMobile',{en:'Telegram on your phone',he:'טלגרם בטלפון'}]],
   steps:[[{en:'Tap “Link my chat”',he:'לחצו ״קישור הצ׳אט שלי״'},{en:'Telegram opens with the home bot.',he:'טלגרם ייפתח עם בוט הבית.'}],
    [{en:'In Telegram, tap Start',he:'בטלגרם, לחצו Start'},{en:'That’s all. The link works once, for 30 minutes.',he:'זה הכול. הקישור חד־פעמי ותקף ל־30 דקות.'}],
    [{en:'Come back here',he:'חזרו לכאן'},{en:'You’ll see “Linked”, and the bot says hello in Telegram.',he:'תראו ״מקושר״, והבוט יגיד שלום בטלגרם.'}]],
   note:{en:'Telegram is not used to sign in to Bayit',he:'טלגרם לא משמש לכניסה ל־Bayit'}}},
 {id:'family',group:'start',icon:'UsersThree',tone:'family',manage:'household',
  name:{en:'Family members',he:'בני המשפחה'},
  description:{en:'Each adult signs in with their own Google account; children can be profiles.',he:'כל מבוגר נכנס עם חשבון Google משלו; ילדים יכולים להיות פרופילים.'},
  guide:{icon:'UserPlus',en:'Family members',he:'בני המשפחה',
   why:{en:'Each adult signs in with their own Google account; nobody shares passwords. Kids can be profiles without an account.',he:'כל מבוגר נכנס עם חשבון Google משלו; אף אחד לא משתף סיסמאות. ילדים יכולים להיות פרופילים בלי חשבון.'},
   need:[['Clock',{en:'1 minute per person',he:'דקה לכל אחד'}],['Wallet',{en:'Free',he:'חינם'}]],
   steps:[[{en:'Create an invitation',he:'צרו הזמנה'},{en:'One link per person, single use, with an expiry.',he:'קישור אחד לכל אדם, לשימוש חד־פעמי ועם תוקף.'},{route:'settings/family',en:'Open Family',he:'למשפחה'}],
    [{en:'Send it to them',he:'שלחו להם'},{en:'They open it and sign in with their own Google account.',he:'הם פותחים אותו ונכנסים עם חשבון Google משלהם.'}],
    [{en:'Add the kids',he:'הוסיפו את הילדים'},{en:'Children can be profiles you manage, without an account of their own.',he:'ילדים יכולים להיות פרופילים שאתם מנהלים, בלי חשבון משלהם.'}]]}},
 {id:'maps',group:'more',icon:'MapPin',tone:'soft',optional:true,manage:'household',
  name:{en:'Google Maps',he:'Google Maps'},
  description:{en:'Address search and a small map on events and tasks. A place name you type works without it.',he:'חיפוש כתובת ומפה קטנה באירועים ובמשימות. שם מקום שמקלידים עובד גם בלי.'},
  guide:{icon:'MapPin',en:'Google Maps',he:'Google Maps',
   why:{en:'Optional. Address search and a small map for events and tasks. A place name you type works without it.',he:'אופציונלי. חיפוש כתובות ומפה קטנה לאירועים ולמשימות. שם מקום שמקלידים עובד גם בלי.'},
   need:[['Clock',{en:'About 10 minutes',he:'בערך 10 דקות'}],['Wallet',{en:'Google may charge beyond its free quota',he:'Google עשויה לחייב מעבר למכסה החינמית'}],['Key',{en:'Two connection codes (API keys)',he:'שני קודי חיבור (API keys)'}]],
   steps:[[{en:'Create two codes in Google Cloud',he:'צרו שני קודים ב־Google Cloud'},{en:'A server code for Places API (New) and a website code for Maps Embed API.',he:'קוד שרת ל־Places API (New) וקוד אתר ל־Maps Embed API.'},{link:DOCS+'locations.md',en:'Open the Maps guide',he:'למדריך המפות'}],
    [{en:'Paste both codes and check',he:'הדביקו את שני הקודים ובדקו'},{en:'Bayit makes a test search before saving.',he:'Bayit מבצע חיפוש בדיקה לפני השמירה.'},{card:'maps',en:'Open Google Maps',he:'ל־Google Maps'}]]}},
 {id:'google-calendar',group:'more',icon:'CalendarDots',tone:'soft',optional:true,manage:'person',adultsOnly:true,
  name:{en:'Google Calendar',he:'Google Calendar'},
  description:{en:'Share availability or sync chosen events.',he:'שיתוף זמינות או סנכרון אירועים נבחרים.'},
  guide:{icon:'CalendarDots',en:'Google Calendar',he:'Google Calendar',
   why:{en:'Share availability or choose individual events to sync.',he:'שיתוף זמינות או בחירת אירועים בודדים לסנכרון.'},
   need:[['User',{en:'Your own Google account',he:'חשבון Google משלכם'}],['Wallet',{en:'Free',he:'חינם'}]],
   steps:[[{en:'Continue to Google',he:'המשך ל־Google'},{en:'Each adult connects their own calendar from their Bayit account. Continue to Google, choose your account and approve the permissions you want to use.',he:'כל מבוגר מחבר את היומן שלו מתוך החשבון שלו בבַּיִת. המשיכו ל־Google, בחרו את החשבון האישי ואשרו את ההרשאות שבחרתם.'},{card:'google-calendar',en:'Open Google Calendar',he:'ל־Google Calendar'}],
    [{en:'Availability only',he:'זמינות בלבד'},{en:'For availability only, leave both boxes clear. Bayit checks busy times on your primary calendar.',he:'לזמינות בלבד, השאירו את שתי האפשרויות ללא סימון. בַּיִת בודק חלונות תפוסים ביומן הראשי שלכם.'}]]}},
 {id:'riseup',group:'more',icon:'Bank',tone:'soft',optional:true,manage:'person',feature:'expenses',adultsOnly:true,
  name:{en:'RiseUp',he:'RiseUp'},
  description:{en:'Brings bank and card transactions into Expenses, about once an hour.',he:'מביא תנועות בנק ואשראי להוצאות, בערך פעם בשעה.'},
  guide:{icon:'Bank',en:'Bank and cards (RiseUp)',he:'בנק וכרטיסים (RiseUp)',
   why:{en:'Optional. Brings bank and card transactions into Expenses; you can also import statements or enter them yourself.',he:'אופציונלי. מביא תנועות בנק וכרטיסים להוצאות; אפשר גם לייבא דפי חשבון או להזין בעצמכם.'},
   need:[['Clock',{en:'About 3 minutes',he:'בערך 3 דקות'}],['User',{en:'An existing RiseUp account',he:'חשבון RiseUp קיים'}]],
   unsupported:[{en:'Direct bank sign-in inside Bayit',he:'התחברות ישירה לבנק מתוך Bayit'}],
   steps:[[{en:'Create a connection code in RiseUp',he:'צרו קוד חיבור ב־RiseUp'},{en:'Tick “תקציב” (budget), and “יתרות בנק” for balances.',he:'סמנו ״תקציב״, ו״יתרות בנק״ ליתרות.'},{link:'https://input.riseup.co.il/developer/tokens',en:'Open RiseUp',he:'ל־RiseUp'}],
    [{en:'Paste it and choose who sees it',he:'הדביקו ובחרו מי רואה'},{en:'Both parents, or only you. Children never see expenses.',he:'שני ההורים, או רק אתם. ילדים לעולם לא רואים הוצאות.'},{card:'riseup',en:'Open RiseUp',he:'ל־RiseUp'}]]}},
 {id:'account',group:'about',icon:'GoogleLogo',tone:'google',manage:'person',
  name:{en:'Your account',he:'החשבון שלכם'},
  description:{en:'How you sign in. Each person uses their own Google account; nobody shares passwords.',he:'כך מתחברים. כל אחד משתמש בחשבון Google שלו; אף אחד לא משתף סיסמאות.'},
  action:{en:'Devices & security',he:'מכשירים ואבטחה'}},
 {id:'storage',group:'about',icon:'Database',tone:'storage',manage:'household',setupId:'hosting',
  name:{en:'Where the data lives',he:'איפה הנתונים נשמרים'},
  description:{en:'Where your family’s data and files are kept: your own installation, not ours.',he:'איפה נשמרים הנתונים והקבצים של המשפחה: בהתקנה שלכם, לא אצלנו.'},
  action:{en:'Installation details',he:'פרטי ההתקנה'},
  guide:{icon:'HardDrives',en:'Where Bayit runs',he:'איפה Bayit רץ',
   why:{en:'Bayit is open source. It runs on an account you own; nobody hosts your family’s data for you.',he:'Bayit הוא קוד פתוח. הוא רץ על חשבון שלכם; אף אחד לא מאחסן בשבילכם את המידע של המשפחה.'},
   need:[['Wallet',{en:'Free plan is enough',he:'התוכנית החינמית מספיקה'}],['Clock',{en:'Already done',he:'כבר מוכן'}]],
   supported:[{en:'Cloudflare (recommended; the free plan is enough)',he:'Cloudflare (מומלץ; התוכנית החינמית מספיקה)'},{en:'Docker on your computer, NAS, Raspberry Pi or a cloud server',he:'Docker על המחשב, NAS, Raspberry Pi או שרת בענן'}],
   unsupported:[{en:'Static-only hosting (GitHub Pages, Netlify or Vercel static sites)',he:'אחסון סטטי בלבד (GitHub Pages, ‏Netlify או Vercel סטטי)'},{en:'Shared PHP web hosting',he:'אחסון אתרים משותף (PHP)'},{en:'A Bayit-hosted account: there is none, by design',he:'חשבון שמאוחסן אצלנו: אין כזה, בכוונה'}],
   steps:[[{en:'Keep a backup',he:'שמרו גיבוי'},{en:'Your database and files live in your account. The guide shows how to back up and restore.',he:'מסד הנתונים והקבצים נמצאים בחשבון שלכם. המדריך מראה איך לגבות ולשחזר.'},{link:DOCS+'updating-and-backups.md',en:'Open the backup guide',he:'למדריך הגיבוי'}],
    [{en:'Moving to Docker or another computer?',he:'עוברים ל־Docker או למחשב אחר?'},{en:'The Docker guide covers a home computer, NAS, Raspberry Pi or a cloud server, with HTTPS and updates.',he:'מדריך Docker מכסה מחשב ביתי, NAS, ‏Raspberry Pi או שרת בענן, כולל HTTPS ועדכונים.'},{link:DOCS+'self-hosting-docker.md',en:'Open the Docker guide',he:'למדריך Docker'}],
    [{en:'Updates',he:'עדכונים'},{en:'Settings › About & updates tells you when a new version is ready.',he:'הגדרות › אודות ועדכונים מודיע כשיש גרסה חדשה.'}]]}},
];

const lang=o=>!!(o&&typeof o.en==='string'&&o.en.trim()&&typeof o.he==='string'&&o.he.trim());
const actionOK=x=>x&&lang(x)&&(typeof x.link==='string'?x.link.startsWith('https://'):typeof x.card==='string'||typeof x.route==='string');
const guideProblem=g=>{
 if(!g||typeof g.icon!=='string'||!lang(g)||!lang(g.why))return 'guide needs an icon, a title and "why" in English and Hebrew.';
 if(!Array.isArray(g.steps)||!g.steps.length)return 'guide needs at least one step.';
 for(const step of [...g.steps,...(g.then?[g.then]:[])]){if(!Array.isArray(step)||!lang(step[0])||!lang(step[1]))return 'each guide step needs a title and text in English and Hebrew.';
  for(const x of step.slice(2))if(!actionOK(x))return 'a guide action must be {link:"https://…"}, {card:id} or {route:…} with English and Hebrew text.'}
 for(const key of ['need','supported','unsupported'])if(g[key]!==undefined&&!Array.isArray(g[key]))return 'guide.'+key+' must be a list.';
 if(g.warning!==undefined&&!(lang(g.warning.title)&&lang(g.warning.text)))return 'guide.warning needs a title and text in English and Hebrew.';
 for(const key of ['intro','note'])if(g[key]!==undefined&&!lang(g[key]))return 'guide.'+key+' needs English and Hebrew.';
 return '';
};
// Returns '' when the entry is valid, otherwise what is wrong (used for core and extension entries alike).
export function connectionProblem(c,all=[]){
 if(!CONNECTION_GROUPS.some(g=>g.id===c.group))return 'group must be one of '+CONNECTION_GROUPS.map(g=>g.id).join(', ')+'.';
 if(typeof c.icon!=='string'||!/^[A-Z]\w+$/.test(c.icon))return 'icon must be a Phosphor icon name such as "PlugsConnected".';
 if(!lang(c.name)||!lang(c.description))return 'name and description need English and Hebrew.';
 if(!['household','person'].includes(c.manage))return 'manage must be "household" (a parent, once) or "person" (each person).';
 if(c.feature!==undefined&&!FEATURE_IDS.includes(c.feature))return 'feature "'+c.feature+'" is not in shared/features.mjs.';
 if(c.setupId!==undefined&&(typeof c.setupId!=='string'||all.some(o=>o!==c&&(o.setupId||o.id)===c.setupId)))return 'setupId must be unique.';
 if(c.optional&&c.group==='start')return 'an optional connection is never counted, so it cannot be in "start"; use "more".';
 if(c.group==='about'&&!lang(c.action))return '"about" rows need an action label in English and Hebrew.';
 if(c.group!=='about'||c.guide!==undefined){const problem=guideProblem(c.guide);if(problem)return problem}
 if(c.personal!==undefined){const problem=guideProblem({icon:'User',...c.personal});if(problem)return 'personal '+problem}
 return '';
}

export const CONNECTIONS=joinRegistry('connection',CORE_CONNECTIONS,EXTRA_CONNECTIONS,connectionProblem);
export const CONNECTION_IDS=CONNECTIONS.map(c=>c.id);
export const connectionById=id=>CONNECTIONS.find(c=>c.id===id);
// First-run setup's guides, keyed as setup knows them (storage → hosting).
export const connectionGuides=()=>Object.fromEntries(CONNECTIONS.filter(c=>c.guide).map(c=>[c.setupId||c.id,c.guide]));
// The rows a group shows, in registry order.
export const connectionsIn=group=>CONNECTIONS.filter(c=>c.group===group);
