import React,{useEffect,useId,useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight,CalendarDots,CaretLeft,CaretRight,LockSimple,Plus,X} from '@phosphor-icons/react';
import {AvatarStack} from './avatar-stack';
import {useMedia} from './detail-panel';
import {anchor} from './data';
import {MONTH_PREVIEW_LIMIT,monthDates,monthDayEvents} from './calendar-month-model.mjs';
import './calendar-event-wide.css';

const sheetQuery='(max-width:1023px), (max-height:520px) and (orientation:landscape)';// Your day beside the month from 1024 (wide screens A, 2026-11-13)

function useMonthModal(open,panel,initialFocus,onClose){
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  if(!open)return;
  const previous=document.activeElement,root=document.getElementById('root'),wasInert=root?.inert,overflow=document.body.style.overflow;
  if(root)root.inert=true;
  document.body.style.overflow='hidden';
  initialFocus.current?.focus({preventScroll:true});
  const key=event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();return}
   if(event.key!=='Tab')return;
   const focusable=[...panel.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node=>node.getClientRects().length);
   const first=focusable[0],last=focusable.at(-1);
   if(!focusable.length){event.preventDefault();initialFocus.current?.focus();return}
   if(event.shiftKey&&(document.activeElement===first||document.activeElement===initialFocus.current)){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===initialFocus.current)){event.preventDefault();first.focus()}
  };
  document.addEventListener('keydown',key);
  return()=>{
   document.removeEventListener('keydown',key);
   document.body.style.overflow=overflow;
   if(root)root.inert=wasInert;
   if(previous?.isConnected)previous.focus({preventScroll:true});
  };
 },[open,panel,initialFocus]);
}

function eventTone(event,a){
 if(event.color)return event.color;
 if(event.memberIds?.length>=a.members.length)return 'yellow';
 return a.member(event.responsibleId||event.memberIds?.[0]||event.ownerId).color||'lilac';
}

function DayEvents({a,day,events,onChoose,Avatar,listRef,onScroll,selectedId,emptyText}){
 const Chevron=a.lang==='he'?CaretLeft:CaretRight;
 return <div ref={listRef} className="month-day-events" onScroll={onScroll}>
  {events.map(event=><button type="button" key={event.id} data-event-id={event.id} className={'month-day-event-row '+eventTone(event,a)+(selectedId===event.id?' focused-event':'')} onClick={()=>onChoose(event.id,day)}>
   <time dir="ltr">{event.time||a.T('All day','כל היום')}</time>
   <span className="month-day-event-copy"><strong dir="auto">{a.text(event)}</strong><small>{event.memberIds?.map(a.name).join(', ')}{event.visibility==='private'&&<LockSimple size={13} aria-label={a.T('Private event','אירוע פרטי')}/>}</small></span>
   {Avatar&&<AvatarStack ids={event.memberIds?.length?event.memberIds:[event.ownerId]} Avatar={Avatar} name={a.name} size={30} max={2}/>}
   <Chevron size={16} aria-hidden="true"/>
  </button>)}
  {!events.length&&<div className="month-day-empty"><CalendarDots size={36} weight="duotone" aria-hidden="true"/><p>{emptyText||a.T('Nothing planned for this day yet.','עוד לא נקבעו אירועים ליום הזה.')}</p></div>}
 </div>;
}

function DaySurface({a,day,events,modal,onClose,onChoose,onAdd,Avatar,scrollPositions,selectedId,emptyText}){
 const id=useId(),panel=useRef(null),heading=useRef(null),list=useRef(null);
 useMonthModal(modal,panel,heading,onClose);
 useLayoutEffect(()=>{
  if(modal)return;
  let frame;
  const measure=()=>{
   if(panel.current)panel.current.style.setProperty('--month-panel-top',Math.max(0,panel.current.getBoundingClientRect().top)+'px');
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)};
  measure();
  const observer=new ResizeObserver(schedule);observer.observe(document.body);
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,{passive:true});
  return()=>{observer.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule);cancelAnimationFrame(frame)};
 },[modal,day]);
 useLayoutEffect(()=>{if(list.current)list.current.scrollTop=scrollPositions.current.get(day)||0},[day]);
 const date=new Date(day+'T12:00:00Z').toLocaleDateString(a.lang==='he'?'he-IL':'en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
 const content=<>
  <header className="month-day-heading"><div><p>{a.T('Your day','אירועי היום')}</p><h2 ref={heading} tabIndex={-1} id={id}>{date}</h2><span>{events.length===1?a.T('1 event','אירוע אחד'):a.T(events.length+' events',events.length+' אירועים')}</span></div>{modal&&<button type="button" className="icon-button" aria-label={a.T('Close day events','סגירת אירועי היום')} onClick={onClose}><X size={24}/></button>}</header>
  <DayEvents a={a} day={day} events={events} emptyText={emptyText} onChoose={onChoose} Avatar={Avatar} selectedId={selectedId} listRef={list} onScroll={event=>scrollPositions.current.set(day,event.currentTarget.scrollTop)}/>
  <footer className="month-day-footer"><button type="button" className="button" onClick={()=>onAdd(day)}><Plus size={20}/>{a.T('Add event on this day','אירוע ביום הזה')}</button></footer>
 </>;
 if(!modal)return <aside ref={panel} className="month-day-panel" aria-labelledby={id}>{content}</aside>;
 return createPortal(<div className="calendar-month-modal-backdrop" onPointerDown={event=>event.target===event.currentTarget&&onClose()}><section ref={panel} className="calendar-month-day-sheet" role="dialog" aria-modal="true" aria-labelledby={id}>{content}</section></div>,document.body);
}

