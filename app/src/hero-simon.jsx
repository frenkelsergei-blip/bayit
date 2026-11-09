import React,{useEffect,useRef,useState} from 'react';
import {Play,ArrowClockwise,SpeakerHigh,SpeakerSlash,Check} from '@phosphor-icons/react';
import {HERO_RHYTHM_PADS} from '../../shared/hero-games.mjs';
import './hero-simon.css';
import {HeroLifeSprite} from './hero-life-sprite';

const colors=[['Red','אדום'],['Yellow','צהוב'],['Green','ירוק'],['Blue','כחול']];
export function SimonGame({a,game,trace,move,locked,feedback,profile,who}){
 const [phase,setPhase]=useState('ready'),[lit,setLit]=useState(null),[sound,setSound]=useState(true),[answer,setAnswer]=useState([]),[audioError,setAudioError]=useState(false),[result,setResult]=useState(null),[missed,setMissed]=useState(null);
 const panel=useRef(null);
 useEffect(()=>{const fit=()=>requestAnimationFrame(()=>{const node=panel.current;if(!node)return;const r=node.getBoundingClientRect(),header=document.querySelector('.bayit-shell-header')?.getBoundingClientRect(),footer=document.querySelector('.bayit-shell-nav[data-position=bottom]')?.getBoundingClientRect(),top=(header?.bottom||0)+10,bottom=(footer?.top||innerHeight)-12;if(r.height<=bottom-top&&r.bottom>bottom)window.scrollBy({top:r.bottom-bottom,behavior:'instant'})});fit();window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit)},[]);
 const playRef=useRef(null),autoTimer=useRef(null),audio=useRef(null),serial=useRef(0),timers=useRef(new Set()),pressed=useRef(false),pending=useRef(null);
 // A new round starts only after its preceding answer has been confirmed.
 const confirmed=game.progress||[];let round=0,offset=0;
 for(;round<game.rounds.length;round++){if(confirmed.length<offset+game.rounds[round].length)break;offset+=game.rounds[round].length}
 const done=round===game.rounds.length,pattern=game.rounds[round]||[];
 const clear=()=>{serial.current++;for(const id of timers.current)clearTimeout(id);timers.current.clear();setLit(null)};
 useEffect(()=>{setAnswer([]);pending.current=null;setPhase('ready');pressed.current=false},[round,game.id]);
 // Audit 08: after a correct round the next one starts by itself about two seconds later; after a mistake the
 // same round replays. The Play button stays available to start or replay at any time.
 const later=(ms)=>{clearTimeout(autoTimer.current);autoTimer.current=setTimeout(()=>{autoTimer.current=null;playRef.current?.()},ms)};
 useEffect(()=>{if(result?.kind==='correct'&&!done&&phase==='ready')later(2000)},[round,result?.id,phase,done]);
 useEffect(()=>()=>clearTimeout(autoTimer.current),[]);
 useEffect(()=>{const hide=()=>{if(document.hidden){clear();clearTimeout(autoTimer.current);setResult(null);setPhase('ready');setAnswer([])}};document.addEventListener('visibilitychange',hide);return()=>{clear();audio.current?.close().catch(()=>{});document.removeEventListener('visibilitychange',hide)}},[]);
 const wait=ms=>new Promise(resolve=>{const id=setTimeout(()=>{timers.current.delete(id);resolve()},ms);timers.current.add(id)});
 const ensureAudio=async()=>{if(!sound)return;try{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw Error();audio.current??=new Context();await audio.current.resume();setAudioError(false)}catch{setAudioError(true)}};
 const tone=pad=>{if(!sound||audio.current?.state!=='running')return;const ctx=audio.current,osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=HERO_RHYTHM_PADS[pad][4];gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.10,ctx.currentTime+.02);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.35);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.36)};
 const play=async()=>{if(locked||done||phase==='watch'||phase==='saving')return;clearTimeout(autoTimer.current);clear();setResult(null);setMissed(null);setAnswer([]);pressed.current=false;setPhase('watch');feedback('');await ensureAudio();const token=serial.current;await wait(250);for(const pad of pattern){if(serial.current!==token)return;setLit(pad);tone(pad);await wait(550);if(serial.current!==token)return;setLit(null);await wait(250)}if(serial.current===token)setPhase('input')};
 const saveAnswer=async next=>{setPhase('saving');pending.current=next;const ok=await move(next);if(!ok){setPhase('save-error');feedback(a.T('Your pattern is safe. Try saving again.','הרצף שלכם נשמר כאן. אפשר לנסות לשמור שוב.'))}else{setResult({kind:round+1===game.rounds.length?'done':'correct',id:Date.now()});feedback(a.T('Correct!','נכון!'));if(round+1===game.rounds.length)setPhase('done')}};
 playRef.current=play;
 const tap=async pad=>{if(locked||phase!=='input'||pressed.current)return;pressed.current=true;setLit(pad);tone(pad);const next=[...answer,pad];if(pad!==pattern[answer.length]){setAnswer([]);setPhase('retry');setMissed(pad);setResult({kind:'mistake',id:Date.now()});feedback(a.T('Oops, not that one. Watch again.','אופס, לא זה. מסתכלים שוב.'));later(2200)}else{setAnswer(next);if(next.length===pattern.length)void saveAnswer([...confirmed.slice(0,offset),...pattern])}await wait(180);setLit(null);pressed.current=false};
 const status=done?a.T('You did it!','הצלחתם!'):result?.kind==='correct'&&phase==='ready'?a.T('Correct! Next round…','נכון! עוד רגע הרצף הבא…'):result?.kind==='mistake'?a.T('Oops! Watch again…','אופס! מסתכלים שוב…'):phase==='watch'?a.T('Watch and listen…','מסתכלים ומקשיבים…'):phase==='input'?a.T('Your turn!','עכשיו תורכם!'):phase==='retry'?a.T('Let’s try that pattern again','ננסה שוב את הרצף'):phase==='saving'?a.T('Saving this round…','שומרים את הרצף…'):phase==='save-error'?a.T('Try saving again','ננסה לשמור שוב'):a.T('Watch, then copy the colors','מסתכלים וחוזרים על הצבעים');
 const banner=result&&(phase==='ready'||phase==='retry'||phase==='done')?result.kind:null;
 return <div ref={panel} className="hero-simon" data-phase={phase} data-result={banner||undefined}>
  <div className="simon-instructions"><div className="simon-character"><HeroLifeSprite profile={profile} who={who} active={lit!==null||done} row={3}/></div><div className="simon-status" role="status" aria-live="polite"><strong>{status}</strong><span>{done?a.T('All rounds complete','כל הרצפים הושלמו'):a.T('Round '+(round+1)+' of '+game.rounds.length,'רצף '+(round+1)+' מתוך '+game.rounds.length)}</span></div>
   <button type="button" className="hero-small-button simon-sound" aria-pressed={sound} onClick={()=>{setSound(!sound);if(sound)audio.current?.suspend().catch(()=>{})}}>{sound?<SpeakerHigh size={19}/>:<SpeakerSlash size={19}/>} {a.T('Sound','צליל')}</button>
   {!done&&<button type="button" className="button simon-play" disabled={locked||phase==='watch'||phase==='saving'} onClick={()=>phase==='save-error'?saveAnswer(pending.current):play()}>{phase==='save-error'?<Check size={20}/>:phase==='ready'?<Play size={20}/>:<ArrowClockwise size={20}/>} {phase==='watch'?a.T('Listen…','מקשיבים…'):phase==='save-error'?a.T('Retry save','לנסות לשמור'):banner==='correct'?a.T('Next round now','לרצף הבא עכשיו'):phase==='ready'&&round===0&&!confirmed.length?a.T('Play the colors','מנגנים את הצבעים'):phase==='ready'?a.T('Play this round','מנגנים את הרצף'):a.T('Hear it again','שומעים שוב')}</button>}
   <p>{a.T('Four colors. Watch the lights, then tap the same order.','ארבעה צבעים. רואים את האורות ולוחצים באותו הסדר.')}</p>
   <span className="simon-answer-count">{phase==='input'?<bdi>{answer.length} / {pattern.length}</bdi>:audioError?a.T('Sound unavailable · follow the lights','הצליל לא זמין · עוקבים אחר האורות'):a.T('No rush. You can listen again.','אין למהר. תמיד אפשר לשמוע שוב.')}</span>
  </div>
  <div className="simon-pads" role="group" aria-label={a.T('Repeat the colors','חוזרים על הצבעים')}>
   {colors.map(([en,he],i)=><button type="button" key={en} data-pad={i} className={'simon-pad simon-pad-'+i+(lit===i?' is-lit':'')+(banner==='mistake'&&missed===i?' is-missed':'')} aria-label={a.T(en,he)} aria-pressed={lit===i} disabled={locked||phase!=='input'||done||pressed.current} onClick={()=>tap(i)}><span className="simon-light-art" aria-hidden="true"/><span className="simon-light-art simon-light-glow" aria-hidden="true"/></button>)}
   {banner&&<div key={result.id} className={'simon-result is-'+banner} aria-hidden="true"><img src={'/assets/icons/bayit/pixel/'+(banner==='mistake'?'heart-badge':banner==='done'?'trophy':'yellow-star')+'-256.png'} alt=""/><strong>{banner==='mistake'?a.T('Oops! Not that one','אופס! לא זה'):banner==='done'?a.T('All five rounds!','כל חמשת הרצפים!'):a.T('Correct!','נכון!')}</strong><span>{banner==='mistake'?a.T('Watch the lights again','מסתכלים שוב על האורות'):banner==='done'?a.T('Collecting your prize…','אוספים את הפרס…'):a.T('Next round in a moment','עוד רגע הרצף הבא')}</span></div>}
  </div>
 </div>;
}
