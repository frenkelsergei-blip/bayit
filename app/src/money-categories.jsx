// Household › Expenses › Categories (concept B, chosen by the owner 2026-11-12,
// concept/explorations/expenses-categories-20261112/concept-b.png): every category of the month with its total
// (together they are the month's spending, the same number as Summary), and one category opened beside it with its
// total, last months, who we paid and every transaction. Built from shared/month-payees.mjs, so every spending row is
// in exactly one category and one payee, including an open "Not identified" payee. Money is adult-only.
import React,{useMemo} from 'react';
import {CATEGORY,monthSummary,shiftMonth} from '../../shared/finance.mjs';
import {monthPayees,fixedPaymentIds,UNIDENTIFIED} from '../../shared/month-payees.mjs';
import './money-categories.css';

const tint=(hex,alpha)=>{const h=(hex||'#cccccc').replace('#','');const n=parseInt(h,16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${alpha})`};

export function MoneyCategories({a,Icon,T,money,catName,rows,groups,month,payees,selected,onSelectCategory,onSelect}){
 const he=a.lang==='he';
 const model=useMemo(()=>monthPayees(rows,groups,month,{fixedIds:fixedPaymentIds(payees,month)}),[rows,groups,month,payees]);
 const monthName=new Date(month+'-15T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{month:'long'});
 const day=iso=>new Date(iso+'T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{day:'numeric',month:'short'});
 const count=(n,one,many,oneHe,manyHe)=>n===1?T(one,oneHe):T(n+' '+many,n+' '+manyHe);
 const txs=n=>count(n,'1 transaction','transactions','תנועה אחת','תנועות'),places=n=>count(n,'1 place','places','מקום אחד','מקומות');
 const times=n=>n===1?T('once','פעם אחת'):T(n+' times',n+' פעמים');
 const vars=id=>({'--cat':CATEGORY[id]?.color,'--cat-soft':tint(CATEGORY[id]?.color,.14)});
 const open=model.categories.find(c=>c.category===selected)||model.categories[0];
 const top=Math.max(1,...model.categories.map(c=>c.amount));
 if(!model.categories.length)return <section className="money-card money-cats-empty"><p className="muted">{T('No spending recorded for this month.','לא נרשמו הוצאות בחודש הזה.')}</p></section>;
 const history=open?[5,4,3,2,1,0].map(i=>shiftMonth(month,-i)).map(m=>({m,v:monthSummary(rows,groups,m).byCategory.find(c=>c.category===open.category)?.amount||0})).filter((x,i,arr)=>arr.slice(0,i+1).some(y=>y.v>0)):[];
 const previous=history.length>1?history.at(-2).v:0,change=previous?Math.round((open.amount-previous)/previous*100):null,maxBar=Math.max(1,...history.map(h=>h.v));
 const name=p=>p.key===UNIDENTIFIED?T('Not identified','לא זוהה'):he?p.name.he:p.name.en;
 const pick=id=>{onSelectCategory(id);if(matchMedia('(max-width: 900px)').matches)requestAnimationFrame(()=>document.getElementById('money-cat-detail')?.scrollIntoView({behavior:'smooth',block:'start'}))};
 return <div className="money-cats">
  <section className="money-card money-cats-list" aria-labelledby="money-cats-title">
   <div><h2 id="money-cats-title">{T('By category · '+monthName,'לפי קטגוריה · '+monthName)}</h2><p className="money-lead">{T('Every transaction is in one category. Together they make the month’s total.','כל תנועה בקטגוריה אחת. יחד הן סך החודש.')}</p></div>
   <ul>{model.categories.map(c=><li key={c.category}><button type="button" className={'money-cats-row'+(c===open?' on':'')} aria-pressed={c===open} style={vars(c.category)} onClick={()=>pick(c.category)}>
    <Icon code={CATEGORY[c.category]?.icon} size={32}/>
    <span className="money-cats-name"><strong>{catName(c.category)}</strong><small>{txs(c.count)} · {places(c.payees.length)}</small></span>
    <b>{money(c.amount,{fraction:0})}</b>
    <span className="money-cats-bar" aria-hidden="true"><i style={{width:Math.max(2,c.amount/top*100)+'%'}}/></span>
   </button></li>)}</ul>
   <div className="money-cats-total"><span>{T('Total · ','סה״כ · ')+txs(model.count)}</span><span>{money(model.total,{fraction:0})}</span></div>
  </section>
  {open&&<section className="money-card money-cats-detail" id="money-cat-detail" style={vars(open.category)} aria-labelledby="money-cat-detail-title">
   <div className="money-cats-head"><Icon code={CATEGORY[open.category]?.icon} size={46}/><div><h2 id="money-cat-detail-title">{catName(open.category)}</h2><p className="money-lead">{monthName} · {txs(open.count)}</p></div></div>
   <div className="money-cats-stats">
    <div><span>{T('Spent','הוצאה')}</span><strong>{money(open.amount,{fraction:0})}</strong></div>
    <div><span>{T('Share of spending','מתוך כל ההוצאות')}</span><strong>{model.total?Math.round(open.amount/model.total*100):0}%</strong></div>
    <div><span>{T('vs last month','לעומת החודש הקודם')}</span><strong><bdi dir="ltr">{change==null||!isFinite(change)?'—':(change>0?'+':change<0?'−':'')+Math.abs(change)+'%'}</bdi></strong></div>
   </div>
   {history.length>1&&<div className="money-cats-bars" role="img" aria-label={T('Last months','החודשים האחרונים')+': '+history.map(h=>new Date(h.m+'-15T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{month:'short'})+' '+money(h.v,{fraction:0})).join(', ')}>{history.map(h=><div key={h.m} className={h.m===month?'now':''}><span>{money(h.v,{fraction:0})}</span><i style={{height:Math.max(6,Math.max(0,h.v)/maxBar*56)+'px'}}/><span>{new Date(h.m+'-15T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{month:'short'})}</span></div>)}</div>}
   <h3>{T('Who we paid','למי שילמנו')}</h3>
   <ul className="money-cats-payees">{open.payees.map(p=><li key={p.key} className={p.key===UNIDENTIFIED?'unknown':''}><strong><bdi>{name(p)}</bdi>{p.fixed&&<span className="money-cats-badge">{T('Every month','קבוע')}</span>}</strong><small>{times(p.count)} · {T('last ','אחרון ')}{day(p.last)}</small><b>{money(p.amount,{fraction:0})}</b></li>)}</ul>
   <h3>{T('Transactions','תנועות')}</h3>
   <ul className="money-cats-tx">{open.payees.flatMap(p=>p.rows).sort((x,y)=>y.date.localeCompare(x.date)||(x.seq??0)-(y.seq??0)).map(t=><li key={t.id}><button type="button" aria-label={T('Details: ','פרטים: ')+t.description} onClick={()=>onSelect(t)}><span>{day(t.date)}</span><span><bdi>{t.description||T('Not identified','לא זוהה')}</bdi></span><b>{money(-t.amount,{fraction:2,sign:t.amount>0})}</b></button></li>)}</ul>
  </section>}
 </div>;
}
