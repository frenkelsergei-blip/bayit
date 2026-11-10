// בית AI conversation history (user request 2026-11-10). Each question and answer asked in the app is kept for the
// person who asked it only (never shared, never shown to parents or other adults). Pages of 20, newest first, with a
// search over questions and answers. A conversation can be reopened and continued; deleting removes it for good.
// GET    /api/ai-history?q=&before=<updatedAt:id>&limit=20 → {conversations:[{id,title,scope,updatedAt,turns,snippet}],next}
// GET    /api/ai-history/<id>                         → {conversation,turns:[{seq,question,answer,plan,sources,voice,createdAt}]}
// DELETE /api/ai-history/<id>
import {stateFeatureContext} from '../../shared/features.mjs';
import {json,fail} from './util.mjs';
import {stripEmoji} from '../../shared/answer-format.mjs';

const missing=e=>/no such table/i.test(String(e?.message||e));
const idOk=v=>typeof v==='string'&&/^[A-Za-z0-9-]{8,64}$/.test(v);
const parse=(v,f)=>{try{return v?JSON.parse(v):f}catch{return f}};
const clip=(s,n)=>String(s||'').replace(/\s+/g,' ').trim().slice(0,n);

// Called after a successful chat answer. Never fails the answer: history is a convenience.
export async function saveTurn(env,home,memberId,{conversationId,question,result,scope,voice}){
 if(!idOk(conversationId))return null;
 try{
  const now=Date.now(),row=await env.DB.prepare('SELECT member_id,turns FROM ai_conversations WHERE household_id=? AND id=?').bind(home.id,conversationId).first();
  if(row&&row.member_id!==memberId)return null; // someone else's id: never append
  const seq=(row?.turns||0)+1,plan=result?.plan?JSON.stringify(result.plan).slice(0,60000):null,sources=JSON.stringify((result?.sources||[]).slice(0,20));
  await env.DB.batch([
   row?env.DB.prepare('UPDATE ai_conversations SET updated_at=?,turns=? WHERE household_id=? AND id=?').bind(now,seq,home.id,conversationId)
      :env.DB.prepare('INSERT INTO ai_conversations(household_id,id,member_id,title,scope,created_at,updated_at,turns) VALUES(?,?,?,?,?,?,?,1)').bind(home.id,conversationId,memberId,clip(question,90),scope==='private'?'private':'family',now,now),
   env.DB.prepare('INSERT INTO ai_turns(household_id,conversation_id,seq,member_id,question,answer,plan,sources,voice,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(home.id,conversationId,seq,memberId,clip(question,2000),String(result?.answer||'').slice(0,20000),plan,sources,Math.max(0,Math.min(600,Number(voice)||0)),now)
  ]);
  return seq;
 }catch(e){if(missing(e))return null;throw e}
}

export async function handleAIHistory(request,env,home,path){
 const me=home.membership.member_id;
 if(!stateFeatureContext(home.state,me).on('ai'))throw fail('Bayit AI is turned off in Bayit.',403);
 const id=decodeURIComponent(path.replace(/^\/api\/ai-history\/?/,''));
 try{
  if(!id&&request.method==='GET'){
   const url=new URL(request.url),q=clip(url.searchParams.get('q'),80),cur=/^(\d{1,16}):([A-Za-z0-9-]{8,64})$/.exec(url.searchParams.get('before')||''),bAt=cur?Number(cur[1]):Number.MAX_SAFE_INTEGER,bId=cur?cur[2]:'~',limit=Math.min(40,Math.max(5,Number(url.searchParams.get('limit'))||20));
   const like='%'+q.replace(/[\\%_]/g,m=>'\\'+m)+'%';
   const rows=(q?await env.DB.prepare("SELECT c.*,(SELECT CASE WHEN t.question LIKE ? ESCAPE '\\' THEN t.question ELSE t.answer END FROM ai_turns t WHERE t.household_id=c.household_id AND t.conversation_id=c.id AND (t.question LIKE ? ESCAPE '\\' OR t.answer LIKE ? ESCAPE '\\') ORDER BY t.seq LIMIT 1) AS hit FROM ai_conversations c WHERE c.household_id=? AND c.member_id=? AND (c.updated_at<? OR (c.updated_at=? AND c.id<?)) AND (c.title LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM ai_turns t WHERE t.household_id=c.household_id AND t.conversation_id=c.id AND (t.question LIKE ? ESCAPE '\\' OR t.answer LIKE ? ESCAPE '\\'))) ORDER BY c.updated_at DESC,c.id DESC LIMIT ?").bind(like,like,like,home.id,me,bAt,bAt,bId,like,like,like,limit+1).all()
     :await env.DB.prepare("SELECT c.*,(SELECT t.answer FROM ai_turns t WHERE t.household_id=c.household_id AND t.conversation_id=c.id ORDER BY t.seq DESC LIMIT 1) AS hit FROM ai_conversations c WHERE c.household_id=? AND c.member_id=? AND (c.updated_at<? OR (c.updated_at=? AND c.id<?)) ORDER BY c.updated_at DESC,c.id DESC LIMIT ?").bind(home.id,me,bAt,bAt,bId,limit+1).all()).results;
   const page=rows.slice(0,limit);
   return json({conversations:page.map(r=>({id:r.id,title:r.title,scope:r.scope,createdAt:r.created_at,updatedAt:r.updated_at,turns:r.turns,snippet:snippet(r.hit,q)})),next:rows.length>limit?page.at(-1).updated_at+':'+page.at(-1).id:null});
  }
  if(!idOk(id))throw fail('Choose a conversation.',400);
  const c=await env.DB.prepare('SELECT * FROM ai_conversations WHERE household_id=? AND id=? AND member_id=?').bind(home.id,id,me).first();
  if(!c)throw fail('This conversation is not available.',404);
  if(request.method==='GET'){
   const turns=(await env.DB.prepare('SELECT seq,question,answer,plan,sources,voice,created_at FROM ai_turns WHERE household_id=? AND conversation_id=? ORDER BY seq LIMIT 200').bind(home.id,id).all()).results;
   return json({conversation:{id:c.id,title:c.title,scope:c.scope,createdAt:c.created_at,updatedAt:c.updated_at,turns:c.turns},turns:turns.map(t=>({seq:t.seq,question:t.question,answer:t.answer,plan:parse(t.plan,null),sources:parse(t.sources,[]),voice:t.voice,createdAt:t.created_at}))});
  }
  if(request.method==='DELETE'){
   await env.DB.batch([env.DB.prepare('DELETE FROM ai_turns WHERE household_id=? AND conversation_id=?').bind(home.id,id),env.DB.prepare('DELETE FROM ai_conversations WHERE household_id=? AND id=? AND member_id=?').bind(home.id,id,me)]);
   return json({ok:true});
  }
 }catch(e){if(missing(e))return request.method==='GET'?json({available:false,conversations:[],next:null}):json({error:'Conversation history is being set up on this server.'},503);throw e}
 throw fail('Unknown endpoint.',404);
}
// A short text around the search hit (or the start of the last answer), without Markdown stars.
function snippet(text,q){
 const s=stripEmoji(text).replace(/\*\*|__|^#+\s*/gm,'').replace(/^\s*[-•·*]\s+/gm,'').replace(/\s+/g,' ').trim();if(!s)return '';
 if(!q)return s.slice(0,120);const i=s.toLowerCase().indexOf(q.toLowerCase());if(i<0)return s.slice(0,120);
 const from=Math.max(0,i-40);return (from?'…':'')+s.slice(from,from+120);
}