export function CalendarMonth({app:a,items,cursor,weekStarts,onChoose,onDay,onAdd,onDayClose,dayOpen,detailOpen,Avatar,emptyText}){
 const sheet=useMedia(sheetQuery),scrollPositions=useRef(new Map()),grid=useRef(null),dates=monthDates(cursor,weekStarts),events=monthDayEvents(items,cursor),locale=a.lang==='he'?'he-IL':'en-US';
 const choose=(id,day)=>onChoose(id,day);
 const keyboard=(event,day)=>{
  const rtl=a.lang==='he',index=dates.indexOf(day),offset={ArrowDown:7,ArrowUp:-7,ArrowRight:rtl?-1:1,ArrowLeft:rtl?1:-1,Home:-(index%7),End:6-index%7}[event.key];
  if(offset===undefined)return;
  const target=dates[index+offset];
  if(target){event.preventDefault();grid.current.querySelector('[data-day="'+target+'"] .month-day')?.focus()}
 };
 return <div className="calendar-month-layout">
  <section className="calendar-month month-paper" aria-label={a.T('Month calendar','תצוגת חודש')}>
   <div className="month-weekdays">{dates.slice(0,7).map(date=><strong key={date}>{new Date(date+'T12:00:00Z').toLocaleDateString(locale,{weekday:'short',timeZone:'UTC'})}</strong>)}</div>
   <div ref={grid} className="month-grid">{dates.map(day=>{
    const dayEvents=monthDayEvents(items,day),outside=day.slice(0,7)!==cursor.slice(0,7),selected=day===cursor,more=dayEvents.length-MONTH_PREVIEW_LIMIT;
    const countLabel=dayEvents.length===1?a.T('1 event','אירוע אחד'):a.T(dayEvents.length+' events',dayEvents.length+' אירועים');
    const label=new Date(day+'T12:00:00Z').toLocaleDateString(locale,{dateStyle:'full',timeZone:'UTC'})+', '+countLabel;
    return <div key={day} data-day={day} className={'month-cell'+(outside?' outside':'')+(selected?' selected':'')+(day===(a.today||anchor)?' is-today':'')}>
     <button type="button" className="month-day" aria-label={label} aria-pressed={selected} aria-current={day===(a.today||anchor)?'date':undefined} onClick={()=>onDay(day)} onKeyDown={event=>keyboard(event,day)}><span className="month-day-label">{Number(day.slice(-2))}</span></button>
     <div className="month-events">{dayEvents.slice(0,MONTH_PREVIEW_LIMIT).map(event=><button type="button" className={'month-event '+eventTone(event,a)} key={event.id} title={(event.time?event.time+' · ':'')+a.text(event)} onClick={()=>choose(event.id,day)}>{event.time&&<time dir="ltr" dateTime={event.time}>{event.time}</time>}<span dir="auto">{a.text(event)}</span></button>)}{more>0&&<button type="button" className="month-more" onClick={()=>onDay(day)}>{a.T(more+' more','עוד '+more)}</button>}</div>
     <span className="month-dots" aria-hidden="true">{dayEvents.slice(0,MONTH_PREVIEW_LIMIT).map(event=><i key={event.id} className={eventTone(event,a)}/>)}{more>0&&<span dir="ltr">+{more}</span>}</span>
    </div>;
   })}</div>
   {sheet&&<p className="month-touch-hint">{a.T('Tap a day to see its events','לחצו על יום להצגת האירועים')}</p>}
  </section>
  {!sheet&&<DaySurface a={a} day={cursor} events={events} emptyText={emptyText} onChoose={choose} onAdd={onAdd} Avatar={Avatar} scrollPositions={scrollPositions}/>}
  {sheet&&dayOpen&&!detailOpen&&<DaySurface a={a} day={cursor} events={events} emptyText={emptyText} modal onClose={onDayClose} onChoose={choose} onAdd={onAdd} Avatar={Avatar} scrollPositions={scrollPositions}/>}
 </div>;
}

// Week/Agenda keep their original DOM; Month adds responsive layout groups only.
export function MonthEventGroup({enabled,name,children}){
 return enabled?<div className={'month-event-group month-event-'+name}>{children}</div>:<>{children}</>;
}

// Month reuses every existing detail control, inside a single bounded dialog/sheet.
export function MonthEventDialog({open,onClose,onBack,title,children,className=''}){
 const panel=useRef(null),heading=useRef(null),id=useId();
 const wide=useMedia('(min-width:1101px) and (min-height:521px)');
 useMonthModal(open,panel,heading,onClose);
 if(!open)return null;
 const groups=React.Children.toArray(children?.type===React.Fragment?children.props.children:children),isActions=child=>child?.type===MonthEventGroup&&child.props.name==='actions',actions=wide?groups.find(isActions):null,content=wide?groups.filter(child=>!isActions(child)):children;
 return createPortal(<div className="calendar-month-modal-backdrop calendar-month-event-backdrop" onPointerDown={event=>event.target===event.currentTarget&&onClose()}><section ref={panel} className={'calendar-month-event-dialog '+className} role="dialog" aria-modal="true" aria-labelledby={id}>
  <header className="month-event-dialog-header"><div><strong ref={heading} tabIndex={-1} id={id}>{title}</strong><button type="button" className="month-return-day" onClick={onBack}><ArrowRight size={18} aria-hidden="true"/>{document.documentElement.lang==='he'?'חזרה לאירועי היום':'Back to day events'}</button></div><button type="button" className="icon-button" aria-label={document.documentElement.lang==='he'?'סגירת הפרטים':'Close details'} onClick={onClose}><X size={24}/></button></header>
  <div className="calendar-month-event-body">{content}</div>
  {actions&&<footer className="calendar-month-event-footer">{actions}</footer>}
 </section></div>,document.body);
}
