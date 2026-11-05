// Bayit-styled money visuals: hero, sparkline tiles, the in/out flow chart and the category ring.
import React,{useState} from 'react';
import {ResponsiveContainer,ComposedChart,Bar,Line,XAxis,YAxis,ReferenceLine,Tooltip,Cell,PieChart,Pie,Sector,AreaChart,Area} from 'recharts';
import {TrendUp,TrendDown,Bank,ArrowRight,ArrowLeft} from '@phosphor-icons/react';
import {CATEGORY} from '../../shared/finance.mjs';

const IN='#2FA86B',OUT='var(--primary)',SAVE='#FFB547',NET='#FFD451';

export function MoneyHero({a,T,money,monthName,summary,month}){
 const income=Math.max(summary.income,1),spentPct=Math.min(100,summary.expenses/income*100),savedPct=Math.min(100-spentPct,summary.savings/income*100),leftPct=Math.max(0,100-spentPct-savedPct),over=summary.net<0;
 return <section className="money-hero">
  <div className="money-hero-copy">
   <h2 className="money-hero-title">{T(new Date(month+'-15T12:00Z').toLocaleDateString('en-US',{month:'long'})+' at home',new Date(month+'-15T12:00Z').toLocaleDateString('he-IL',{month:'long'})+' בבית')}</h2>
   <span className="money-hero-sub">{over?T('Spent more than came in','יצא יותר ממה שנכנס'):T('Left after everything','נשאר אחרי הכול')}</span>
   <strong className={'money-hero-value '+(over?'over':'')}>{money(summary.net,{sign:true})}</strong>
  </div>
  <div className="money-hero-details">
   <div className="money-split" role="img" aria-label={T('Income split','חלוקת ההכנסה')}>
    <i className="spent" style={{width:spentPct+'%'}}/><i className="saved" style={{width:savedPct+'%'}}/><i className="left" style={{width:leftPct+'%'}}/>
   </div>
   <ul className="money-split-key">
    <li><span className="spent"/>{T('Spent','הוצאות')} <b>{Math.round(summary.expenses/income*100)}%</b></li>
    <li><span className="saved"/>{T('Saved','חיסכון')} <b>{Math.round(summary.savings/income*100)}%</b></li>
    <li><span className="left"/>{T('Left','נשאר')} <b>{Math.max(0,Math.round(summary.net/income*100))}%</b></li>
   </ul>
   {summary.bankBalance&&<span className="money-hero-balance"><Bank size={18} weight="fill"/>{T('Bank balance','יתרה בבנק')} <b>{money(summary.bankBalance.amount)}</b> · {new Date(summary.bankBalance.date+'T12:00Z').toLocaleDateString(a.lang==='he'?'he-IL':'en-GB',{day:'numeric',month:'short'})}</span>}
  </div>
  <img className="money-hero-art" src="/assets/generated/money-hero.png" srcSet="/assets/generated/money-hero-320.png 320w, /assets/generated/money-hero.png 640w" sizes="(max-width: 760px) 130px, 300px" alt="" width="300" height="300"/>
 </section>;
}

export function MoneyTile({tone,icon,label,value,series,delta,invert,T}){
 const good=delta==null?null:(delta>0)!==!!invert,id='spark-'+tone;
 return <section className={'money-tile '+tone}>
  <span className="money-tile-icon"><img src={'/assets/icons/openmoji/svg/'+icon+'.svg'} alt="" width="34" height="34"/></span>
  <div className="money-tile-copy"><h3>{label}</h3><strong>{value}</strong>{delta!=null&&isFinite(delta)&&<span className={'money-pill '+(good?'good':'bad')}>{delta>0?<TrendUp size={13} weight="bold"/>:<TrendDown size={13} weight="bold"/>}{Math.abs(delta)}% <small>{T('vs last month','מהחודש הקודם')}</small></span>}</div>
  <div className="money-spark" aria-hidden="true">{series.length>1&&<ResponsiveContainer width="100%" height="100%"><AreaChart data={series.map((v,i)=>({i,v}))} margin={{top:4,bottom:2,left:0,right:0}}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity={.35}/><stop offset="100%" stopColor="currentColor" stopOpacity={0}/></linearGradient></defs><Area type="monotone" dataKey="v" stroke="currentColor" strokeWidth={2.5} fill={'url(#'+id+')'} isAnimationActive={false} dot={false}/></AreaChart></ResponsiveContainer>}</div>
 </section>;
}

