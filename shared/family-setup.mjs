// First-run setup (user decision 2026-11-09): questions first, then suggested features from the answers, then the
// connections those features need. The answers are kept as preferences.familyProfile for the AI. Skipping = Core 5.
import {featureDefaults,FEATURE_IDS} from './features.mjs';

// icon: Phosphor icon name. Options: [id, icon, en, he]. `when` hides a question that does not apply.
export const SETUP_QUESTIONS=[
 {id:'who',icon:'House',en:'Who lives at home?',he:'מי גר בבית?',options:[['solo','User','Just me','רק אני'],['couple','Users','The two of us','שנינו'],['kids','UsersThree','A family with kids','משפחה עם ילדים'],['shared','HouseLine','A shared home','בית משותף']]},
 {id:'kidsAges',icon:'Baby',multi:true,when:a=>a.who==='kids',en:'How old are the kids?',he:'בני כמה הילדים?',options:[['under5','Baby','Under 5','עד 5'],['5to8','PuzzlePiece','5 to 8','5 עד 8'],['9to12','Student','9 to 12','9 עד 12'],['teens','Users','Teens','נוער']]},
 {id:'kidsUse',icon:'UsersThree',when:a=>a.who==='kids',en:'Will the kids use Bayit themselves?',he:'הילדים ישתמשו ב־Bayit בעצמם?',options:[['own','Smiley','Yes, with their own profile','כן, עם פרופיל משלהם'],['parents','User','Only we manage their things','רק אנחנו מנהלים את שלהם'],['no','X','Not now','לא כרגע']]},
 {id:'busy',icon:'Lightning',multi:true,en:'What’s hardest to keep up with?',he:'מה הכי קשה לעקוב אחריו?',hint:{en:'Choose all that apply.',he:'אפשר לבחור כמה.'},options:[['chores','CheckCircle','Chores and to-dos','מטלות ומשימות'],['appointments','CalendarDots','Appointments and school','תורים ובית ספר'],['shopping','ShoppingCart','Shopping','קניות'],['money','Wallet','Money','כסף'],['papers','FileText','Home papers','מסמכי הבית'],['meals','ForkKnife','Meals','ארוחות']]},
 {id:'shopping',icon:'ShoppingCart',en:'Who does the shopping?',he:'מי עושה את הקניות?',options:[['one','User','Mostly one of us','בעיקר אחד מאיתנו'],['shared','Users','We share it','מתחלקים'],['online','Truck','Mostly online','בעיקר אונליין']]},
 {id:'money',icon:'Wallet',en:'Do you want to follow the family budget?',he:'רוצים לעקוב אחרי התקציב המשפחתי?',options:[['bank','Bank','Yes, from our bank and cards','כן, מהבנק ומהכרטיסים'],['manual','PencilSimple','Yes, we’ll enter it ourselves','כן, נזין בעצמנו'],['no','X','Not now','לא כרגע']]},
 {id:'papers',icon:'FileText',en:'Where do your home papers live today?',he:'איפה מסמכי הבית נמצאים היום?',options:[['scattered','Archive','Scattered around','מפוזרים'],['drawer','Package','In one drawer','במגירה אחת'],['cloud','CloudArrowUp','In a cloud folder','בתיקייה בענן'],['none','X','We don’t keep any','לא שומרים']]},
 {id:'insurance',icon:'ShieldCheck',en:'Want a clear view of insurance and renewals?',he:'רוצים תמונה ברורה של הביטוחים והחידושים?',options:[['yes','ShieldCheck','Yes','כן'],['no','X','Not now','לא כרגע']]},
 {id:'vouchers',icon:'Ticket',en:'Do you collect vouchers and gift cards?',he:'יש לכם שוברים וכרטיסי מתנה?',options:[['often','Gift','Often','הרבה'],['sometimes','Ticket','Sometimes','לפעמים'],['rarely','X','Rarely','כמעט לא']]},
 {id:'home',icon:'Wrench',multi:true,en:'Is there home care to remember?',he:'יש טיפולים בבית שצריך לזכור?',hint:{en:'Choose all that apply.',he:'אפשר לבחור כמה.'},options:[['service','Fan','AC or boiler service','טיפול במזגן או בדוד'],['car','Car','The car','הרכב'],['garden','Plant','Garden','גינה'],['warranties','Receipt','Warranties','אחריות'],['nothing','X','Nothing regular','שום דבר קבוע']]},
 {id:'food',icon:'CookingPot',multi:true,en:'How do you handle food?',he:'איך אתם מתנהלים עם האוכל?',hint:{en:'Choose all that apply.',he:'אפשר לבחור כמה.'},options:[['plan','ForkKnife','Plan the week’s meals','מתכננים ארוחות לשבוע'],['pantry','Package','Track what’s in the pantry','עוקבים מה יש במזווה'],['day','CookingPot','Decide on the day','מחליטים באותו יום'],['out','Coffee','Mostly eat out','בעיקר אוכלים בחוץ']]},
 {id:'journal',icon:'BookOpen',en:'Would you like a family journal?',he:'רוצים יומן משפחתי?',hint:{en:'Notes, memories and things to remember.',he:'פתקים, זיכרונות ודברים שכדאי לזכור.'},options:[['yes','BookOpen','Yes','כן'],['no','X','Not now','לא כרגע']]},
 {id:'reminders',icon:'Bell',multi:true,en:'How would you like reminders?',he:'איך תרצו לקבל תזכורות?',hint:{en:'Choose all that apply.',he:'אפשר לבחור כמה.'},options:[['app','Bell','In the app','באפליקציה'],['telegram','TelegramLogo','On Telegram','בטלגרם'],['weekly','ChartLineUp','A weekly summary','סיכום שבועי']]},
 {id:'ai',icon:'Sparkle',en:'Want an AI helper?',he:'רוצים עוזר AI?',hint:{en:'It suggests tasks and answers questions about your home. You approve every change.',he:'מציע משימות ועונה על שאלות על הבית. אתם מאשרים כל שינוי.'},options:[['key','Key','Yes, I have a key','כן, יש לי מפתח'],['help','Question','Yes, help me get one','כן, תעזרו לי להשיג'],['no','X','Not now','לא כרגע']]},
];

