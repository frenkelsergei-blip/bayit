// Feature modules (Modular Bayit, work package 2.5; design docs/feature-module-design.md, contract
// docs/feature-module-contract.md). A feature module is an extension that adds a screen with its own records.
// Its records live in household state under state.extensions[<id>][<collection>] and travel through the normal
// /changes pipeline as ops keyed 'ext:<id>/<collection>'. The core owns every rule: the module only DECLARES its
// schema here; it never runs code that could widen access.
//
// First version (user's answers, 2026-11-10, "לפי ההמלצה שלך"):
//  - removing an extension keeps its data stored and hidden; reinstalling serves it again; a parent may download
//    a copy and then delete it on purpose (moduleExport / dropModuleData);
//  - Bayit AI never reads module data; no Today card, reminders, Telegram, Statistics, outbound calls, secrets,
//    files or tables: a manifest or feature entry that asks for any of these is refused when the registry loads;
//  - audience 'everyone' | 'adults'. An adults-only module is never sent to a child (the Expenses rule) and its
//    feature must be adult:true so menus agree; parents can switch any module off for the family (Settings › Features).
import {joinRegistry} from './extension-registry.mjs';
import {EXTRA_MODULES} from './extensions/modules.mjs';
import {featureById,familyFeatureOn,resolveFeatures,FEATURE_MAPPINGS} from './features.mjs';
import {canSeeRecord} from './record-audience.mjs';
import {validIcon,displayable} from './state-validation.mjs';
import {extKey,parseExtKey,validExtId,recordList,setRecordList} from './record-paths.mjs';

export const MODULE_LIMITS=Object.freeze({recordBytes:20_000,maxRecords:2_000,defaultMaxRecords:500,maxBytes:300_000,defaultMaxBytes:150_000,text:2_000,defaultText:300,longtext:20_000,fields:60,collections:8});
export const FIELD_TYPES=['text','longtext','number','integer','boolean','date','time','enum','people','ref','tags','object'];
// Fields the core owns on every module record; a module never declares them.
export const CORE_FIELDS=['id','ownerId','visibility','allowedIds','editPolicy','editorIds','createdAt','updatedAt','createdBy','updatedBy','deletedAt','icon'];
// What a manifest may say in v1. Anything else is refused by name, so a later surface cannot slip in unnoticed.
const MANIFEST_KEYS=['id','version','audience','childrenMay','offline','collections','maxBytes'];
const COLLECTION_KEYS=['assignees','edit','maxRecords','fields','label','check'];
// Surfaces and powers that come later, each with its own approval (design §2.2, §2.5).
export const LATER=['today','widget','widgets','reminders','telegram','statistics','stats','ai','aiSources','outbound','origins','fetch','routes','api','secrets','files','tables','migrations','upgrade','notifications','push','pins','search'];
const NAME=/^[a-z][A-Za-z0-9]{0,39}$/;
const text=v=>typeof v==='string'&&v.trim()!=='';

