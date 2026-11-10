// Joins a core registry with its local extension list (shared/extensions/*, app/cloud/extensions/*).
// Every extra entry passes the same check as core entries; a bad one throws when the module loads, so the
// tests (and the app's start) fail loudly instead of the entry being skipped quietly at runtime.
// check(entry, all) returns '' when the entry is valid, otherwise what is wrong.
export function joinRegistry(seam,core,extra,check){
 if(!Array.isArray(extra))throw Error('Bayit extensions: the local '+seam+' registry must export an array.');
 const all=[...core,...extra],seen=new Set();
 for(const entry of all){
  const id=entry&&typeof entry==='object'?entry.id:undefined,where='Bayit '+seam+' "'+(id??'(no id)')+'": ';
  if(typeof id!=='string'||!/^[a-z][a-z0-9_-]{1,39}$/.test(id))throw Error(where+'needs an id of lowercase letters, digits, - or _.');
  if(seen.has(id))throw Error(where+'this id is already registered.');
  seen.add(id);
  const problem=check(entry,all);
  if(problem)throw Error(where+problem);
 }
 return all;
}