export const questionsFor=answers=>SETUP_QUESTIONS.filter(q=>!q.when||q.when(answers||{}));
const has=(v,x)=>Array.isArray(v)?v.includes(x):v===x;

// Suggested features with the reason for each: {features:{id:boolean}, reasons:{id:{en,he}}}. Core 5 always start on.
export function suggestFeatures(answers={}){
 const f=featureDefaults(),why={},on=(id,en,he)=>{f[id]=true;why[id]??={en,he}};
 if(answers.who==='kids'&&answers.kidsUse&&answers.kidsUse!=='no')on('kids','The kids will use it','הילדים ישתמשו');
 if(['bank','manual'].includes(answers.money)||has(answers.busy,'money'))on('expenses','You want to follow the budget','רציתם לעקוב אחרי התקציב');
 if(['scattered','drawer','cloud'].includes(answers.papers)||has(answers.busy,'papers'))on('documents',answers.papers==='scattered'?'Papers are scattered':'Home papers in one place','מסמכי הבית במקום אחד');
 if(answers.insurance==='yes'){on('insurance','You want to see renewals','רציתם לראות חידושים');on('documents','Insurance keeps its documents','הביטוחים שומרים מסמכים')}
 if(['often','sometimes'].includes(answers.vouchers))on('vouchers','You collect vouchers','יש לכם שוברים');
 if(Array.isArray(answers.home)&&answers.home.some(x=>x!=='nothing'))on('maintenance','Home care to remember','טיפולים שצריך לזכור');
 if(has(answers.food,'plan')||has(answers.busy,'meals'))on('meals','You plan meals','מתכננים ארוחות');
 if(has(answers.food,'pantry'))on('pantry','You track the pantry','עוקבים אחרי המזווה');
 if(answers.journal==='yes')on('journal','You want a family journal','רציתם יומן משפחתי');
 if(has(answers.reminders,'telegram'))on('telegram','Reminders on Telegram','תזכורות בטלגרם');
 if(has(answers.reminders,'weekly'))on('statistics','A weekly summary','סיכום שבועי');
 if(['key','help'].includes(answers.ai))on('ai',answers.ai==='key'?'You have a key':'We’ll help you get a key','נעזור לכם להשיג מפתח');
 return {features:f,reasons:why};
}

// Stored as preferences.familyProfile (parents write it). Only known question/option ids are kept.
export function normalizeFamilyProfile(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose valid setup answers.');
 const answers={};for(const q of SETUP_QUESTIONS){const v=value.answers?.[q.id],ids=q.options.map(o=>o[0]);if(v===undefined)continue;
  if(q.multi){if(!Array.isArray(v)||v.some(x=>!ids.includes(x)))throw Error('Choose valid setup answers.');answers[q.id]=[...new Set(v)]}
  else{if(!ids.includes(v))throw Error('Choose valid setup answers.');answers[q.id]=v}}
 const completedAt=typeof value.completedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value.completedAt)?value.completedAt.slice(0,30):undefined;
 return {answers,...(completedAt?{completedAt}:{}),...(value.skipped===true?{skipped:true}:{}),...(value.pending===true?{pending:true}:{})};
}
// A short plain-language summary for the AI (no names, no private data).
export function familyProfileSummary(profile,lang='en'){
 const a=profile?.answers||{},parts=[];if(!Object.keys(a).length)return '';
 for(const q of SETUP_QUESTIONS){const v=a[q.id];if(v===undefined)continue;const label=id=>{const o=q.options.find(x=>x[0]===id);return o?(lang==='he'?o[3]:o[2]):id};parts.push((lang==='he'?q.he:q.en)+' '+(Array.isArray(v)?v.map(label).join(', '):label(v)))}
 return parts.join(' · ');
}
export {FEATURE_IDS};