function fieldProblem(name,f,depth=0){
 if(!NAME.test(name)||CORE_FIELDS.includes(name)||name==='memberIds')return 'field "'+name+'" must be a new camelCase name (core fields are '+CORE_FIELDS.join(', ')+').';
 if(!f||typeof f!=='object'||Array.isArray(f))return 'field "'+name+'" must be an object like {type:"text"}.';
 if(!FIELD_TYPES.includes(f.type))return 'field "'+name+'" has unknown type "'+f.type+'"; use '+FIELD_TYPES.join(', ')+'.';
 const allowed=['type','required','max','min','values','to','fields'];for(const k of Object.keys(f))if(!allowed.includes(k))return 'field "'+name+'" has unknown setting "'+k+'".';
 if(f.required!==undefined&&typeof f.required!=='boolean')return 'field "'+name+'" required must be true or false.';
 if(f.type==='text'&&f.max!==undefined&&(!Number.isInteger(f.max)||f.max<1||f.max>MODULE_LIMITS.text))return 'field "'+name+'" text max must be 1-'+MODULE_LIMITS.text+'.';
 if(f.type==='longtext'&&f.max!==undefined&&(!Number.isInteger(f.max)||f.max<1||f.max>MODULE_LIMITS.longtext))return 'field "'+name+'" longtext max must be 1-'+MODULE_LIMITS.longtext+'.';
 if(['number','integer'].includes(f.type))for(const k of ['min','max'])if(f[k]!==undefined&&!Number.isFinite(f[k]))return 'field "'+name+'" '+k+' must be a number.';
 if(f.type==='enum'&&(!Array.isArray(f.values)||!f.values.length||f.values.length>50||f.values.some(v=>!text(v)||v.length>60)||new Set(f.values).size!==f.values.length))return 'field "'+name+'" enum needs 1-50 distinct values of up to 60 characters.';
 if(f.type==='ref'&&!NAME.test(f.to||''))return 'field "'+name+'" ref needs to: "<collection of this module>".';
 if(f.type==='object'){if(depth)return 'field "'+name+'" object fields may not contain other objects.';if(!f.fields||typeof f.fields!=='object'||!Object.keys(f.fields).length||Object.keys(f.fields).length>20)return 'field "'+name+'" object needs 1-20 sub-fields.';for(const [k,sub]of Object.entries(f.fields)){if(sub?.type==='ref'||sub?.type==='people')return 'field "'+name+'.'+k+'" may not be a ref or people field.';const p=fieldProblem(k,sub,1);if(p)return p}}
 return '';
}

// Checks one manifest against its feature entry (shared/extensions/features.mjs, same id).
export function moduleProblem(m,all,feature=featureById(m.id)){
 for(const k of Object.keys(m))if(!MANIFEST_KEYS.includes(k))return LATER.includes(k)?'"'+k+'" is not available to feature modules in the first version.':'unknown setting "'+k+'".';
 if(m.version!==1)return 'version must be 1 (data upgrades come later).';
 if(!['everyone','adults'].includes(m.audience))return 'audience must be "everyone" or "adults".';
 if(m.audience==='everyone'&&!['write','read','none'].includes(m.childrenMay))return 'childrenMay must be "write", "read" or "none".';
 if(m.audience==='adults'&&m.childrenMay!==undefined&&m.childrenMay!=='none')return 'an adults-only module cannot let children in (leave childrenMay out).';
 if(typeof m.offline!=='boolean')return 'offline must be true or false.';
 if(m.maxBytes!==undefined&&(!Number.isInteger(m.maxBytes)||m.maxBytes<1000||m.maxBytes>MODULE_LIMITS.maxBytes))return 'maxBytes must be 1000-'+MODULE_LIMITS.maxBytes+'.';
 const cols=m.collections&&typeof m.collections==='object'&&!Array.isArray(m.collections)?Object.entries(m.collections):[];
 if(!cols.length||cols.length>MODULE_LIMITS.collections)return 'collections must declare 1-'+MODULE_LIMITS.collections+' record lists.';
 for(const [name,c]of cols){
  if(!NAME.test(name)||!parseExtKey(extKey(m.id,name)))return 'collection "'+name+'" must be a camelCase name.';
  if(!c||typeof c!=='object')return 'collection "'+name+'" must be an object.';
  for(const k of Object.keys(c))if(!COLLECTION_KEYS.includes(k))return LATER.includes(k)?'collection "'+name+'": "'+k+'" is not available in the first version.':'collection "'+name+'" has unknown setting "'+k+'".';
  if(c.assignees!==undefined&&c.assignees!==false)return 'collection "'+name+'": assignees come later; leave it out or false.';
  if(!['owner','policy'].includes(c.edit))return 'collection "'+name+'": edit must be "owner" or "policy".';
  if(c.maxRecords!==undefined&&(!Number.isInteger(c.maxRecords)||c.maxRecords<1||c.maxRecords>MODULE_LIMITS.maxRecords))return 'collection "'+name+'": maxRecords must be 1-'+MODULE_LIMITS.maxRecords+'.';
  if(c.check!==undefined&&typeof c.check!=='function')return 'collection "'+name+'": check must be a function.';
  const fields=c.fields&&typeof c.fields==='object'&&!Array.isArray(c.fields)?Object.entries(c.fields):[];
  if(!fields.length||fields.length>MODULE_LIMITS.fields)return 'collection "'+name+'" must declare 1-'+MODULE_LIMITS.fields+' fields.';
  for(const [f,def]of fields){const p=fieldProblem(f,def);if(p)return 'collection "'+name+'": '+p;if(def.type==='ref'&&!m.collections[def.to])return 'collection "'+name+'": ref "'+f+'" points to an unknown collection.'}
  if(!c.fields[c.label]||!['text','longtext'].includes(c.fields[c.label].type))return 'collection "'+name+'": label must name one of its text fields.';
 }
 // The feature entry with the same id carries the name, icon, group and the on/off switch.
 const f=feature;
 if(!f)return 'needs a feature with the same id in shared/extensions/features.mjs.';
 if(!Array.isArray(f.routes)||!f.routes.length||f.routes.some(r=>r!=='x/'+m.id&&!r.startsWith('x/'+m.id+'/')))return 'its feature routes must be "x/'+m.id+'" (or "x/'+m.id+'/<view>").';
 for(const key of FEATURE_MAPPINGS)if(key!=='routes'&&f[key]?.length)return 'its feature maps '+key+', which feature modules cannot use in the first version.';
 if(!!f.adult!==(m.audience==='adults'))return m.audience==='adults'?'an adults-only module needs adult:true on its feature.':'a module for everyone cannot have an adults-only feature (set audience:"adults").';
 if(f.always)return 'a module feature cannot be always on; parents must be able to switch it off.';
 return '';
}

