// Skeleton loading placeholders: shapes of the real layout with a soft shimmer, instead of "Loading…" text.
// Each placeholder is one role=status region with a screen-reader label; the shapes themselves are hidden.
import React,{useLayoutEffect} from 'react';

export function Skel({w='100%',h=16,r=10,className='',style}){return <span className={'skel '+className} style={{width:w,height:h,borderRadius:r,...style}} aria-hidden="true"/>}

function Busy({label,className='',children}){return <div className={'skel-region '+className} role="status" aria-live="polite" aria-busy="true"><span className="skel-sr">{label}</span>{children}</div>}

export function SkelRows({rows=4,avatar=true,trailing=true,icon=true}){
 return <div className="skel-rows" aria-hidden="true">{Array.from({length:rows},(_,i)=><div className="skel-row" key={i} style={{'--i':i}}>
  {icon&&<Skel w={48} h={48} r={14}/>}
  <div className="skel-row-text"><Skel w={['62%','48%','70%','55%','40%'][i%5]} h={18}/><Skel w={['34%','26%','40%','30%','22%'][i%5]} h={13}/></div>
  {avatar&&<Skel w={34} h={34} r={17}/>}
  {trailing&&<Skel w={86} h={34} r={17}/>}
 </div>)}</div>;
}

// A whole page body (under the page header) while its data loads.
export function PageSkeleton({label,variant='list'}){
 return <Busy label={label} className={'skel-page skel-'+variant}>
  {variant==='money'?<>
   <div className="skel-toolbar" aria-hidden="true"><Skel w={260} h={46} r={23}/><span className="skel-spacer"/><Skel w={140} h={46} r={23}/><Skel w={140} h={46} r={23}/></div>
   <div className="skel-money-grid" aria-hidden="true">
    <div className="skel-card skel-hero"><Skel w="38%" h={16}/><Skel w="58%" h={52} r={14}/><Skel w="44%" h={14}/><div className="skel-bar-row">{[62,84,48,92,70,56].map((v,i)=><Skel key={i} w={22} h={v} r={8}/>)}</div></div>
    <div className="skel-card skel-donut"><Skel w="46%" h={20}/><Skel w={170} h={170} r={85} className="skel-circle"/><Skel w="70%" h={14}/></div>
   </div>
   <div className="skel-metrics" aria-hidden="true">{[0,1,2,3].map(i=><div className="skel-card" key={i}><Skel w={40} h={40} r={12}/><Skel w="55%" h={14}/><Skel w="70%" h={28} r={10}/></div>)}</div>
   <div className="skel-card"><Skel w="30%" h={22}/><SkelRows rows={4}/></div>
  </>:variant==='panel'?<div className="skel-card skel-panel" aria-hidden="true"><Skel w={150} h={30} r={15}/><Skel w="72%" h={30} r={12}/><Skel w="92%" h={15}/><Skel w="80%" h={15}/><div className="skel-field-pair"><Skel h={52} r={16}/><Skel h={52} r={16}/></div><Skel h={52} r={16}/><Skel w={220} h={50} r={25}/></div>
  :<div className="skel-card"><SkelRows rows={5}/></div>}
 </Busy>;
}

// Small widget body (Today cards).
export function WidgetSkeleton({label,rows=3,hero=false}){
 return <Busy label={label} className="skel-widget">{hero&&<div className="skel-widget-hero" aria-hidden="true"><Skel w="52%" h={34} r={12}/><Skel w="100%" h={12} r={6}/></div>}<SkelRows rows={rows} avatar={false} trailing={false}/></Busy>;
}

// Inline status chip (e.g. "connected?") while it is being checked.
export function ChipSkeleton({label,w=150}){return <span className="skel-chip-wrap" role="status" aria-busy="true"><span className="skel-sr">{label}</span><Skel w={w} h={30} r={15}/></span>}

// Full app shell while the household opens (before App mounts). Respects the saved theme and language.
export function AppBootSkeleton({label='Opening your home…'}){
 useLayoutEffect(()=>{const root=document.documentElement;try{const theme=JSON.parse(localStorage.getItem('bayit-theme')||'"light"'),lang=JSON.parse(localStorage.getItem('bayit-lang')||'"en"');if(!root.dataset.theme)root.dataset.theme=theme==='dark'?'dark':'light';if(!root.dir)root.dir=lang==='he'?'rtl':'ltr'}catch{}},[]);
 const he=document.documentElement.dir==='rtl',text=he&&label==='Opening your home…'?'פותחים את הבית שלכם…':label;
 return <div className="skel-boot" role="status" aria-busy="true"><span className="skel-sr">{text}</span>
  <aside className="skel-boot-side" aria-hidden="true"><img className="skel-boot-logo" src="/assets/generated/bayit-logo-512.png" alt=""/><div className="skel-boot-family"><Skel w={52} h={52} r={26}/><div><Skel w={110} h={16}/><Skel w={80} h={12}/></div></div>{Array.from({length:9},(_,i)=><div className="skel-boot-nav" key={i}><Skel w={26} h={26} r={8}/><Skel w={[90,80,64,84,110,56,96,88,70][i]} h={15}/></div>)}</aside>
  <div className="skel-boot-top" aria-hidden="true"><Skel w={28} h={22} r={6}/><img src="/assets/generated/bayit-logo-512.png" alt=""/><Skel w={34} h={34} r={17}/></div>
  <main className="skel-boot-main" aria-hidden="true">
   <div className="skel-boot-head"><div><Skel w="min(460px,70vw)" h={46} r={14}/><Skel w="min(240px,45vw)" h={18}/></div><Skel w={48} h={48} r={24}/></div>
   <div className="skel-boot-actions"><Skel w={190} h={52} r={26}/></div>
   <div className="skel-boot-grid"><div className="skel-card"><Skel w="40%" h={22}/><SkelRows rows={4} trailing={false}/></div><div className="skel-card"><Skel w="50%" h={22}/><SkelRows rows={3} avatar={false} trailing={false}/></div></div>
  </main>
  <div className="skel-boot-pill"><img src="/assets/generated/fx/house.png" alt=""/><span>{text}</span></div>
  <div className="skel-boot-tabs" aria-hidden="true">{[0,1,2,3,4].map(i=><Skel key={i} w={36} h={36} r={12}/>)}</div>
 </div>;
}