function FlowTip({active,payload,T,money}){
 if(!active||!payload?.length)return null;const d=payload[0].payload;
 return <div className="money-tip"><strong>{d.label}</strong><span><i style={{background:IN}}/>{T('In','נכנס')} <b>{money(d.inA)}</b></span><span><i style={{background:'var(--primary)'}}/>{T('Out','יצא')} <b>{money(d.outA)}</b></span><span><i style={{background:SAVE}}/>{T('Saved','נחסך')} <b>{money(d.saveA)}</b></span><span className="money-tip-net">{T('Left','נשאר')} <b>{money(d.netA,{sign:true})}</b></span></div>;
}

// Income rises above the line, spending and savings drop below it; the yellow line is what was left.
export function FlowChart({a,T,money,trend,month,onPick}){
 const he=a.lang==='he',data=trend.map(x=>({month:x.m,label:new Date(x.m+'-15T12:00Z').toLocaleDateString(he?'he-IL':'en-US',{month:'short',year:'2-digit'}),in:x.s.income/100,out:-x.s.expenses/100,save:-x.s.savings/100,net:x.s.net/100,inA:x.s.income,outA:x.s.expenses,saveA:x.s.savings,netA:x.s.net}));
 const fade=d=>d.month===month?1:.38;
 return <div className="money-flow"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} stackOffset="sign" margin={{top:16,right:8,left:8,bottom:4}} barCategoryGap="28%" onClick={e=>e?.activePayload?.[0]&&onPick(e.activePayload[0].payload.month)}>
  <defs>
   <linearGradient id="flow-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4FD08F"/><stop offset="100%" stopColor={IN}/></linearGradient>
   <linearGradient id="flow-out" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)"/><stop offset="100%" stopColor="#1D3B8B"/></linearGradient>
  </defs>
  <XAxis dataKey="label" reversed={he} axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:13,fontWeight:700}} dy={6}/>
  <YAxis hide domain={['dataMin','dataMax']}/>
  <ReferenceLine y={0} stroke="var(--border)" strokeWidth={2}/>
  <Tooltip content={<FlowTip T={T} money={money}/>} cursor={{fill:'var(--yellow)',opacity:.35,radius:16}}/>
  <Bar dataKey="in" stackId="f" fill="url(#flow-in)" radius={[14,14,14,14]} isAnimationActive={false} maxBarSize={46} cursor="pointer">{data.map(d=><Cell key={d.month} fillOpacity={fade(d)}/>)}</Bar>
  <Bar dataKey="out" stackId="f" fill="url(#flow-out)" radius={[14,14,14,14]} isAnimationActive={false} maxBarSize={46} cursor="pointer">{data.map(d=><Cell key={d.month} fillOpacity={fade(d)}/>)}</Bar>
  <Bar dataKey="save" stackId="f" fill={SAVE} radius={[14,14,14,14]} isAnimationActive={false} maxBarSize={46} cursor="pointer">{data.map(d=><Cell key={d.month} fillOpacity={fade(d)}/>)}</Bar>
  <Line dataKey="net" type="monotone" stroke={NET} strokeWidth={4} isAnimationActive={false} dot={{r:6,fill:NET,stroke:'var(--surface)',strokeWidth:3}} activeDot={{r:8}}/>
 </ComposedChart></ResponsiveContainer></div>;
}

