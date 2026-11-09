import React,{useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {CaretDown,X} from '@phosphor-icons/react';
import {usePhone} from './detail-panel';

// Phone "More" menu: a bottom sheet that fits on one screen (no scrolling) instead of the tall desktop sidebar.
export function MobileMenu({T,root,items,extras,go,onClose,family,asSheet=false}){
 const phone=usePhone()||asSheet,sheet=useRef(null);
 useEffect(()=>{if(!phone)return;sheet.current?.querySelector('[aria-current=page],.mobile-menu-grid button')?.focus({preventScroll:true});const key=e=>{if(e.key==='Escape'&&!document.querySelector('.family-popover'))onClose()};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key)}},[phone]);
 if(!phone)return null;
 const tile=([key,Icon,label])=><button key={key} className={root===key?'selected':''} aria-current={root===key?'page':undefined} onClick={()=>go(key)}><span className="mobile-menu-icon"><Icon size={25}/></span><span className="mobile-menu-label">{label}</span></button>;
 return createPortal(<section ref={sheet} className="mobile-menu bayit-shell-menu" role="dialog" aria-modal="true" aria-label={T('Menu','תפריט')}>
  <span className="mobile-menu-handle" aria-hidden="true"/>
  <div className="mobile-menu-header"><button className="family-card" aria-haspopup="dialog" title={T('Open family menu','פתיחת תפריט המשפחה')} onClick={family.onOpen}>{family.avatar}<span className="family-card-text"><strong>{family.name}</strong><small>{family.subtitle}</small></span><CaretDown size={18}/></button><button className="mobile-menu-close" aria-label={T('Close menu','סגירת התפריט')} onClick={onClose}><X size={22}/></button></div>
  <nav className="mobile-menu-grid" aria-label={T('Sections','אזורים')}>{items.map(tile)}</nav>
  <nav className="mobile-menu-footer" aria-label={T('Personal','אישי')}>{extras.map(([key,Icon,label])=><button key={key} className={root===key?'selected':''} aria-current={root===key?'page':undefined} onClick={()=>go(key)}><Icon size={21}/><span>{label}</span></button>)}</nav>
 </section>,document.body)
}
