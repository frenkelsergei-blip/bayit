// Statistics building blocks, drawn after the approved concept boards (concept/explorations/statistics-20261108/,
// user decision 2026-11-08): wide rounded bars in strong cobalt → navy shades with bold values, legends as bordered
// pills with faces and totals, horizontal axis titles above the value axis, lines with white-dot markers and value
// badges at the end, a yellow dashed limit with its own pill, small charts with axes on the area cards, and a tinted
// fact strip at the bottom of a card. Hebrew charts run right to left with the value axis on the right.
import React from 'react';
import {ResponsiveContainer,BarChart,Bar,LineChart,Line,AreaChart,Area,XAxis,YAxis,CartesianGrid,Tooltip,LabelList,ReferenceLine,PieChart,Pie,Cell} from 'recharts';
import {ArrowUpRight,ArrowDownRight,ArrowLeft,ArrowRight,Minus} from '@phosphor-icons/react';

// Stacked people: cobalt, mid blue, light blue, navy, then two more. Lines: cobalt and sunny yellow (as in the concept).
export const SERIES=['var(--stats-c1)','var(--stats-c2)','var(--stats-c3)','var(--stats-c4)','var(--stats-c5)','var(--stats-c6)'];
export const LINES=['var(--stats-c1)','var(--stats-line-2)','var(--stats-c4)','var(--stats-line-4)'];
export const PIE=['var(--stats-c1)','var(--stats-c3)','var(--stats-pie-3)','var(--stats-pie-4)','var(--stats-pie-5)','var(--stats-pie-6)'];
export const shortDate=(d,locale)=>new Date(d+'T12:00:00Z').toLocaleDateString(locale,{month:'short',day:'numeric'});
export const weekdayShort=(d,locale)=>new Date(d+'T12:00:00Z').toLocaleDateString(locale,{weekday:'short'});
// Tick text for a bucket: weekday for single days in a week, the start date otherwise.
// On phones Hebrew weekdays drop the word "יום" ("ה׳"), so seven labels fit under seven bars.
const narrowView=()=>typeof window!=='undefined'&&window.innerWidth<=700;
export const bucketTick=(rows,locale)=>d=>{if(!(rows.length<=7&&rows.every(r=>r.date===r.endDate)))return shortDate(d,locale);const w=weekdayShort(d,locale);return locale.startsWith('he')&&narrowView()?w.replace(/^יום\s+/,''):w};
// Round value-axis steps (0 5 10 15, 0 50 100 150 200): the top is the next round number above the highest value.
export function niceAxis(max,count=4){const m=Math.max(1,max)*1.08,raw=m/count,mag=10**Math.floor(Math.log10(raw)),step=Math.max(1,[1,2,5,10].map(f=>f*mag).find(v=>v>=raw)||10*mag),top=Math.ceil(m/step)*step;return {domain:[0,top],ticks:Array.from({length:Math.round(top/step)+1},(_,i)=>+(i*step).toFixed(6))}}
const tooltipStyle={background:'var(--surface)',color:'var(--text)',border:'1px solid var(--border)',borderRadius:14,boxShadow:'0 8px 24px #0000001a'};
// direction:ltr: in Hebrew the axis sits on the right with text-anchor "start"; an RTL text run would then grow
// leftwards into the plot ("10,000 ₪" under the bar labels, 2026-11-10). Amounts read left to right anyway.
const yTickStyle={fill:'var(--muted)',fontSize:12,fontWeight:650,direction:'ltr'};
const xTickStyle={fill:'var(--text)',fontSize:13,fontWeight:800};

// "+12% vs the previous 7 days": an arrow and green/red text (a pill only where `pill` is set).
export function Trend({t,T,days,upIsGood=true,pill=false}){
 if(!t)return null;
 const prev=days===7?T('vs last week','מהשבוע שעבר'):T('vs the previous '+days+' days','מ־'+days+' הימים הקודמים');
 if(t.kind==='new')return <span className={'stats-trend neutral'+(pill?' pill':'')}>{T('First records in this period','רישומים ראשונים בתקופה הזאת')}</span>;
 const up=t.pct>0,flat=t.pct===0,Glyph=flat?Minus:up?ArrowUpRight:ArrowDownRight,tone=flat?'neutral':up===upIsGood?'good':'bad';
 return <span className={'stats-trend '+tone+(pill?' pill':'')} title={prev}><Glyph size={17} weight="bold" aria-hidden="true"/><b><bdi dir="ltr">{(up?'+':'')+t.pct+'%'}</bdi></b> <span className="stats-trend-words">{prev}</span></span>;
}

