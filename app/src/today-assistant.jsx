import React,{useId,useState} from 'react';
import {CalendarDots,ClipboardText,Paperclip,PaperPlaneTilt,Sparkle} from '@phosphor-icons/react';
import {MessageReview,planAvailable} from './message-to-plan';
import {useOnline} from './offline-ui';
import './today-assistant.css';
import {openBayitAI} from './house-ai';
import {BayitAIMark} from './bayit-ai';
import {VoiceInput} from './voice-input';

export function TodayAssistant({a,Avatar}) {
 const title = useId(), offlineNote = useId();
 // Asking goes to the AI page, which needs the connection; a plan can still be drafted by hand offline.
 const online = useOnline();
 const [question,setQuestion] = useState('');
 const [intake,setIntake] = useState(null);
 const todayPrompt = a.T('What’s on today?','מה קורה היום?');
 const ask = value => {
  const query = value.trim();
  if (!query || !online) return;
  // בית AI (2026-11-10): the chat opens over Today and closing it returns here; without the launcher, the AI page.
  setQuestion('');
  if (openBayitAI(query)) return;
  a.todayQuestion.current = {query,user:a.user,household:a.data.householdId};
  a.go('ai');
 };
 // Plans need Tasks or Calendar (features registry); the assistant itself is shown only while Ask AI is on.
 const canPlan = planAvailable(a);
 const prepare = () => setIntake(question.trim());

 return <section className="today-assistant" aria-labelledby={title}>
  <div className="today-assistant-card">
   <h2 id={title}><BayitAIMark size={30}/>{a.T('Ask Bayit AI','שואלים את בית AI')}</h2>
   <form className="today-assistant-form" onSubmit={event => {event.preventDefault();ask(question);}}>
    <input type="text" dir={question ? 'auto' : undefined} value={question} onChange={event => setQuestion(event.target.value)} maxLength={2000}
     placeholder={a.T('Ask or request something…','לשאול או לבקש משהו…')} aria-label={a.T('Question or request','שאלה או בקשה')}/>
    {!question.trim()&&online&&<VoiceInput a={a} onText={text=>ask(text)}/>}
    {canPlan&&<button type="button" className="today-assistant-attach" onClick={prepare} aria-label={a.T('Add a message, photo or PDF','הוספת הודעה, צילום או PDF')}><Paperclip size={23} aria-hidden="true"/></button>}
    <button type="submit" className="today-assistant-send" disabled={!online||!question.trim()} aria-describedby={online?undefined:offlineNote} aria-label={a.T('Send to Bayit','שליחה לבַּיִת')}><PaperPlaneTilt size={23} weight="fill" aria-hidden="true"/></button>
   </form>
   <div className="today-assistant-examples">
    <button type="button" disabled={!online} onClick={() => ask(todayPrompt)}><CalendarDots size={20} aria-hidden="true"/>{todayPrompt}</button>
    {canPlan&&<button type="button" onClick={prepare}><ClipboardText size={20} aria-hidden="true"/>{a.T('Prepare a plan','להכין תוכנית')}</button>}
   </div>
   {!online&&<p id={offlineNote} className="today-assistant-offline">{canPlan?a.T('Asking your home needs a connection. You can still prepare a plan by hand.','כדי לשאול את הבית צריך חיבור. אפשר עדיין להכין תוכנית ידנית.'):a.T('Asking your home needs a connection.','כדי לשאול את הבית צריך חיבור.')}</p>}
  </div>
  {intake!==null && <MessageReview a={a} Avatar={Avatar} initialSource={intake} close={() => setIntake(null)}/>}
 </section>;
}
