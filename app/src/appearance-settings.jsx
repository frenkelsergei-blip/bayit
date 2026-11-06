import React from 'react';
import {DensitySetting} from './density';
import {Check,Sun,Moon,Palette} from '@phosphor-icons/react';

// Full themes: each one sets the page background, cards, menu and accent for day and night.
// Token values live in themes.css (`[data-palette=…]`), which also styles the previews below.
export const THEMES=[
 ['classic','Bayit blue','כחול בית'],
 ['sage','Garden','גינה'],
 ['plum','Lavender','לבנדר'],
 ['ocean','Coast','חוף'],
 ['sunset','Terracotta','טרקוטה'],
 ['rose','Blossom','פריחה'],
 ['honey','Honey','דבש'],
 ['slate','Slate','צפחה'],
];
const MENUS=[['matching','Light','בהיר'],['soft','Tinted','צבעוני'],['deep','Deep','עמוק']];
const NIGHTS=[['tinted','Theme color','בצבע הערכה'],['charcoal','Charcoal','פחם'],['black','True black','שחור']];
const ACCENTS=['#0240DE','#26705A','#7451A8','#087E9B','#B0431D','#A8336A','#8A5800','#C62F2F'];

// Older saved menu choices map onto the three current ones.
export const menuStyle=value=>({ink:'deep',charcoal:'deep',paper:'matching'})[value]||(['matching','soft','deep'].includes(value)?value:'matching');

function Preview({palette,menu}){return <span className="theme-swatch" data-palette={palette} data-menu={menu} aria-hidden="true"><span className="swatch-menu"><i/><i/><i/></span><span className="swatch-page"><span className="swatch-title"/><span className="swatch-card"><b/><span className="swatch-line"/><span className="swatch-line short"/></span><span className="swatch-button"/></span></span>}