// Core ships no modules; installed extensions add them in shared/extensions/modules.mjs.
export const MODULES=joinRegistry('feature module',[],EXTRA_MODULES,moduleProblem).map(m=>Object.freeze({...m,childrenMay:m.audience==='adults'?'none':m.childrenMay}));
export const moduleById=id=>MODULES.find(m=>m.id===id)||null;

const roleOf=(state,actorId)=>(state?.members||[]).find(m=>m.id===actorId)?.role||null;
// Who may receive the module at all: never an outsider; never a child when it is adults-only or childrenMay 'none'.
export function moduleReadable(module,role){if(!role)return false;if(role!=='child')return true;return module.audience==='everyone'&&module.childrenMay!=='none'}
export function moduleWritable(module,role){if(!role)return false;if(role!=='child')return true;return module.audience==='everyone'&&module.childrenMay==='write'}

// ---- record schema ------------------------------------------------------------------------------------------
const DATE=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const n=Date.parse(v+'T12:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===v};
const ISO=v=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(v);
function fieldValue(label,def,v,ctx){
 const bad=what=>{throw Error('Choose '+what+' for '+label+'.')};
 switch(def.type){
  case 'text':case 'longtext':{const max=def.max??(def.type==='text'?MODULE_LIMITS.defaultText:MODULE_LIMITS.longtext);if(typeof v!=='string'||v.length>max||v.includes('\0'))bad('text of up to '+max+' characters');if(def.required&&!v.trim())bad('a value');return}
  case 'number':case 'integer':if(typeof v!=='number'||!Number.isFinite(v)||def.type==='integer'&&!Number.isInteger(v)||def.min!==undefined&&v<def.min||def.max!==undefined&&v>def.max)bad('a valid number');return;
  case 'boolean':if(typeof v!=='boolean')bad('yes or no');return;
  case 'date':if(v!==''&&!DATE(v))bad('a valid date');return;
  case 'time':if(v!==''&&(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)))bad('a valid time');return;
  case 'enum':if(!def.values.includes(v))bad('one of the listed options');return;
  case 'people':if(!Array.isArray(v)||v.length>100||new Set(v).size!==v.length||v.some(id=>!ctx.memberIds.has(id)))bad('family members');return;
  case 'tags':if(!Array.isArray(v)||v.length>30||v.some(t=>typeof t!=='string'||!t.trim()||t.length>60))bad('up to 30 tags');return;
  case 'ref':{if(typeof v!=='string')bad('a record');if(v==='')return;const target=(recordList(ctx.state,extKey(ctx.module.id,def.to))||[]).find(r=>r?.id===v);if(!target||target.deletedAt||!canSeeRecord(target,ctx.actorId,extKey(ctx.module.id,def.to)))throw Error('This linked record is private or unavailable.');return}
  case 'object':{if(!v||typeof v!=='object'||Array.isArray(v))bad('valid details');for(const [k,sv]of Object.entries(v)){if(!def.fields[k])throw Error('Unsupported '+ctx.module.id+' field: '+label+'.'+k+'.');fieldValue(label+'.'+k,def.fields[k],sv,ctx)}for(const [k,sd]of Object.entries(def.fields))if(sd.required&&v[k]===undefined)bad('a value for '+label+'.'+k);return}
 }
}
// Throws when a record does not match the declared schema and the core field rules. ctx: {module, state, actorId, memberIds}.
export function validateModuleRecord(module,collection,value,ctx){
 const c=module.collections[collection];if(!c)throw Error('Unsupported record change.');
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose a valid record.');
 for(const key of Object.keys(value)){
  if(key.startsWith('$')||key.includes('.'))throw Error('Invalid field.');
  if(CORE_FIELDS.includes(key)){if(['editPolicy','editorIds'].includes(key)&&c.edit!=='policy')throw Error('Unsupported '+module.id+' field: '+key+'.');continue}
  if(!c.fields[key])throw Error('Unsupported '+module.id+' field: '+key+'.');
 }
 if(!validExtId(value.id))throw Error('Choose a valid record id.');
 if(typeof value.ownerId!=='string'||!ctx.memberIds.has(value.ownerId))throw Error('Record ownership cannot be changed.');
 if(value.allowedIds!==undefined&&(!Array.isArray(value.allowedIds)||value.allowedIds.some(id=>typeof id!=='string')))throw Error('Choose valid visibility and people.');
 for(const k of ['createdAt','updatedAt','deletedAt'])if(value[k]!==undefined&&value[k]!==null&&!ISO(value[k]))throw Error('Choose a valid time for '+k+'.');
 for(const k of ['createdBy','updatedBy'])if(value[k]!==undefined&&!ctx.memberIds.has(value[k]))throw Error('A family member is invalid.');
 if(value.icon!==undefined&&!validIcon(value.icon))throw Error('Choose a valid icon.');
 for(const [name,def]of Object.entries(c.fields)){if(value[name]===undefined||value[name]===null){if(def.required)throw Error('Choose a value for '+name+'.');if(value[name]===null)throw Error('Choose a valid value for '+name+'.');continue}fieldValue(name,def,value[name],{...ctx,module})}
 if(new TextEncoder().encode(JSON.stringify(value)).byteLength>MODULE_LIMITS.recordBytes)throw Error('This record is too large.');
}
// The module's display names are kept with its stored data ($name, beside the record lists; never sent to devices),
// so Settings can still say what a removed extension was called (user request 2026-11-10).
function stampName(next,module){const f=featureById(module.id);if(!f)return;const name={en:f.en,he:f.he},slice=next.extensions[module.id];if(slice&&JSON.stringify(slice.$name)!==JSON.stringify(name))slice.$name=name}
const keptName=slice=>{const n=slice?.$name;return n&&typeof n==='object'&&typeof n.en==='string'&&typeof n.he==='string'&&n.en.trim()&&n.he.trim()?{en:n.en.slice(0,80),he:n.he.slice(0,80)}:null};
export const moduleName=(state,id)=>{const f=featureById(id);return keptName(state?.extensions?.[id])||(f&&moduleById(id)?{en:f.en,he:f.he}:null)};
const sliceBytes=slice=>new TextEncoder().encode(JSON.stringify(slice||{})).byteLength;