const activeShape=props=><Sector {...props} outerRadius={props.outerRadius+6} cornerRadius={8}/>;
// Outer ring: categories (small ones grouped). Inner ring: share of the month's income that was spent.
export function CategoryRing({a,T,money,catName,summary,Icon,onSelect}){
 const [active,setActive]=useState(-1),total=summary.expenses||1,big=summary.byCategory.filter(c=>c.category!=='other'&&c.amount/total>=.03),small=summary.byCategory.filter(c=>c.category==='other'||c.amount/total<.03),cats=small.length>1?[...big,{category:'other',amount:small.reduce((n,c)=>n+c.amount,0),members:small.map(c=>c.category)}]:summary.byCategory,shown=cats[active],ofIncome=summary.income?Math.min(1,summary.expenses/summary.income):0;
 return <div className="money-ring" onMouseLeave={()=>setActive(-1)}>
  <ResponsiveContainer width="100%" height="100%"><PieChart>
   <Pie data={cats.map(c=>({...c,value:c.amount}))} dataKey="value" innerRadius="72%" outerRadius="93%" paddingAngle={2} cornerRadius={7} stroke="none" isAnimationActive={false} activeIndex={active} activeShape={activeShape} onMouseEnter={(_,i)=>setActive(i)} onClick={(_,i)=>onSelect?.(cats[i])} startAngle={90} endAngle={-270} cursor="pointer">{cats.map(c=><Cell key={c.category} fill={CATEGORY[c.category]?.color||'#ccc'}/>)}</Pie>
   <Pie data={[{v:ofIncome},{v:1-ofIncome}]} dataKey="v" innerRadius="61%" outerRadius="66%" startAngle={90} endAngle={-270} stroke="none" cornerRadius={6} isAnimationActive={false}><Cell fill="var(--primary)"/><Cell fill="var(--border)"/></Pie>
  </PieChart></ResponsiveContainer>
  <div className="money-ring-center">{shown?<><span className="money-cat-icon"><Icon code={CATEGORY[shown.category]?.icon} size={28}/></span><strong>{money(shown.amount)}</strong><small>{shown.members?T('Smaller categories','קטגוריות קטנות'):catName(shown.category)}</small></>:<><small>{T('Spent','הוצאות')}</small><strong>{money(summary.expenses)}</strong><small>{T(Math.round(ofIncome*100)+'% of income',Math.round(ofIncome*100)+'% מההכנסה')}</small></>}</div>
 </div>;
}

// Expected month as one bar: bills, everyday, savings and what should remain.
export function ForecastBar({T,money,outlook}){
 const income=Math.max(outlook.income,outlook.bills+outlook.everyday+outlook.savings,1),part=v=>Math.max(0,v/income*100);
 return <div className="money-forecast-bar">
  <div className="money-split tall"><i className="bills" style={{width:part(outlook.bills)+'%'}}/><i className="everyday" style={{width:part(outlook.everyday)+'%'}}/><i className="saved" style={{width:part(outlook.savings)+'%'}}/><i className="left" style={{width:part(Math.max(0,outlook.net))+'%'}}/></div>
  <ul className="money-forecast-key">
   <li><span className="bills"/>{T('Fixed bills','חיובים קבועים')}<b>{money(outlook.bills)}</b></li>
   <li><span className="everyday"/>{T('Everyday (typical)','שוטף (טיפוסי)')}<b>{money(outlook.everyday)}</b></li>
   <li><span className="saved"/>{T('Savings & pension','חיסכון ופנסיה')}<b>{money(outlook.savings)}</b></li>
   <li><span className="left"/>{T('Expected income','הכנסה צפויה')}<b>{money(outlook.income)}</b></li>
  </ul>
 </div>;
}
export const NavArrow=({he,next})=>(next!==he)?<ArrowRight size={20}/>:<ArrowLeft size={20}/>;
