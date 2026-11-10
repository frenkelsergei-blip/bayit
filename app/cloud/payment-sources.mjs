// Payment sources on the server: the family's per-card choices (finance_sources, migration 0018) and the schema check
// that lets everything work before that migration is applied.
import {fail} from './util.mjs';
import {sourceOf,paymentSources} from '../../shared/payment-sources.mjs';

const cache=new WeakMap();
// Which parts of migration 0018 exist. Cached briefly per database; a missing part is re-checked within a second.
export async function sourceSchema(env){
 const db=env.DB,hit=cache.get(db);if(hit&&hit.until>Date.now())return hit.value;
 const value={label:false,sources:false};
 try{value.label=!!await db.prepare("SELECT 1 FROM pragma_table_info('finance_transactions') WHERE name='account_label'").first()}catch{}
 try{value.sources=!!await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='finance_sources'").first()}catch{}
 cache.set(db,{value,until:Date.now()+(value.label&&value.sources?60000:1000)});return value;
}

const fromRow=r=>({key:r.source_key,last4:r.last4||null,ownerId:r.owner_id||null,shared:r.shared===null||r.shared===undefined?null:!!r.shared,label:r.label||null});
// Saved choices for the sources the viewer has rows from (a private card's choices stay with its private rows).
export async function savedSourcesFor(env,householdId,transactions){
 if(!(await sourceSchema(env)).sources)return [];
 const keys=new Set(transactions.map(t=>sourceOf(t)?.key).filter(Boolean));if(!keys.size)return [];
 const rows=(await env.DB.prepare('SELECT * FROM finance_sources WHERE household_id=?').bind(householdId).all()).results;
 return rows.filter(r=>keys.has(r.source_key)).map(fromRow);
}

// One statement for saving a choice (used by the API and by statement import).
export function saveSourceStatement(env,householdId,actorId,{key,last4=null,ownerId=null,shared=null,label=null}){
 return env.DB.prepare('INSERT INTO finance_sources(household_id,source_key,last4,owner_id,shared,label,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(household_id,source_key) DO UPDATE SET last4=excluded.last4,owner_id=excluded.owner_id,shared=excluded.shared,label=excluded.label,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(householdId,key,last4,ownerId,shared===null?null:shared?1:0,label,actorId,Date.now());
}

// PUT /api/finance/sources {key, ownerId, shared, last4, label}. Any adult who can see rows from the source may set it.
export async function updateSource(env,home,actorId,body,visibleTransactions){
 if(!(await sourceSchema(env)).sources)throw fail('This installation needs its database update before cards can be edited. Ask the person who hosts it to update.',409);
 const key=String(body?.key||'');if(!key||key.length>120)throw fail('Choose a card or account.');
 if(key.startsWith('manual:'))throw fail('Recorded entries are not a card or account.');
 const index=paymentSources(visibleTransactions);
 if(!visibleTransactions.some(t=>sourceOf(t)?.key===key))throw fail('This card or account is unavailable.',404);
 const adults=new Set(home.state.members.filter(m=>m.role!=='child').map(m=>m.id));
 const ownerId=body.ownerId==null||body.ownerId===''?null:String(body.ownerId);if(ownerId&&!adults.has(ownerId))throw fail('Choose an adult in this home.');
 const last4=body.last4==null||body.last4===''?null:String(body.last4);if(last4&&!/^\d{4}$/.test(last4))throw fail('Enter the last four digits.');
 const label=body.label==null?null:String(body.label).trim().slice(0,40)||null;
 const shared=body.shared===true?true:body.shared===false?false:null;
 // A statement card already shows its digits; only RiseUp sources (or unknown endings) take typed digits.
 const raw=index.list.find(s=>s.keys.includes(key));if(last4&&raw?.keys.length===1&&/^[a-z]+:\d{4}$/.test(key)&&!key.endsWith(':'+last4))throw fail('This card’s ending comes from its statement.');
 await saveSourceStatement(env,home.id,actorId,{key,last4,ownerId:shared?null:ownerId,shared,label}).run();
 return {saved:true,key};
}
