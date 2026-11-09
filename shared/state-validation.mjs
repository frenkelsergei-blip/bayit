import {validateDocumentCategories} from './document-categories.mjs';
import {validatePins} from './household-pins.mjs';
import {mediaType} from './safe-media.mjs';
import {validateInsuranceDocument,validateInsuranceAlertPrefs} from './insurance-lifecycle.mjs';
import {validateReminderList} from './item-reminders.mjs';
const forbidden=new Set(['__proto__','prototype','constructor']);
const words=s=>new Set(s.split(/\s+/));
const common=words('id title he ownerId visibility allowedIds icon date time createdAt updatedAt createdBy updatedBy note noteHe reminder reminders memberId memberIds responsibleId deletedAt aiOperationId until');
const fields={
 tasks:'priority routineId done completedAt completedBy repeat repeatDays repeatUntil weekdays days xp routine parentConfirm completions kind category listId shoppingListId subtasks notifyOwnerOnDone overdueAlert durationMinutes location turnOrder turnMemberIds turnEvery turnEnabled rotating rotation intervalMonths serviceHistory nextServiceDate serviceRequest repeatEvery approvalRequired reward assigneeIds turns reminderDays linkedShoppingTitle contactId documentId',
 events:'repeat repeatDays repeatUntil weekdays durationMinutes location color birthdayOf editPolicy editorIds endTime turnOrder parentConfirm category',
 notes:'text textHe type editPolicy editorIds tags',
 shopping:'quantity quantityValue unit group category done boughtAt boughtBy listId order source',
 documents:'fileId filename mime size category categories purchased expires validFrom supersededAt contactId description sourceKind importChannel importedAt sourceSha256',
 contacts:'phone email category description address notes',
 shoppingLists:'name status completedAt archivedAt sourceListId tripDate',
 taskLists:'name color description',
 meals:'ingredients day mealType type source recipe servings dish dishHe',
 pantry:'quantity quantityValue minimum unit group category expires location autoSuggest',
 expenses:'amount flow category payment source currency description receiptDocumentId notes documentId billId',
 bills:'amount category repeat paid paidDates dueDate source currency flow',
 places:'name location',
 insurances:'insurer policyNumber insuredName type status premiumCents premiumPeriod currency startDate endDate source sourceFile sourceSheet sourceRow sourcePremiumText reportDate importedAt documentIds paymentIds importWarnings coverageMain coverageSub productType coveragePeriodText additionalDetails classification coverageVariant sourcePolicyNumber policyNumberFormat sourceDocumentIds',
};
const profileFields=words('name he photo displayMode badgeIcon character equipped xp color birthday birthdayInCalendar locale notificationPrefs financePlans financeNotifications favoriteIcons hero heroRequest readNotifications dismissedNotifications documentCategories pinnedRecords');
const stringFields=words('id title he ownerId visibility date time createdAt updatedAt createdBy updatedBy note noteHe memberId responsibleId deletedAt completedAt completedBy repeat repeatUntil kind category listId shoppingListId group unit boughtAt boughtBy name status archivedAt sourceListId tripDate fileId filename mime purchased expires contactId description phone email address day mealType type source recipe payment currency dueDate endTime birthdayOf text textHe aiOperationId until priority routineId turnOrder receiptDocumentId notes documentId billId dish dishHe color sourceKind importChannel importedAt sourceSha256 linkedShoppingTitle');
const numericFields=words('xp quantityValue minimum amount size durationMinutes intervalMonths servings reminderDays');
const booleans=words('done routine parentConfirm notifyOwnerOnDone paid turnEnabled rotating approvalRequired autoSuggest');
export function boundedValue(value,{depth=0,budget={nodes:0}}={}){
 if(++budget.nodes>16000||depth>12)throw Error('This record is too complex.');
 if(value==null||typeof value==='boolean')return;
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Choose a finite number.');return}
 if(typeof value==='string'){if(value.length>200000||value.includes('\0'))throw Error('This field is too large or contains invalid text.');return}
 if(typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype&&!Array.isArray(value))throw Error('Choose a valid record.');
 if(Array.isArray(value)){if(value.length>5000)throw Error('This list is too long.');for(const v of value)boundedValue(v,{depth:depth+1,budget});return}
 for(const [key,v]of Object.entries(value)){if(forbidden.has(key)||key.length>180)throw Error('Invalid field.');boundedValue(v,{depth:depth+1,budget})}
}
export function validIcon(value,depth=0){
 if(typeof value==='string')return value.length<=180&&(/^[A-Za-z0-9_-]+$/.test(value)||/^\/assets\/[A-Za-z0-9_./-]+\.(png|svg)$/.test(value)&&!value.includes('..'));
 return depth===0&&value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['base','badge'].includes(k))&&validIcon(value.base,1)&&(!value.badge||validIcon(value.badge,1));
}
function date(value){if(value==='')return true;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const n=Date.parse(value+'T12:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value}
export function imageData(value,{png=false}={}){
 if(typeof value!=='string'||value.length>180000)return false;
 const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match||match[1]==='png'&&!png)return false;
 let bytes;try{bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))}catch{return false}
 if(mediaType(bytes)!=='image/'+match[1])return false;
 if(match[1]==='png'){if(bytes.length<24)return false;const dv=new DataView(bytes.buffer);const w=dv.getUint32(16),h=dv.getUint32(20);return w>0&&h>0&&w<=2048&&h<=2048}
 let i=2,steps=0;while(i+8<bytes.length&&steps++<512){if(bytes[i++]!==255)return false;while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===217||marker===218)break;const n=bytes[i]*256+bytes[i+1];if(n<2||i+n>bytes.length)return false;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){const h=bytes[i+3]*256+bytes[i+4],w=bytes[i+5]*256+bytes[i+6];return w>0&&h>0&&w<=2048&&h<=2048}i+=n}
 return false;
}
export function safePhoto(value,{accountImage='',png=false}={}){
 if(value==null||value==='')return '';
 if(typeof value!=='string')throw Error('Choose a valid profile photo.');
 if(/^\/assets\/(generated|icons)\/[A-Za-z0-9_./-]+\.png$/.test(value)&&!value.includes('..'))return value;
 if(imageData(value,{png}))return value;
 if(value===accountImage){try{const u=new URL(value);if(u.protocol==='https:'&&/^lh[3-6]\.googleusercontent\.com$/.test(u.hostname)&&!u.username&&!u.password)return value}catch{}}
 throw Error('Upload a small JPEG photo or use your verified account photo.');
}
export function validateProfile(value,member){
 boundedValue(value);for(const key of Object.keys(value))if(!profileFields.has(key))throw Error('Unsupported profile field.');
 for(const key of ['name','he','locale','displayMode','character','equipped','color','birthday'])if(value[key]!==undefined&&(typeof value[key]!=='string'||value[key].length>(key==='name'||key==='he'?100:80)))throw Error('Choose valid profile details.');
 for(const key of ['readNotifications','dismissedNotifications','favoriteIcons'])if(value[key]!==undefined&&(!Array.isArray(value[key])||value[key].length>1500||value[key].some(v=>typeof v!=='string'||v.length>200)))throw Error('Choose valid profile preferences.');
 if(value.birthdayInCalendar!==undefined&&typeof value.birthdayInCalendar!=='boolean')throw Error('Choose a valid birthday setting.');
 if(value.pinnedRecords!==undefined)validatePins(value.pinnedRecords);
 if(value.documentCategories!==undefined)validateDocumentCategories(value.documentCategories,validIcon,40);
 if(value.notificationPrefs!==undefined)validateNotificationPrefs(value.notificationPrefs);
 if(value.birthday&&!date(value.birthday))throw Error('Choose a valid birthday.');
 if(value.photo!==undefined)value.photo=safePhoto(value.photo,{accountImage:member?.avatar});
 if(value.badgeIcon!==undefined&&!validIcon(value.badgeIcon))throw Error('Choose a valid personal icon.');
}
export function validateRecord(collection,value){
 boundedValue(value);const allowed=new Set([...common,...words(fields[collection]||'')]);
 for(const [key,v]of Object.entries(value)){
  if(!allowed.has(key))throw Error('Unsupported '+collection+' field: '+key+'.');
  if(v==null)continue;
  if(stringFields.has(key)&&(typeof v!=='string'||v.length>(['text','textHe','note','noteHe','description','recipe','notes'].includes(key)?20000:['title','he','name','filename'].includes(key)?500:300)))throw Error('Choose valid text for '+key+'.');
  if(numericFields.has(key)&&!Number.isFinite(v))throw Error('Choose a valid number for '+key+'.');
  if(booleans.has(key)&&typeof v!=='boolean')throw Error('Choose a valid switch for '+key+'.');
 }
 if(value.title!==undefined&&(!value.title.trim()||value.title.length>500))throw Error('Choose a record name.');
 if(value.icon!==undefined&&!validIcon(value.icon))throw Error('Choose a valid record icon.');
 for(const key of ['date','purchased','expires','dueDate','until'])if(value[key]!=null&&!date(value[key]))throw Error('Choose a valid date.');
 if(collection==='documents'){validateInsuranceDocument(value);if(value.categories!==undefined)validateDocumentCategories(value.categories,validIcon);if(value.sourceKind!==undefined&&value.sourceKind!=='insurance-report')throw Error('Choose a valid document source.');if(value.importChannel!==undefined&&!['web','telegram','backfill'].includes(value.importChannel))throw Error('Choose a valid import channel.');if(value.sourceSha256!==undefined&&!/^[a-f0-9]{64}$/.test(value.sourceSha256))throw Error('Choose a valid source fingerprint.');}
 if(value.reminders!==undefined)validateReminderList(value.reminders);
 if(collection==='tasks'&&value.reminderDays!==undefined&&(!Number.isInteger(value.reminderDays)||value.reminderDays<0||value.reminderDays>365))throw Error('Choose a reminder between 0 and 365 days.');
 if(collection==='tasks'&&value.priority!=null&&!['','low','medium','high'].includes(value.priority))throw Error('Choose a valid task priority.');
 if(value.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))throw Error('Choose a complete time.');
 for(const key of ['allowedIds','memberIds','editorIds','turnMemberIds','assigneeIds'])if(value[key]!==undefined&&(!Array.isArray(value[key])||value[key].length>100||value[key].some(v=>typeof v!=='string'||v.length>140)))throw Error('Choose valid people.');
 if(value.fileId!==undefined&&!/^[0-9a-f-]{36}$/i.test(value.fileId))throw Error('Choose an uploaded document.');
 for(const key of ['weekdays','repeatDays','days'])if(value[key]!==undefined&&(!Array.isArray(value[key])||value[key].length>7||value[key].some(d=>!Number.isInteger(d)||d<0||d>6)))throw Error('Choose valid weekdays.');
 if(value.completions!==undefined){if(!value.completions||typeof value.completions!=='object'||Array.isArray(value.completions)||Object.entries(value.completions).some(([day,c])=>!date(day)||!c||typeof c!=='object'||!['open','pending','done'].includes(c.state)))throw Error('Choose a valid completion.');}
 if(value.overdueAlert!==undefined&&(!value.overdueAlert||typeof value.overdueAlert!=='object'||!Number.isFinite(value.overdueAlert.afterMinutes)||value.overdueAlert.afterMinutes<0||value.overdueAlert.afterMinutes>10080))throw Error('Choose a valid overdue interval.');
 if(value.quantity!==undefined&&(typeof value.quantity!=='string'&&typeof value.quantity!=='number'||String(value.quantity).length>100))throw Error('Choose a valid quantity.');
 if(value.tags!==undefined&&(!Array.isArray(value.tags)||value.tags.length>30||value.tags.some(t=>typeof t!=='string'||t.length>60)))throw Error('Choose valid note tags.');
 if(value.paidDates!==undefined&&(!Array.isArray(value.paidDates)||value.paidDates.length>1500||value.paidDates.some(v=>!date(v))))throw Error('Choose valid paid dates.');
 if(value.subtasks!==undefined&&(!Array.isArray(value.subtasks)||value.subtasks.length>100||value.subtasks.some(v=>!v||typeof v.title!=='string'||v.title.length>500||typeof v.done!=='boolean')))throw Error('Choose valid subtasks.');
}
export function displayable(record,collection){
 if(!record||typeof record!=='object'||typeof record.id!=='string')return false;
 for(const key of ['title','he','name','note','noteHe','text','textHe','date','time'])if(record[key]!=null&&typeof record[key]!=='string')return false;
 return record.icon===undefined||validIcon(record.icon);
}
function uiLeaves(value){
 if(!value||typeof value!=='object')return;
 for(const [key,v]of Object.entries(value)){
  if(['name','title','he','label','text','textHe','description','quietStart','quietEnd','digest','time'].includes(key)&&v!=null&&typeof v!=='string')throw Error('Choose valid display text.');
  if(['enabled','previews','parentUpdates','notifyOwnerOnDone','push','telegram','inApp'].includes(key)&&typeof v!=='boolean')throw Error('Choose a valid notification switch.');
  if(v&&typeof v==='object')uiLeaves(v);
 }
}
export function validateNotificationPrefs(value){
 boundedValue(value);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose valid notification preferences.');uiLeaves(value);
 if(value.categories?.insurance!==undefined)validateInsuranceAlertPrefs(value.categories.insurance);
 for(const key of ['reminder','overdueAfter'])if(value[key]!=null&&(!Number.isFinite(value[key])||value[key]<-1||value[key]>10080))throw Error('Choose a valid reminder interval.');
 if(value.reminders!==undefined){validateReminderList(value.reminders,'default');if(value.reminders.some(n=>n<0))throw Error('Choose a valid default reminder.')}
 for(const c of Object.values(value.categories||{}))if(c&&typeof c==='object'&&!Array.isArray(c)){if(c.reminders!==undefined){validateReminderList(c.reminders,'default');if(c.reminders.some(n=>n<0))throw Error('Choose a valid default reminder.')}}
 for(const key of ['quietStart','quietEnd','digest'])if(value[key]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value[key]))throw Error('Choose a complete notification time.');
 if(value.categories!==undefined&&(!value.categories||typeof value.categories!=='object'||Array.isArray(value.categories)))throw Error('Choose valid notification categories.');
}
export function validatePreference(key,value){
 boundedValue(value);uiLeaves(value);
 if(['householdName','weekStarts','palette','maintenanceDate','maintenanceRepeat','quietStart','quietEnd'].includes(key)&&(typeof value!=='string'||value.length>(key==='householdName'?80:300)))throw Error('Choose valid household text.');
 if(['monthlyBudget','turnInterval','maxSuggestions'].includes(key)&&(!Number.isFinite(value)||value<0||value>100000000))throw Error('Choose a valid setting value.');
 if(key==='privacyDefaults'&&(!value||typeof value!=='object'||Object.entries(value).some(([k,v])=>!['noteVisibility','eventVisibility'].includes(k)||!['private','family'].includes(v))))throw Error('Choose valid privacy defaults.');
 if(['appearanceByUser','todayByUser','privateGoals','suggestionsByUser','activeShoppingListByUser','turnOverrides'].includes(key)&&(!value||typeof value!=='object'||Array.isArray(value)))throw Error('Choose valid personal settings.');
 if(key==='shoppingCategories'&&(!Array.isArray(value)||value.length>100||value.some(v=>typeof v==='string'?v.length>100:!v||typeof v!=='object')))throw Error('Choose valid shopping categories.');
}
