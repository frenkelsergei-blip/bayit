import {bodyJSON,decryptKey,encryptKey,fail,json,loopbackOr} from './util.mjs';
import {visibleState} from './state.mjs';
import {normalizeLocation} from '../../shared/locations.mjs';

const error=(code,message,status=400)=>Object.assign(fail(message,status),{code});
const language=value=>value==='he'?'he':'en';
const keyText=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{20,200}$/.test(value.trim())?value.trim():'';
const placeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value)?value:'';
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(value)?value:'';
async function provider(env,key,path,body,fields){
 let response;
 try{response=await fetch(loopbackOr(env.MAPS_TEST_ORIGIN,'https://places.googleapis.com')+'/v1/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,...(fields?{'X-Goog-FieldMask':fields}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)})}
 catch{throw error('MAPS_UNAVAILABLE','Google Maps could not be reached. Try again or keep a manual location.',502)}
 // Never forward provider error text: it can contain a credential or the searched address.
 if(!response.ok)throw error(response.status===429?'MAPS_QUOTA':'MAPS_REJECTED',response.status===429?'Google Maps quota or rate limit reached.':'Google Maps rejected this request. Check the API and key restrictions.',response.status===429?429:502);
 try{return await response.json()}catch{throw error('MAPS_UNAVAILABLE','Google Maps returned an unreadable response.',502)}
}
async function limit(env,home){
 const minute=Math.floor(Date.now()/60000),actor=home.membership.member_id;
 const used=await env.DB.prepare('INSERT INTO maps_usage(household_id,member_id,minute,requests) VALUES(?,?,?,1) ON CONFLICT(household_id,member_id,minute) DO UPDATE SET requests=requests+1 RETURNING requests').bind(home.id,actor,minute).first();
 if(used.requests>60)throw error('MAPS_RATE','Wait a moment before searching again.',429);
 await env.DB.prepare('DELETE FROM maps_usage WHERE household_id=? AND minute<?').bind(home.id,minute-2).run();
}
async function stored(env,id){try{return await env.DB.prepare('SELECT * FROM maps_connections WHERE household_id=?').bind(id).first()}catch(cause){if(/no such table.*maps_connections/i.test(cause?.message||''))throw error('MAPS_SETUP_PENDING','Maps setup is waiting for a database update. Manual locations are still available.',503);throw cause}}
function status(row,env,home){return {available:!!env.APP_ENCRYPTION_KEY,configured:!!(env.APP_ENCRYPTION_KEY&&row?.places_ciphertext&&row?.embed_ciphertext),searchVerifiedAt:row?.search_verified_at||null,mapConfigured:!!row?.embed_ciphertext,mapVerified:false,canManage:home.membership.role==='parent'}}
function recordLocation(home,body){
 if(!['events','tasks','places'].includes(body.collection)||typeof body.recordId!=='string')throw error('MAPS_RECORD','This location is unavailable.',404);
 const record=visibleState(home.state,home.membership.member_id)[body.collection]?.find(r=>r.id===body.recordId);
 if(!record)throw error('MAPS_RECORD','This location is unavailable.',404);
 return normalizeLocation(record.location);
}
const escapeHTML=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function handleMapsAPI(request,env,home,path,url=new URL(request.url)){
 const action=path.split('/').at(-1),parent=home.membership.role==='parent';
 const row=await stored(env,home.id);
 if(action==='status'&&request.method==='GET')return json(status(row,env,home));
 if(action==='credentials'){
  if(!parent)throw error('MAPS_MANAGE','A parent manages the household Maps connection.',403);
  if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM maps_connections WHERE household_id=?').bind(home.id).run();return json(status(null,env,home))}
  if(request.method!=='POST')throw fail('Method not allowed.',405);
  if(!env.APP_ENCRYPTION_KEY)throw error('MAPS_ENCRYPTION','Server credential encryption is not configured.',503);
  const body=await bodyJSON(request,3000),places=keyText(body.placesKey),embed=keyText(body.embedKey);
  if(!places||!embed||places===embed)throw error('MAPS_KEYS','Use separate restricted keys for Places (server) and Embed (browser).');
  // One explicit public-place request verifies SEARCH only. An HTTP iframe load cannot verify a map.
  await provider(env,places,'places:autocomplete',{input:'Tel Aviv',languageCode:language(body.language),sessionToken:crypto.randomUUID()});
  const placesCipher=await encryptKey(places,env,home.id+':maps:places'),embedCipher=await encryptKey(embed,env,home.id+':maps:embed'),now=new Date().toISOString();
  await env.DB.prepare('INSERT INTO maps_connections(household_id,places_ciphertext,embed_ciphertext,search_verified_at,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(household_id) DO UPDATE SET places_ciphertext=excluded.places_ciphertext,embed_ciphertext=excluded.embed_ciphertext,search_verified_at=excluded.search_verified_at,updated_by=excluded.updated_by').bind(home.id,placesCipher,embedCipher,now,home.membership.member_id).run();
  return json(status({places_ciphertext:placesCipher,embed_ciphertext:embedCipher,search_verified_at:now},env,home));
 }
 if(!status(row,env,home).configured)throw error('MAPS_NOT_CONFIGURED','Connect Google Maps in Settings / Connections first.',409);
 if(action==='embed'&&request.method==='GET'){
  let id;if(url.searchParams.has('recordId'))id=recordLocation(home,Object.fromEntries(url.searchParams))?.placeId;else id=placeId(url.searchParams.get('placeId'));
  if(!id)throw error('MAPS_PLACE','Choose a map place.');
  const key=await decryptKey(row.embed_ciphertext,env,home.id+':maps:embed'),src=new URL('https://www.google.com/maps/embed/v1/place');
  src.searchParams.set('key',key);src.searchParams.set('q','place_id:'+id);src.searchParams.set('language',language(url.searchParams.get('language')));
  // The Embed-only website-restricted browser key lives in this isolated same-origin frame, never in
  // React state, app JSON, local storage or the client bundle. The Places server key is never returned.
  const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}iframe{display:block}</style></head><body><iframe title="Google Maps" src="'+escapeHTML(src.href)+'" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></body></html>';
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-src https://www.google.com; frame-ancestors 'self'",'X-Frame-Options':'SAMEORIGIN'}});
 }
 if(request.method!=='POST')throw fail('Method not allowed.',405);
 const body=await bodyJSON(request,3000);
 if(!['autocomplete','place'].includes(action))throw fail('Unknown Maps endpoint.',404);
 const session=body.sessionToken?token(body.sessionToken):'';if(body.sessionToken&&!session)throw error('MAPS_SESSION','Start a new location search.');
 if(action==='autocomplete'&&!session)throw error('MAPS_SESSION','Start a new location search.');
 let id;if(action==='place'){id=body.recordId?recordLocation(home,body)?.placeId:placeId(body.placeId);if(!id)throw error('MAPS_PLACE','Choose a map place.')}
 const input=typeof body.input==='string'?body.input.trim():'';
 if(action==='autocomplete'&&(input.length<2||input.length>180))throw error('MAPS_QUERY','Enter between 2 and 180 characters.');
 await limit(env,home);const key=await decryptKey(row.places_ciphertext,env,home.id+':maps:places');
 if(action==='autocomplete'){
  const data=await provider(env,key,'places:autocomplete',{input,languageCode:language(body.language),sessionToken:session,includeQueryPredictions:false});
  return json({suggestions:(data.suggestions||[]).flatMap(s=>{const p=s.placePrediction;if(!placeId(p?.placeId))return [];return [{placeId:p.placeId,title:String(p.structuredFormat?.mainText?.text||p.text?.text||'').slice(0,300),subtitle:String(p.structuredFormat?.secondaryText?.text||'').slice(0,300)}]}).slice(0,5),attribution:'Google Maps'});
 }
 const params=new URLSearchParams({languageCode:language(body.language)});if(session)params.set('sessionToken',session);
 const data=await provider(env,key,'places/'+encodeURIComponent(id)+'?'+params,undefined,'id,formattedAddress,attributions');
 if(!placeId(data.id)||typeof data.formattedAddress!=='string')throw error('MAPS_PLACE','This place could not be resolved.',502);
 return json({placeId:data.id,address:data.formattedAddress.slice(0,500),attributions:(data.attributions||[]).map(a=>({provider:String(a.provider||'').slice(0,180),uri:/^https:\/\//.test(a.providerUri||'')?a.providerUri:null}))});
}