// ---- the write path (called by applyChanges for every 'ext:' op) ---------------------------------------------
// next: the draft state being built; state: the stored state before this request. Mirrors the core rules in
// app/cloud/state.mjs: hidden records refused, only the owner deletes or changes sharing, edit by owner or policy.
// state.mjs passes the core edit rules (shared/permissions.mjs) in, so this registry loads without app/src.
export function applyModuleOp(next,op,{state,actorId,role,memberIds,members,canEditContent,validateEditAccess}){
 const ref=parseExtKey(op.collection),module=ref&&moduleById(ref.module),c=module?.collections[ref.collection];
 if(!c||!validExtId(op.id))throw Error('Unsupported record change.');
 if(!familyFeatureOn(resolveFeatures(state.preferences?.features,state),module.id))throw Error('This feature is turned off for the family. Nothing was changed.');
 if(!moduleWritable(module,role))throw Error(module.audience==='adults'?'This extension is available to adult accounts.':'A parent manages this extension’s records.');
 const key=op.collection,list=[...(recordList(next,key)||[])],index=list.findIndex(r=>r?.id===op.id),old=index>=0?list[index]:null;
 if(old&&!canSeeRecord(old,actorId,key))throw Error('This record is private.');
 if(op.delete){if(!old||old.ownerId!==actorId)throw Error('Only the owner can remove this record.');list.splice(index,1);setRecordList(next,key,list);stampName(next,module);return}
 const value=structuredClone(op.value||{});
 if(value.id!==op.id||value.ownerId!==(old?.ownerId||actorId))throw Error('Record ownership cannot be changed.');
 value.allowedIds??=[];
 validateModuleRecord(module,ref.collection,value,{state:next,actorId,memberIds});
 if(!['private','family','selected'].includes(value.visibility)||value.visibility==='selected'&&(!value.allowedIds.length||value.allowedIds.some(id=>!memberIds.has(id))))throw Error('Choose valid visibility and people.');
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(old&&old.ownerId!==actorId&&(!same(old.visibility,value.visibility)||!same(old.allowedIds||[],value.allowedIds||[])||!same(old.editPolicy,value.editPolicy)||!same(old.editorIds||[],value.editorIds||[])))throw Error('Only the owner changes sharing.');
 if(c.edit==='owner'){if(old&&old.ownerId!==actorId)throw Error('Only the owner edits this record.')}
 else{validateEditAccess(value,memberIds);if(old&&!canEditContent(old,actorId,members,'note'))throw Error('Only the owner or a permitted editor can edit this record.')}
 if(c.check){const problem=c.check(Object.freeze(structuredClone(value)),Object.freeze({old:old?structuredClone(old):null,actorId,role}));if(problem)throw Error(String(problem).slice(0,200))}
 if(index<0){if(list.length>=(c.maxRecords??MODULE_LIMITS.defaultMaxRecords))throw Error('This list is full. Remove old records first.');list.push(value)}else list[index]=value;
 setRecordList(next,key,list);stampName(next,module);
 if(sliceBytes(next.extensions[module.id])>(module.maxBytes??MODULE_LIMITS.defaultMaxBytes))throw Error('This extension has reached its storage limit. Remove old records first.');
}