// The small chart on an area card: unit above the value axis, 3 value ticks, first and last day, dots and a soft fill.
export function MiniChart({rows,dataKey='total',unit,xTick,rtl,label}){
 if(!rows?.length||rows.every(r=>!r[dataKey]))return <div className="stats-mini empty" aria-hidden="true"/>;
 const last=rows.length-1;
 return <figure className="stats-mini" role="img" aria-label={label}>
  {unit&&<figcaption className="stats-axis-title y">{unit}</figcaption>}
  <div className="stats-mini-plot"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{top:6,right:rtl?2:8,left:rtl?8:2,bottom:0}}>
   <CartesianGrid stroke="var(--stats-grid)" vertical={false}/>
   <XAxis reversed={rtl} dataKey="date" tickFormatter={xTick} ticks={[rows[0].date,rows[last].date]} tickLine={false} axisLine={false} tick={{fill:'var(--muted)',fontSize:11,fontWeight:750}} height={18} interval={0} padding={{left:20,right:20}}/>
   <YAxis orientation={rtl?'right':'left'} allowDecimals={false} tickCount={4} tickLine={false} axisLine={false} tick={{fill:'var(--muted)',fontSize:11}} width={28}/>
   <Area isAnimationActive={false} type="monotone" dataKey={dataKey} stroke="var(--stats-c1)" strokeWidth={2.5} fill="var(--stats-mini-fill)" dot={{r:3,fill:'var(--stats-c1)',stroke:'var(--stats-c1)'}} activeDot={false}/>
  </AreaChart></ResponsiveContainer></div>
 </figure>;
}

// One area of the Overview: tinted card, icon in a tinted circle, the name, a big number with its meaning, the change
// against the previous period, a small chart with axes and Details.
export function AreaCard({icon:Glyph,tone,title,value,label,trend,mini,onOpen,T,rtl,days,upIsGood,children}){
 const Go=rtl?ArrowLeft:ArrowRight;
 return <section className={'stats-area-card tone-'+tone}>
  <header><span className="summary-symbol" aria-hidden="true"><Glyph size={24}/></span><h2>{title}</h2>{onOpen&&<button type="button" className="stats-details" onClick={onOpen} aria-label={T('Details: ','פרטים: ')+title}>{T('Details','פרטים')}<Go size={16} weight="bold" aria-hidden="true"/></button>}</header>
  <div className="stats-area-body"><div className="stats-area-figure"><strong><bdi dir="auto">{value}</bdi></strong><span>{label}</span>{trend&&<Trend pill t={trend} T={T} days={days} upIsGood={upIsGood}/>}</div>{mini&&<MiniChart rtl={rtl} {...mini}/>}</div>
  {children}
 </section>;
}

// A chart or list inside a tab: title, a one-line note, an optional action, a legend at the reading end and a
// tinted fact strip at the bottom.
export function ChartCard({title,note,action,legend,footer,className='',children}){
 return <section className={'stats-chart-card'+(className?' '+className:'')}>
  <div className="stats-chart-head"><div className="stats-chart-heading"><h2>{title}</h2>{note&&<p>{note}</p>}</div>{legend}{action}</div>
  {children}
  {footer&&<p className="stats-card-strip">{footer}</p>}
 </section>;
}

// Legend pills: swatch, face, name and total.
export function PeopleLegend({items,Avatar,name}){
 return <ul className="stats-legend">{items.map(it=><li key={it.id}><i style={{background:it.color}} aria-hidden="true"/>{it.who!==false&&<Avatar decorative who={it.id} size={30}/>}<span>{it.label||name(it.id)}</span>{it.total!==undefined&&<b><bdi dir="ltr">{'('+it.total+')'}</bdi></b>}</li>)}</ul>;
}

// A pill on the chart (end-of-line values, the limit label).
const pillLabel=({fill,color='#fff',text,align='middle',below=false})=>props=>{
 const {x,y,value,index,viewBox}=props,label=text?text(value,index):value;if(label===null||label===undefined||label==='')return null;
 const s=String(label),w=Math.max(30,s.length*7.6+16),cx=viewBox&&viewBox.width?(align==='start'?viewBox.x+w/2+4:viewBox.x+viewBox.width-w/2-4):x,cy=viewBox&&viewBox.width?viewBox.y:below?y+22:y-18;
 return <g><rect x={cx-w/2} y={cy-12} width={w} height={24} rx={12} fill={fill}/><text x={cx} y={cy+4.5} textAnchor="middle" fill={color} fontSize={12.5} fontWeight={850}>{s}</text></g>;
};

