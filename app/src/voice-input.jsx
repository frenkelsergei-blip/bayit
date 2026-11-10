// Voice questions (user request 2026-11-10, board ד): tap the microphone, speak up to 2 minutes (live level bars and
// a timer), then the bin cancels or Send turns it into text on the household's own speech service (/api/voice). The
// recording is never kept. Without that service (or offline/demo) it falls back to browser dictation or explains the
// keyboard microphone, like the existing Dictation control.
import React,{useEffect,useRef,useState} from 'react';
import {Microphone,Trash,PaperPlaneTilt,CircleNotch} from '@phosphor-icons/react';
import {cloudHeaders} from './cloud-transport';
import {Dictation} from './dictation';
import './voice-input.css';

let status=null,statusAt=0;
async function voiceStatus(){
 if(status&&Date.now()-statusAt<120000)return status;
 try{const r=await fetch('/api/voice',{headers:cloudHeaders(),cache:'no-store'});status=r.ok?await r.json():{available:false}}catch{status={available:false}}
 statusAt=Date.now();return status;
}
const pickType=()=>{const M=window.MediaRecorder;if(!M)return null;for(const t of ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'])if(M.isTypeSupported?.(t))return t;return ''};

// onText(text,{voice:true,seconds}) receives the transcript. `compact` keeps the idle button the size of an icon button.
export function VoiceInput({a,onText,disabled=false,value='',onChange}){
 const [ready,setReady]=useState(null),[state,setState]=useState('idle'),[seconds,setSeconds]=useState(0),[levels,setLevels]=useState([]),[error,setError]=useState('');
 const rec=useRef(null),chunks=useRef([]),stream=useRef(null),timer=useRef(null),raf=useRef(0),started=useRef(0),cancelled=useRef(false);
 const T=a.T,max=(ready?.maxSeconds)||120;
 useEffect(()=>{let live=true;if(a.cloud)voiceStatus().then(s=>live&&setReady(s));else setReady({available:false});return()=>{live=false;stop(true)}},[a.cloud]);
 useEffect(()=>{if(seconds>=max&&state==='recording')finish()},[seconds]);
 function cleanup(){clearInterval(timer.current);cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null}
 function stop(cancel){cancelled.current=!!cancel;try{rec.current?.state==='recording'&&rec.current.stop()}catch{}cleanup()}
 async function start(){
  setError('');
  try{
   const s=await navigator.mediaDevices.getUserMedia({audio:true});stream.current=s;const type=pickType();
   const r=new MediaRecorder(s,type?{mimeType:type}:undefined);rec.current=r;chunks.current=[];cancelled.current=false;
   r.ondataavailable=e=>{if(e.data?.size)chunks.current.push(e.data)};
   r.onstop=()=>{if(!cancelled.current)send(new Blob(chunks.current,{type:r.mimeType||type||'audio/webm'}))};
   r.start(250);started.current=Date.now();setSeconds(0);setState('recording');
   timer.current=setInterval(()=>setSeconds(Math.floor((Date.now()-started.current)/1000)),250);
   try{const ctx=new (window.AudioContext||window.webkitAudioContext)(),an=ctx.createAnalyser();an.fftSize=64;ctx.createMediaStreamSource(s).connect(an);const data=new Uint8Array(an.frequencyBinCount);
    const tick=()=>{an.getByteFrequencyData(data);const v=Math.min(1,data.reduce((n,x)=>n+x,0)/data.length/90);setLevels(l=>[...l.slice(-27),v]);raf.current=requestAnimationFrame(tick)};tick()}catch{}
  }catch{cleanup();setState('idle');setError(T('Allow the microphone for Bayit in your browser settings, or use the keyboard microphone.','אפשרו גישה למיקרופון עבור Bayit בהגדרות הדפדפן, או השתמשו במיקרופון של המקלדת.'))}
 }
 function finish(){if(state!=='recording')return;setState('sending');stop(false)}
 function cancel(){stop(true);setState('idle');setLevels([])}
 async function send(blob){
  const secs=Math.max(1,Math.round((Date.now()-started.current)/1000));
  try{
   const r=await fetch('/api/voice/transcribe',{method:'POST',headers:{...cloudHeaders(),'Content-Type':(blob.type||'audio/webm').split(';')[0],'X-Voice-Seconds':String(secs)},body:blob});
   const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||T('The recording could not be turned into text.','לא הצלחנו להפוך את ההקלטה לטקסט.'));
   setState('idle');setLevels([]);onText?.(j.text,{voice:true,seconds:secs});
  }catch(e){setState('idle');setLevels([]);setError(e.message)}
 }
 if(ready&&!ready.available)return onChange?<Dictation language={a.lang} value={value} onChange={onChange} disabled={disabled}/>:null;
 const mm=String(Math.floor(seconds/60))+':'+String(seconds%60).padStart(2,'0');
 return <span className={'voice-input '+state}>
  {state==='idle'&&<button type="button" className="icon-button voice-mic" disabled={disabled||!ready} onClick={start} aria-label={T('Record a voice message','הקלטת הודעה קולית')}><Microphone size={22} weight="fill"/></button>}
  {state!=='idle'&&<span className="voice-bar" role="group" aria-label={T('Recording','הקלטה')}>
   <button type="button" className="icon-button voice-cancel" onClick={cancel} disabled={state==='sending'} aria-label={T('Cancel the recording','ביטול ההקלטה')}><Trash size={20}/></button>
   {state==='recording'&&<span className="voice-wave" aria-hidden="true">{state==='recording'&&<i className="voice-dot"/>}{Array.from({length:28},(_,i)=>{const v=levels[levels.length-28+i]??0;return <b key={i} style={{height:Math.round(4+v*22)+'px'}}/>})}</span>}
   {state==='sending'?<span className="voice-busy" role="status"><CircleNotch size={20} weight="bold" className="voice-spin" aria-hidden="true"/>{T('Turning your voice into text…','הופך את ההקלטה לטקסט…')}</span>
    :<><span className="voice-time" dir="ltr" aria-live="off">{mm}</span><button type="button" className="icon-button voice-send" onClick={finish} aria-label={T('Stop and send','עצירה ושליחה')}><PaperPlaneTilt size={20} weight="fill"/></button></>}
  </span>}
  {error&&<span role="alert" className="voice-error">{error}</span>}
 </span>;
}