// ---- the read path ------------------------------------------------------------------------------------------
// Only declared fields and core fields of a record (an old record may still hold a field a newer version dropped).
function project(module,collection,record){
 const c=module.collections[collection],out={};
 for(const k of [...CORE_FIELDS,...Object.keys(c.fields)])if(record[k]!==undefined&&(c.edit==='policy'||!['editPolicy','editorIds'].includes(k)))out[k]=structuredClone(record[k]);
 return out;
}
// The member's copy of every INSTALLED module: built from scratch, so a removed module's slice, an undeclared
// collection or an undeclared field never reaches a device. Feature on/off is applied later by deliveryView
// and the client, like other features; writes are refused while it is off.
export function visibleModules(state,actorId){
 const role=roleOf(state,actorId),out={};
 for(const m of MODULES){
  if(!moduleReadable(m,role))continue;
  const slice={};
  for(const name of Object.keys(m.collections)){const key=extKey(m.id,name);slice[name]=(Array.isArray(recordList(state,key))?recordList(state,key):[]).filter(r=>displayable(r)&&validExtId(r.id)&&canSeeRecord(r,actorId,key)).map(r=>project(m,name,r))}
  out[m.id]=slice;
 }
 return out;
}
// Device copy: a module with offline:false is never stored on the device (like money).
export function offlineModules(extensions){
 if(!extensions||typeof extensions!=='object')return extensions;
 const out={};for(const [id,slice]of Object.entries(extensions)){const m=moduleById(id);out[id]=m&&m.offline===false?{}:slice}
 return out;
}