// A bar's value above it, only when it fits the bar's column: on a phone six month columns are ~40px and the amounts
// ran into each other (2026-11-10). The tooltip still gives every value.
const barValue=format=>({x,y,width,value})=>{const s=format?format(value):value;if(s===''||s===null||s===undefined)return null;
 const visible=String(s).replace(/[\u200e\u200f]/g,'').length*8.6;if(!(width>0)||visible>width/0.8-4)return null;
 return <text x={x+width/2} y={y-8} textAnchor="middle" fill="var(--text)" fontSize={15} fontWeight={900}>{s}</text>};

// Vertical bars. `keys` are the stacked series ({id,color,label}); one key = simple bars.
export function BarsChart({rows,keys,xTick,yTick,yLabel,xLabel,rtl,height='var(--stats-chart)',valueLabels=true,valueFormat,tooltipLabel,tooltipValue,reference}){
 const stacked=keys.length>1,top=keys.at(-1).id,axis=niceAxis(Math.max(reference?.y||0,...rows.map(r=>stacked?keys.reduce((n,k)=>n+(r[k.id]||0),0):r[keys[0].id]||0)));
 return <figure className="stats-figure">
  {yLabel&&<figcaption className="stats-axis-title y">{yLabel}</figcaption>}
  <div className="stats-chart" style={{height}}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{top:26,right:rtl?2:10,left:rtl?10:2,bottom:0}} barCategoryGap="20%">
   <CartesianGrid stroke="var(--stats-grid)" vertical={false}/>
   <XAxis reversed={rtl} dataKey="date" tickFormatter={xTick} tickLine={false} axisLine={{stroke:'var(--stats-axis)'}} tick={xTickStyle} interval={rows.length<=8?0:'preserveStartEnd'} minTickGap={6} height={28}/>
   <YAxis orientation={rtl?'right':'left'} allowDecimals={false} tickLine={false} axisLine={false} tick={yTickStyle} tickFormatter={yTick} width={yTick?74:30} domain={axis.domain} ticks={axis.ticks}/>
   {reference&&<ReferenceLine y={reference.y} stroke="var(--stats-limit)" strokeDasharray="7 6" strokeWidth={2.5} ifOverflow="extendDomain" label={pillLabel({fill:'var(--stats-limit-pill)',color:'var(--stats-limit-text)',text:()=>reference.label,align:rtl?'end':'start'})}/>}
   <Tooltip cursor={{fill:'var(--stats-cursor)'}} labelFormatter={tooltipLabel} formatter={tooltipValue} contentStyle={tooltipStyle}/>
   {keys.map(k=><Bar key={k.id} isAnimationActive={false} dataKey={k.id} name={k.label} stackId={stacked?'a':undefined} fill={k.color} stroke={stacked?'var(--surface)':undefined} strokeWidth={stacked?1.5:0} radius={stacked?(k.id===top?[10,10,0,0]:[0,0,0,0]):[10,10,3,3]} maxBarSize={112}>{valueLabels&&rows.length<=14&&k.id===top&&<LabelList dataKey={stacked?'total':k.id} content={barValue(valueFormat)}/>}</Bar>)}
  </BarChart></ResponsiveContainer></div>
  {xLabel&&<figcaption className="stats-axis-title x">{xLabel}</figcaption>}
 </figure>;
}

// Lines over time, one per person: white-dot markers and the last value as a pill in the line's colour.
export function LinesChart({rows,keys,xTick,yLabel,xLabel,rtl,height='var(--stats-chart)',tooltipLabel,endLabel=v=>v}){
 const last=rows.length-1,single=keys.length===1,axis=niceAxis(Math.max(...rows.flatMap(r=>keys.map(k=>r[k.id]||0)))*1.15);
 const Chart=single?AreaChart:LineChart,ends=keys.map(k=>rows[last]?.[k.id]||0);
 return <figure className="stats-figure">
  {yLabel&&<figcaption className="stats-axis-title y">{yLabel}</figcaption>}
  <div className="stats-chart" style={{height}}><ResponsiveContainer width="100%" height="100%"><Chart data={rows} margin={{top:30,right:rtl?2:34,left:rtl?34:2,bottom:6}}>
   <CartesianGrid stroke="var(--stats-grid)" vertical={false}/>
   <XAxis reversed={rtl} dataKey="date" tickFormatter={xTick} tickLine={false} axisLine={{stroke:'var(--stats-axis)'}} tick={xTickStyle} interval={rows.length<=8?0:'preserveStartEnd'} minTickGap={6} padding={{left:20,right:20}} height={28}/>
   <YAxis orientation={rtl?'right':'left'} allowDecimals={false} tickLine={false} axisLine={false} tick={yTickStyle} width={34} domain={axis.domain} ticks={axis.ticks}/>
   <Tooltip labelFormatter={tooltipLabel} contentStyle={tooltipStyle}/>
   {keys.map((k,ki)=>{const S=single?Area:Line,below=ends[ki]<Math.max(...ends);return <S key={k.id} isAnimationActive={false} type="monotone" dataKey={k.id} name={k.label} stroke={k.color} strokeWidth={3} fill={single?'var(--stats-mini-fill)':undefined} dot={{r:4.5,strokeWidth:2.5,fill:'var(--surface)',stroke:k.color}} activeDot={{r:6}}><LabelList dataKey={k.id} content={p=>p.index===last?pillLabel({fill:k.color,color:k.ink||'#fff',text:v=>endLabel(v),below})(p):null}/></S>})}
  </Chart></ResponsiveContainer></div>
  {xLabel&&<figcaption className="stats-axis-title x">{xLabel}</figcaption>}
 </figure>;
}

