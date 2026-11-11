// Where a record list lives in household state (feature modules, work package 2.5, docs/feature-module-design.md §2.1).
// Core lists are top-level arrays: state.tasks, state.events, … A feature module's records live in a namespaced slice,
// state.extensions[<moduleId>][<collection>], and its change ops use the key 'ext:<moduleId>/<collection>'.
// Pure helpers, shared by the server (state.mjs), offline sync, merge and the client.
const EXT=/^ext:([a-z][a-z0-9-]{1,39})\/([a-z][A-Za-z0-9]{0,39})$/;
export const extKey=(module,collection)=>'ext:'+module+'/'+collection;
// {module, collection} for an 'ext:' key, otherwise null.
export function parseExtKey(key){const m=typeof key==='string'?EXT.exec(key):null;return m?{module:m[1],collection:m[2]}:null}
// A module record id never contains ':' or '/', so 'ext:m/c:<id>' keys (pendingKeys) stay unambiguous.
export const validExtId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,140}$/.test(id);
const own=(o,k)=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.hasOwn(o,k);
export function recordList(state,key){
 const ref=parseExtKey(key);if(!ref)return state?.[key];
 const slice=own(state?.extensions,ref.module)?state.extensions[ref.module]:null;
 return own(slice,ref.collection)?slice[ref.collection]:undefined;
}
export function setRecordList(state,key,list){
 const ref=parseExtKey(key);if(!ref){state[key]=list;return state}
 if(!state.extensions||typeof state.extensions!=='object'||Array.isArray(state.extensions))state.extensions={};
 if(!own(state.extensions,ref.module))state.extensions[ref.module]={};
 state.extensions[ref.module][ref.collection]=list;return state;
}
// Every 'ext:m/c' key present in a state (installed or not; callers decide what they may touch).
export function extKeys(state){
 const out=[];const ext=state?.extensions;if(!ext||typeof ext!=='object'||Array.isArray(ext))return out;
 for(const [m,slice]of Object.entries(ext))if(slice&&typeof slice==='object'&&!Array.isArray(slice))for(const [c,list]of Object.entries(slice))if(Array.isArray(list)){const key=extKey(m,c);if(parseExtKey(key))out.push(key)}
 return out;
}
// Client helpers for a module screen: add/replace or remove one record in a draft state (app.update(draft=>…)).
export function putRecord(state,key,record){const list=[...(recordList(state,key)||[])],i=list.findIndex(r=>r?.id===record.id);if(i<0)list.push(record);else list[i]=record;return setRecordList(state,key,list)}
export function dropRecord(state,key,id){return setRecordList(state,key,(recordList(state,key)||[]).filter(r=>r?.id!==id))}