// ---- kept data, download and deliberate delete (answer 1) ----------------------------------------------------
// Every stored slice with its size and whether its module is installed. Parents only (worker).
// With actorId: privateOthers = how many OTHER people have records in it that this member cannot see (a count only,
// never names or content), for the delete warning (user's choice 2026-11-10, option 1).
export function keptModules(state,actorId){
 const ext=state?.extensions&&typeof state.extensions==='object'&&!Array.isArray(state.extensions)?state.extensions:{};
 return Object.entries(ext).filter(([,s])=>s&&typeof s==='object').map(([id,slice])=>{
  const out={id,installed:!!moduleById(id),bytes:sliceBytes(slice),name:moduleName(state,id)}; // name: null if never saved
  if(actorId){const owners=new Set();for(const [c,list]of Object.entries(slice))if(Array.isArray(list))for(const r of list)if(r&&typeof r==='object'&&r.ownerId!==actorId&&!canSeeRecord(r,actorId,extKey(id,c)))owners.add(String(r.ownerId));out.privateOthers=owners.size}
  return out;
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
// A download of one module's stored records that this member may see, also after the module was removed
// (then the core visibility rule applies and every stored field is kept, so nothing is lost on the way out).
export function moduleExport(state,moduleId,actorId){
 const role=roleOf(state,actorId),m=moduleById(moduleId),slice=state?.extensions?.[moduleId];
 if(!role)throw Error('This household is unavailable.');
 if(m?!moduleReadable(m,role):role==='child')throw Error('This extension is available to adult accounts.');
 const records={};
 for(const [name,list]of Object.entries(slice&&typeof slice==='object'?slice:{})){
  if(!Array.isArray(list)||m&&!m.collections[name])continue;
  const key=extKey(moduleId,name);if(!parseExtKey(key))continue;
  records[name]=list.filter(r=>r&&typeof r==='object'&&canSeeRecord(r,actorId,key)).map(r=>m?project(m,name,r):structuredClone(r));
 }
 return {format:'bayit-extension-records',version:1,module:moduleId,name:moduleName(state,moduleId),installed:!!m,exportedAt:new Date().toISOString(),householdId:state.householdId,memberId:actorId,records};
}
// Deletes one module's whole stored slice. Parents only, and the caller names the module twice (confirm).
// Never automatic: removing an extension's code never calls this.
export function dropModuleData(state,moduleId,{role,confirm}){
 if(role!=='parent')throw Error('A parent deletes an extension’s data.');
 if(confirm!==moduleId)throw Error('Confirm which extension’s data to delete.');
 if(!state.extensions||!Object.hasOwn(state.extensions,moduleId))throw Error('There is no stored data for this extension.');
 const next=structuredClone(state);delete next.extensions[moduleId];
 if(!Object.keys(next.extensions).length)delete next.extensions;
 return next;
}

// A new record as a module screen starts it: owned by the member, "Only me" until they share it (design §5).
export function newModuleRecord(fields={},{actorId,now=new Date().toISOString(),id}={}){
 const rid=id||('r'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2))).replace(/[^A-Za-z0-9_-]/g,'');
 return {...fields,id:rid,ownerId:actorId,visibility:'private',allowedIds:[],createdAt:now,createdBy:actorId};
}
