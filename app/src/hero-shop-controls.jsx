import React from 'react';
import {ArrowRight,CaretDown,Plant,X} from '@phosphor-icons/react';
import {HERO_CATEGORIES} from '../../shared/hero-catalog.mjs';
import './hero-menu-refinement.css';

export function HeroShopControls({a,category,onCategory,search,onSearch,filter,onFilter,count,onGarden,excludeFood=false}){
 const T=a.T,filtered=category!=='all'||search.trim()||filter!=='all';
 return <div className="hero-shop-controls">
  <aside className="hero-shop-garden-entry">
   <div><h3>{T('For my garden','לגינה שלי')}</h3><p>{T('Seeds, seedlings & garden decorations','זרעים, שתילים וקישוטים לגינה')}</p></div>
   <button type="button" className="hero-small-button hero-garden-shop-entry" onClick={onGarden}><Plant size={19}/><span>{T('Open seed shop','לחנות הזרעים')}</span><ArrowRight className="hero-menu-forward" size={17}/></button>
  </aside>
  <div className="hero-shop-filters">
   <fieldset className="hero-shop-category-field"><legend>{T('Category','קטגוריה')}</legend><div className="hero-category-chips">{HERO_CATEGORIES.filter(([id])=>!excludeFood||id!=='food').map(([id,en,he])=><button key={id} type="button" aria-pressed={category===id} onClick={()=>onCategory(id)}>{id==='all'?T('All categories','כל הקטגוריות'):T(en,he)}</button>)}</div></fieldset>
   <div className="hero-shop-search">
    <label><span>{T('Search the shop','חיפוש בחנות')}</span><input type="search" placeholder={T('Find a little treasure…','מחפשים אוצר קטן…')} value={search} onChange={e=>onSearch(e.target.value)}/></label>
    <label><span>{T('Availability','זמינות הפריטים')}</span><span className="hero-shop-select"><select aria-label={T('Availability','זמינות הפריטים')} value={filter} onChange={e=>onFilter(e.target.value)}><option value="all">{T('All items','כל הפריטים')}</option><option value="affordable">{T('I can get now','אפשר לקנות עכשיו')}</option><option value="owned">{T('Already mine','כבר שלי')}</option></select><CaretDown size={18} aria-hidden="true"/></span></label>
   </div>
   <div className="hero-shop-results"><span role="status" aria-live="polite">{T(count===1?'1 item':count+' items',count===1?'פריט אחד':count+' פריטים')}</span>{filtered&&<button type="button" className="hero-small-button hero-shop-reset" onClick={()=>{onCategory('all');onSearch('');onFilter('all')}}><X size={16}/>{T('Clear filters','ניקוי הסינון')}</button>}</div>
  </div>
 </div>;
}