// Donut with the total in the middle and a legend of coloured squares beside it.
export function Donut({rows,label,total,totalLabel,colors=PIE}){
 return <div className="stats-donut">
  <div className="stats-donut-plot" role="img" aria-label={totalLabel+': '+total}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={rows} dataKey="count" nameKey="key" innerRadius="60%" outerRadius="96%" paddingAngle={1.5} stroke="none" startAngle={90} endAngle={-270}>{rows.map((r,i)=><Cell key={r.key} fill={colors[i%colors.length]}/>)}</Pie></PieChart></ResponsiveContainer><span className="stats-donut-total"><b>{total}</b><small>{totalLabel}</small></span></div>
  <ul className="statistics-category-legend">{rows.map((r,i)=><li key={r.key}><i style={{background:colors[i%colors.length]}} aria-hidden="true"/><span>{label(r.key)}</span><b>{r.count}</b></li>)}</ul>
 </div>;
}

// Horizontal bars with a face per person (events per person, …): thick cobalt bars with the value at the end.
export function PersonBars({rows,Avatar,name,unit=n=>n}){
 const max=Math.max(1,...rows.map(r=>r.count));
 return <div className="stats-person-bars">{rows.map(r=><div className="stats-person-bar" key={r.id}><Avatar decorative who={r.id} size={40}/><strong>{name(r.id)}</strong><span className="stats-hbar" aria-hidden="true"><i style={{width:Math.max(r.count?4:0,r.count/max*100)+'%'}}/></span><b><bdi dir="auto">{unit(r.count)}</bdi></b></div>)}</div>;
}

// Week × time of day: soft cells (cream when empty, deeper blue when busier); counts in the title and accessible name.
export function HeatGrid({heat,T,weekdayNames}){
 const max=Math.max(1,...heat.flatMap(h=>h.slots.map(s=>s.count))),level=n=>n?Math.max(1,Math.ceil(n/max*4)):0,slots=[['morning',T('Morning','בוקר')],['afternoon',T('Afternoon','צהריים')],['evening',T('Evening','ערב')]];
 return <div className="stats-heat">
  <div className="stats-heat-legend" aria-hidden="true"><span>{T('Events','אירועים')}</span>{[0,1,2,3,4].map(n=><span key={n} className="stats-heat-key"><i className={'stats-heat-cell level-'+n}/><small>{n===0?'0':n===4?Math.max(4,max)+'':''}</small></span>)}</div>
  <div className="stats-heat-table" role="table" aria-label={T('Events by day and time','אירועים לפי יום ושעה')}>
   <div className="stats-heat-row head" role="row"><span role="columnheader"/>{heat.map(h=><span role="columnheader" key={h.day}>{weekdayNames[h.day]}</span>)}</div>
   {slots.map(([id,label],si)=><div className="stats-heat-row" role="row" key={id}><span role="rowheader">{label}</span>{heat.map(h=>{const n=h.slots[si].count;return <span role="cell" key={h.day} className={'stats-heat-cell level-'+level(n)} aria-label={weekdayNames[h.day]+' · '+label+': '+n} title={weekdayNames[h.day]+' · '+label+': '+n}/>})}</div>)}
  </div>
 </div>;
}

// Ranked rows (number · icon · name · thick bar with the count): tasks, items.
export function RankRows({rows,Icon,label,limit=6}){
 const max=rows[0]?.count||1;
 return <ol className="stats-rank">{rows.slice(0,limit).map((r,i)=><li key={r.key}><span className="stats-rank-n">{i+1}</span>{r.records?.[0]?.icon?<Icon code={r.records[0].icon} size={32}/>:<span aria-hidden="true"/>}<strong>{label(r)}</strong><span className="stats-hbar" aria-hidden="true"><i style={{width:r.count/max*100+'%'}}/></span><b>{r.count}</b></li>)}</ol>;
}
