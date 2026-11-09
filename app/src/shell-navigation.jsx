import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {List,CaretDown,DotsThree,CloudArrowUp,WarningCircle} from '@phosphor-icons/react';
import {BrandMark} from './brand-mark';
import {menuStyle} from './appearance-settings';

const defaultDesktop=['today','calendar','tasks','shopping','household'];
export const menuPosition=value=>value==='top'?'top':'bottom';

export function ShellNavigation({app:a,root,familyAnchor,onFamily,onMenu,onViewportRotate,menuOpen,familyOpen,Avatar,SaveStatus,NotificationBell,unread}){
 const appearance=a.data.preferences.appearanceByUser?.[a.user]||{};
 const position=menuPosition(appearance.menuPosition),tone=menuStyle(appearance.sidebar||'deep'),navigation=useRef(null);
 const [wide,setWide]=useState(()=>matchMedia('(min-width:901px) and (min-height:521px)').matches);
 const rotate=useRef(onViewportRotate);rotate.current=onViewportRotate;
 const [sync,setSync]=useState({pending:0,failed:0});
 useEffect(()=>a.cloud?.client?.subscribeStatus(setSync),[a.cloud?.client]);
 const syncState=sync.failed?'failed':sync.pending?'saving':'',SyncGlyph=sync.failed?WarningCircle:CloudArrowUp;
 const syncLabel=sync.failed?a.T('Not saved','לא נשמר'):a.T('Saving…','שומרים…');
 useEffect(()=>{
  const media=matchMedia('(min-width:901px) and (min-height:521px)'),change=()=>setWide(media.matches);
  media.addEventListener('change',change);return()=>media.removeEventListener('change',change);
 },[]);
 useLayoutEffect(()=>{
  const html=document.documentElement;html.dataset.shell='horizontal';html.dataset.navPosition=position;
  const viewport=window.visualViewport;let frame=0,settle=0;
  const set=(key,value)=>{if(html.style.getPropertyValue(key)!==value)html.style.setProperty(key,value)};
  const measure=()=>{
   const height=viewport?.height||innerHeight,width=viewport?.width||innerWidth,top=viewport?.offsetTop||0;
   setWide(width>=901&&height>520);
   const short=width>height&&height<=520,standalone=!!navigator.standalone||matchMedia('(display-mode: standalone)').matches;
   if(html.dataset.shellShort!==String(short))html.dataset.shellShort=String(short);
   if(html.dataset.shellStandalone!==String(standalone))html.dataset.shellStandalone=String(standalone);
   set('--shell-visible-height',height+'px');set('--shell-menu-center',(top+height/2)+'px');
   set('--shell-nav-clearance',navigation.current.getBoundingClientRect().height+'px');
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)};
  const rotated=()=>{rotate.current?.();schedule();clearTimeout(settle);settle=setTimeout(schedule,200)};
  measure();const observer=new ResizeObserver(schedule);observer.observe(navigation.current);
  addEventListener('resize',schedule);addEventListener('pageshow',schedule);addEventListener('orientationchange',rotated);
  viewport?.addEventListener('resize',schedule);screen.orientation?.addEventListener('change',rotated);
  return()=>{observer.disconnect();cancelAnimationFrame(frame);clearTimeout(settle);removeEventListener('resize',schedule);removeEventListener('pageshow',schedule);removeEventListener('orientationchange',rotated);viewport?.removeEventListener('resize',schedule);screen.orientation?.removeEventListener('change',rotated);for(const key of ['shell','navPosition','shellShort','shellStandalone'])delete html.dataset[key];for(const key of ['--shell-nav-clearance','--shell-visible-height','--shell-menu-center'])html.style.removeProperty(key)};
 },[position]);
 const saved=Array.isArray(appearance.quickNav)&&appearance.quickNav.length?appearance.quickNav:null;
 const keys=saved?saved.slice(0,wide?5:4):wide?defaultDesktop:['today','calendar','tasks','shopping'];
 const items=keys.map(key=>a.places.find(item=>item[0]===key)).filter(Boolean);
 const familyName=a.data.preferences.householdName||a.T('The Levi family','משפחת לוי');
 const memberCount=a.T(a.members.length+' family members',a.members.length+' בני משפחה');
 return <>
  <header className="bayit-shell-header" role="banner">
   <div className="bayit-shell-header-inner">
    <button type="button" className="bayit-shell-menu-trigger" aria-label={a.T('Menu','תפריט')} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={onMenu}><List size={24}/></button>
    <button type="button" className="bayit-shell-brand" aria-label={a.T('Bayit home','הבית ב־Bayit')} onClick={()=>a.go('today')}><BrandMark/></button>
    <button type="button" className="bayit-shell-family" aria-haspopup="dialog" aria-label={a.T('Family menu','תפריט המשפחה')+': '+familyName+', '+memberCount}
     aria-expanded={familyOpen} onClick={event=>{familyAnchor.current=event.currentTarget;onFamily()}} dir={a.lang==='he'?'rtl':'ltr'}>
     <span className="bayit-shell-family-photo"><Avatar family decorative size={46}/></span>
     <span className="bayit-shell-family-text"><strong>{familyName}</strong><small>{memberCount}</small></span>
     <CaretDown size={17} className="bayit-shell-family-caret"/>
    </button>
    <div className="bayit-shell-utility"><span className="bayit-shell-save-slot">
     <span className={'save-status save-'+syncState} role="status" title={syncLabel} hidden={!syncState}><SyncGlyph className="save-glyph" size={20}/><span className="save-label">{syncLabel}</span></span>
     <span hidden={!!syncState}><SaveStatus T={a.T}/></span>
    </span><NotificationBell T={a.T} unread={unread} size={25} className="bayit-shell-bell notification-bell" onClick={a.openNotifications}/></div>
   </div>
  </header>
  <nav ref={navigation} className="bayit-shell-nav" data-position={position} data-tone={tone} aria-label={a.T('Primary navigation','ניווט ראשי')}>
   <div className="bayit-shell-nav-inner">{items.map(([key,Icon,label])=>
    <button type="button" key={key} aria-current={root===key?'page':undefined} className={root===key?'selected':''} onClick={()=>a.go(key)}>
     <Icon size={26} weight="regular"/><span>{label}</span>
    </button>)}<button type="button" className={!items.some(([key])=>key===root)?'selected':''} aria-label={a.T('More','עוד')} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={onMenu}><DotsThree size={28}/><span>{a.T('More','עוד')}</span></button></div>
  </nav>
 </>;
}
