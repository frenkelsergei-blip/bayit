import React from 'react';
import {Info,DownloadSimple} from '@phosphor-icons/react';
// Statistics parts shared by the three tabs (full audit 09, 2026-11-08), so Activities, Shopping and Household
// summaries look the same: a tinted card with the icon in a soft circle, the label, then the value on its own line
// (never drawn over the label). `accent` adds the title underline and rays from their 1×/2×/3× PNGs at their
// natural aspect ratio (design-system decision 5). `hint` explains a value such as "—" or "Not set".
const UNDERLINE='/assets/generated/title-underline-clean-240.png 240w, /assets/generated/title-underline-clean-480.png 480w, /assets/generated/title-underline-clean-720.png 720w';
const RAYS='/assets/generated/title-rays-48.png 1x, /assets/generated/title-rays-96.png 2x, /assets/generated/title-rays-144.png 3x';
// A small picture for a summary card (user review 2026-11-08: plain number cards looked boring):
//  bars  – values over the period (time runs right to left in Hebrew), `highlight` marks one bar;
//  ring  – a percentage (goal progress, limit used);
//  dots  – one dot per day, filled when something happened (streaks, active days).
export function SummaryViz({viz,rtl}){
 if(!viz)return null;
 if(viz.kind==='ring'){const pct=Math.max(0,Math.min(100,viz.pct||0)),r=17,c=2*Math.PI*r;return <svg className="summary-viz ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r={r} className="viz-track"/><circle cx="22" cy="22" r={r} className="viz-fill" strokeDasharray={c} strokeDashoffset={c*(1-pct/100)} transform="rotate(-90 22 22)"/></svg>}
 const values=rtl?viz.values.slice().reverse():viz.values,n=values.length||1,hi=viz.highlight==null?null:rtl?n-1-viz.highlight:viz.highlight;
 if(viz.kind==='dots'){const gap=14;return <svg className="summary-viz dots" viewBox={'0 0 '+(n*gap)+' 16'} aria-hidden="true">{values.map((v,i)=><circle key={i} cx={i*gap+7} cy="8" r="5.5" className={v?'viz-fill-dot':'viz-track-dot'}/>)}</svg>}
 const max=Math.max(1,...values),w=100,h=36,step=w/n,bw=Math.max(3,step*0.62);
 return <svg className="summary-viz bars" viewBox={'0 0 '+w+' '+h} preserveAspectRatio="none" aria-hidden="true">{values.map((v,i)=>{const bh=v?Math.max(4,v/max*(h-2)):2;return <rect key={i} x={i*step+(step-bw)/2} y={h-bh} width={bw} height={bh} rx={Math.min(3,bw/2)} className={i===hi||(hi===null&&i===(rtl?0:n-1))?'viz-bar-on':v?'viz-bar':'viz-bar-empty'}/>})}</svg>;
}
export function StatisticsSummary({items,rtl}){
 return <div className="statistics-summary-cards">{items.map(({icon:Glyph,label,value,hint,word,accent,viz,trend},index)=><section key={label} className={'statistics-summary-card summary-'+index+(viz?' has-viz':'')}>
  <span className="summary-symbol" aria-hidden="true"><Glyph size={28} weight={index===0?'regular':'bold'}/></span>
  <div className="summary-text"><h2>{label}</h2><span className={'summary-value'+(accent?' accent':'')}><strong className={word?'word-value':''}><bdi dir="auto">{value}</bdi></strong>{accent&&<><img className="summary-rays" src="/assets/generated/title-rays-48.png" srcSet={RAYS} alt=""/><img className="summary-underline" src="/assets/generated/title-underline-clean-240.png" srcSet={UNDERLINE} sizes="160px" alt=""/></>}</span>{hint&&<small className="summary-hint">{hint}</small>}{trend}</div>
  {viz&&<span className="summary-viz-box"><SummaryViz viz={viz} rtl={rtl}/></span>}
 </section>)}</div>;
}
export function StatisticsFooter({lines,children}){
 return <footer className="statistics-footer"><Info size={24} aria-hidden="true"/><p>{lines.map((line,i)=><React.Fragment key={i}>{i>0&&<br/>}{line}</React.Fragment>)}</p><div className="statistics-footer-actions">{children}</div></footer>;
}
// CSV with a BOM for Excel and formula-looking cells defused.
export function downloadCSV(name,keys,rows,cell=(row,key)=>row[key]){
 const quote=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const csv='﻿'+[keys.join(','),...rows.map(r=>keys.map(k=>quote(cell(r,k))).join(','))].join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
 link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export {DownloadSimple};
