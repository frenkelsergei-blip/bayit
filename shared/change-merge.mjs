import {parseExtKey,recordList} from './record-paths.mjs';
// Three-way field merge for an explicitly rejected revision. A sharing change always requires a fresh edit.
const equal=(a,b)=>a==null&&b==null||JSON.stringify(a)===JSON.stringify(b);
const sharing=['ownerId','visibility','allowedIds','listId','editPolicy','editorIds'];
const conflict=()=>Object.assign(Error('This item changed on another device. Reopen it and review the latest version before saving.'),{status:409,code:'EDIT_CONFLICT'});
export function rebaseChanges(changes,state){
 const out=[];
 for(const op of changes){
  const collection=parseExtKey(op.collection)?recordList(state,op.collection):state[op.collection],current=op.collection==='members'?collection:op.collection==='favorites'?state.favoriteIcons:op.collection==='customIcons'?collection:Array.isArray(collection)?collection.find(r=>r.id===op.id):collection?.[op.id];
  if(op.delete&&!current||!op.delete&&equal(current,op.value))continue;
  if(!Object.hasOwn(op,'before'))throw conflict();
  const before=op.before;
  if(equal(current,before)){out.push({...op,before:current});continue}
  if(op.delete||!current||!before||!op.value||typeof current!=='object'||Array.isArray(current)||['members','customIcons','favorites'].includes(op.collection))throw conflict();
  if(sharing.some(k=>!equal(before[k],current[k])||!equal(before[k],op.value[k])))throw conflict();
  const merged=structuredClone(current);
  for(const key of new Set([...Object.keys(before),...Object.keys(op.value)])){
   if(equal(before[key],op.value[key]))continue;
   if(!equal(current[key],before[key])&&!equal(current[key],op.value[key]))throw conflict();
   if(Object.hasOwn(op.value,key))merged[key]=op.value[key];else delete merged[key];
  }
  out.push({...op,before:current,value:merged});
 }
 return out;
}