export function AppearanceSettings({app:a,ui:{Tabs}}){
 const p=a.data.preferences,appearance=p.appearanceByUser?.[a.user]||{},palette=appearance.palette||p.palette||'classic',menu=menuStyle(appearance.sidebar),night=appearance.night||'tinted',accent=/^#[0-9a-f]{6}$/i.test(appearance.accent||'')?appearance.accent:'';
 const change=next=>a.update(d=>{d.preferences.appearanceByUser={...d.preferences.appearanceByUser,[a.user]:{...d.preferences.appearanceByUser?.[a.user],...next}}});
 return <div className="appearance-settings">
  <div className="appearance-block appearance-mode"><span className="field-label">{a.T('Day or night','יום או לילה')}</span><Tabs value={a.theme} onChange={a.setTheme} items={[["light",a.T('Day','יום'),Sun],["dark",a.T('Night','לילה'),Moon]]}/></div>
  <div className="appearance-block"><span className="field-label" id="theme-label">{a.T('Theme','ערכת נושא')}</span><p className="appearance-help">{a.T('Each theme changes the background, cards, menu and buttons.','כל ערכה משנה את הרקע, הכרטיסים, התפריט והכפתורים.')}</p>
   <div className="theme-gallery" role="radiogroup" aria-labelledby="theme-label">{THEMES.map(([key,en,he])=><button type="button" role="radio" aria-checked={palette===key} key={key} className="theme-card" onClick={()=>change({palette:key,accent:''})}><Preview palette={key} menu={menu}/><span className="theme-card-name">{a.T(en,he)}{palette===key&&<Check size={17} weight="bold"/>}</span></button>)}</div></div>
  <div className="appearance-block"><span className="field-label" id="menu-label">{a.T('Menu color','צבע התפריט')}</span>
   <div className="menu-style-options" role="radiogroup" aria-labelledby="menu-label">{MENUS.map(([key,en,he])=><button type="button" role="radio" aria-checked={menu===key} key={key} className="menu-style-option" onClick={()=>change({sidebar:key})}><span className="menu-style-sample" data-menu={key} aria-hidden="true"><i/><i/><i/></span><span>{a.T(en,he)}</span>{menu===key&&<Check size={16} weight="bold"/>}</button>)}</div></div>
  {a.theme==='dark'&&<div className="appearance-block"><span className="field-label" id="night-label">{a.T('Night background','רקע לילה')}</span>
   <div className="menu-style-options" role="radiogroup" aria-labelledby="night-label">{NIGHTS.map(([key,en,he])=><button type="button" role="radio" aria-checked={night===key} key={key} className="menu-style-option" onClick={()=>change({night:key})}><span className="night-sample" data-night={key} aria-hidden="true"/><span>{a.T(en,he)}</span>{night===key&&<Check size={16} weight="bold"/>}</button>)}</div></div>}
  <div className="appearance-block"><span className="field-label" id="accent-label">{a.T('Button color','צבע הכפתורים')}</span>
   <div className="accent-swatches" role="radiogroup" aria-labelledby="accent-label">
    <button type="button" role="radio" aria-checked={!accent} className="accent-swatch theme-default" onClick={()=>change({accent:''})} title={a.T('Theme color','צבע הערכה')}><Palette size={18}/><span>{a.T('Theme','ערכה')}</span></button>
    {ACCENTS.map(color=><button type="button" role="radio" aria-checked={accent.toLowerCase()===color.toLowerCase()} key={color} className="accent-swatch" style={{'--swatch':color}} aria-label={color} onClick={()=>change({accent:color})}>{accent.toLowerCase()===color.toLowerCase()&&<Check size={16} weight="bold"/>}</button>)}
    <label className={'accent-swatch accent-custom'+(accent&&!ACCENTS.some(c=>c.toLowerCase()===accent.toLowerCase())?' selected':'')} title={a.T('Choose any color','בחירת צבע חופשי')} style={accent?{'--swatch':accent}:undefined}><input type="color" aria-label={a.T('Custom button color','צבע כפתורים אישי')} value={accent||'#0240de'} onChange={e=>change({accent:e.target.value})}/><span>+</span></label>
   </div></div>
  <p className="settings-hint">{a.T('Your colors are personal and saved automatically. Day and night keep the same theme.','הצבעים אישיים ונשמרים אוטומטית. יום ולילה שומרים על אותה ערכה.')}</p>
  <DensitySetting a={a} Tabs={Tabs}/>
  <QuickNavPicker a={a} appearance={appearance} change={change}/>
 </div>
}
// Which places get their own icon in the narrow menu (tablet) and the phone bottom bar; the rest are under More.
function QuickNavPicker({a,appearance,change}){
 const places=a.places||[],chosen=Array.isArray(appearance.quickNav)&&appearance.quickNav.length?appearance.quickNav:['today','calendar','tasks','shopping','kids'];
 const toggle=key=>{const next=chosen.includes(key)?chosen.filter(k=>k!==key):chosen.length>=5?chosen:[...chosen,key];if(next.length)change({quickNav:places.map(p=>p[0]).filter(k=>next.includes(k))})};
 return <div className="appearance-block quick-nav"><span className="field-label">{a.T('Quick menu','תפריט מהיר')}</span><p className="settings-hint">{a.T('Choose up to 5 places shown directly in the side menu on tablets and laptops. On phones the first 4 appear in the bottom bar. Everything else is under “More”. Large screens show every place.','בחרו עד 5 מקומות שיופיעו ישירות בתפריט הצד בטאבלט ובמחשב נייד. בטלפון 4 הראשונים יופיעו בסרגל התחתון. כל השאר נמצא תחת „עוד”. במסכים גדולים מוצגים כל המקומות.')}</p><div className="quick-nav-grid" role="group" aria-label={a.T('Quick menu','תפריט מהיר')}>{places.map(([key,Icon,label])=>{const on=chosen.includes(key),full=!on&&chosen.length>=5;return <button type="button" key={key} aria-pressed={on} disabled={full} className={'quick-nav-tile'+(on?' on':'')} onClick={()=>toggle(key)}><Icon size={24}/><span>{label}</span>{on&&<b className="quick-nav-order">{chosen.indexOf(key)+1}</b>}</button>})}</div><small className="quick-nav-count">{a.T(chosen.length+' of 5 chosen',chosen.length+' מתוך 5 נבחרו')}</small></div>
}
