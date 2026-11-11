import React,{useEffect,useRef} from 'react';
import {Check,X,Play} from '@phosphor-icons/react';
import {HERO_PUZZLE_ART,heroPuzzleThumbnail} from '../../shared/hero-games.mjs';
import './hero-puzzle-picker.css';

// The puzzle picture picker as a Kids window (top layer): it opens in view from the game menu and from inside a puzzle.
export function HeroPuzzlePicker({a,selected,playing,completed=[],waiting,locked,onPick,onPlay,onClose}){
 const T=a.T,ref=useRef(null),opener=useRef(null);
 useEffect(()=>{opener.current=document.activeElement;const d=ref.current;if(d&&!d.open)d.showModal();d?.querySelector('.hg-art-choices [aria-pressed=true]')?.scrollIntoView({block:'nearest'});d?.querySelector('[data-close-picker]')?.focus();return()=>opener.current?.focus?.()},[]);
 const close=()=>{if(!waiting)onClose()};
 return <dialog ref={ref} className="hero-context-dialog hero-puzzle-picker-dialog" aria-labelledby="hero-puzzle-picker-title" onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===ref.current)close()}}><div className="hero-context-dialog-body">
  <header><div><h2 id="hero-puzzle-picker-title">{T('Choose a picture','בוחרים תמונה')}</h2><p>{T('Twelve picture adventures. Completed pictures can be played again.','שתים עשרה הרפתקאות בתמונות. אפשר לחזור גם לתמונות שכבר הושלמו.')}</p></div><button type="button" data-close-picker className="icon-button" disabled={waiting} onClick={close} aria-label={playing?T('Keep playing this puzzle','ממשיכים בפאזל הזה'):T('Close','סגירה')}><X size={23}/></button></header>
  <div className="hero-puzzle-picker-grid"><div className="hg-art-choices" role="group" aria-label={T('Puzzle picture','תמונה לפאזל')}>{HERO_PUZZLE_ART.map(([id,en,he],i)=><button type="button" key={id} data-art={id} disabled={waiting} aria-label={T(en,he)} aria-pressed={selected===id} onClick={()=>onPick(id)}><img src={heroPuzzleThumbnail(id)} alt="" loading="lazy"/><span><bdi>{i+1}.</bdi> {T(en,he)}</span>{completed.includes(id)&&<Check size={18} aria-label={T('Completed','הושלם')}/>}</button>)}</div></div>
  <footer>{playing&&<small>{T('The puzzle starts again with the new picture.','הפאזל מתחיל מחדש עם התמונה החדשה.')}</small>}<button type="button" className="button" data-play-picture disabled={locked||!selected} onClick={onPlay}><Play size={19} weight="fill"/>{T('Play this picture','משחקים בתמונה הזאת')}</button></footer>
 </div></dialog>;
}
