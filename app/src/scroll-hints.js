// Horizontal strips (tabs, task lists, people chips, the When control) scroll without a visible scrollbar.
// Instead, the strip fades softly at the edge that has more content. data-hscroll gets "start" and/or "end"
// (logical sides, so it works in Hebrew RTL too).
const SELECTOR='.nav-section>.nav-track,.tabs:not(.nav-section),.tasks-lists,.tasks-people,.tasks-range,.shopping-list-tabs,.calendar-person-legend,.phone-quick-icons,.data-table';
// A section menu's fade lives on its bar (tab-fade.css), so the flags are mirrored there as data-more.
const flag=(el,v)=>{for(const [t,at] of [[el,'data-hscroll'],[el.classList.contains('nav-track')&&el.parentElement,'data-more']]){if(!t)continue;if(v==null)t.removeAttribute(at);else if(t.getAttribute(at)!==v)t.setAttribute(at,v)}};
const update=(el,fromScroll)=>{if(!fromScroll&&el.classList.contains('nav-track')){peek(el);if(!el._touched)reveal(el);nudge(el)}const max=el.scrollWidth-el.clientWidth;if(max<=2){flag(el,null);if(el.dataset.auditScroll){el.removeAttribute('tabindex');delete el.dataset.auditScroll}return}if(!el.hasAttribute('tabindex')){el.tabIndex=0;el.dataset.auditScroll='true';if(!el.getAttribute('aria-label'))el.setAttribute('aria-label',document.documentElement.lang==='he'?'תוכן שניתן לגלול לרוחב':'Horizontally scrollable content')}const pos=Math.abs(el.scrollLeft),flags=[pos>8?'start':'',max-pos>8?'end':'']/* 8px: scroll-snap can leave a strip a few px from its edge (user report 2026-11-08: both sides faded at the start) */.filter(Boolean).join(' ');flag(el,flags)};
// A section menu sizes its tiles so the person sees at once whether there is more (user reports 2026-11-09 and
// 2026-11-10, Statistics on iPhone: "you don't see there is more", "it is stuck when I scroll"):
// · if every tile fits at no less than 85% of the shared --nav-tile (and none below its own longest word), they all
//   fit: nothing is hidden, nothing scrolls;
// · otherwise the tile at the edge is cut so about 60% of it (its icon) shows, and at least one whole tile's width is
//   hidden, so a swipe really travels (half a tile hidden made a 28px scroll that felt stuck).
// Tiles stay within 92–112% of --nav-tile. Sets --nav-peek on the track; navigation.css uses it as the basis.
// Measuring forces layout, so it runs only when the track's width, tiles, labels or text size change.
function peek(el){const tiles=[...el.children].filter(t=>t.tagName==='BUTTON'),cs=getComputedStyle(el),base=parseFloat(cs.getPropertyValue('--nav-tile'));
 if(!tiles.length||!(base>0)||cs.display!=='flex'||getComputedStyle(tiles[0]).flexGrow==='0'){el.style.removeProperty('--nav-peek');el._peekKey='';return}
 const key=fontEpoch+'|'+el.clientWidth+'|'+base+'|'+getComputedStyle(tiles[0]).fontSize+'|'+tiles.map(t=>t.textContent).join('|');if(el._peekKey===key)return;el._peekKey=key;
 for(const t of tiles){t.style.setProperty('flex','0 0 auto');t.style.setProperty('width','min-content')}
 const mins=tiles.map(t=>t.getBoundingClientRect().width);for(const t of tiles){t.style.removeProperty('flex');t.style.removeProperty('width')}
 const gap=parseFloat(cs.columnGap)||0,W=el.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),n=tiles.length,total=b=>mins.reduce((t,m)=>t+Math.max(b,m),0)+gap*(n-1);
 const set=v=>{v=v==null?'':Math.floor(v*2)/2+'px';if(el.style.getPropertyValue('--nav-peek')!==v){if(v)el.style.setProperty('--nav-peek',v);else el.style.removeProperty('--nav-peek')}};
 if(total(base)<=W+1)return set(null);
 const fit=(W-gap*(n-1))/n;if(fit>=base*.85&&mins.every(m=>m<=fit+.5))return set(fit);
 let best=base,score=1e9;for(let b=base*.92;b<=base*1.12;b+=.5){let x=0,f=1,k=n;for(let i=0;i<n;i++){const w=Math.max(b,mins[i]);if(x+w>W){f=(W-x)/w;k=i;break}x+=w+gap}
  const hidden=n-k-f,sc=Math.abs(f-.6)+(hidden<.95?1:0)+Math.abs(b-base)/base*.2;if(sc<score){score=sc;best=b}}
 set(best)}
// First time a person meets a section menu that scrolls, its tiles slide a little towards the hidden ones and back
// (once per bar per visit, and no more once the person has scrolled any section menu; never with reduced motion).
// A CSS animation of the tiles, not a scroll: it can never fight the person's finger and stops when touched.
const NUDGED=new Set();let fontEpoch=0;
function nudge(el){if(el._nudged||el._touched||el.scrollWidth-el.clientWidth<=2)return;el._nudged=true;
 const id=el.parentElement?.getAttribute('aria-label')||'';let done=NUDGED.has(id);try{done=done||localStorage.getItem('bayit-nav-swiped')==='1'}catch{}
 if(done||document.documentElement.dataset.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;NUDGED.add(id);
 setTimeout(()=>{if(el._touched||!el.isConnected)return;el.classList.add('nav-nudge');setTimeout(()=>el.classList.remove('nav-nudge'),1500)},700)}
const seen=new WeakSet(),ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(entries=>entries.forEach(e=>update(e.target))):null;
// A newly shown tab bar that scrolls opens with its chosen tab in view and clear of the 44px edge fades
// (user report 2026-11-08: "verify that you can see the yellow one").
// Section menus keep re-centring their chosen tile while tile widths settle (fonts, --nav-peek), until the person
// touches or scrolls the bar themself; their tiles are kept clear of the 32px edge fade (tab-fade.css).
const reveal=el=>{if(el.scrollWidth-el.clientWidth<=2)return;const edge=el.classList.contains('nav-track')?40:44;const on=el.querySelector(':scope>.active,:scope>[aria-current=page],:scope>[aria-selected=true],:scope>[aria-pressed=true]');if(!on)return;const b=el.getBoundingClientRect(),o=on.getBoundingClientRect();if(o.left<b.left+edge||o.right>b.right-edge)el.scrollLeft+=(o.left+o.width/2)-(b.left+b.width/2)};
const scan=()=>{for(const el of document.querySelectorAll(SELECTOR)){if(!seen.has(el)){seen.add(el);el.addEventListener('scroll',()=>update(el,true),{passive:true});for(const ev of ['pointerdown','touchstart','wheel','keydown'])el.addEventListener(ev,()=>{el._touched=true;el.classList.remove('nav-nudge')},{passive:true});if(el.classList.contains('nav-track'))el.addEventListener('scroll',()=>{if(el._touched&&!el._swiped){el._swiped=true;try{localStorage.setItem('bayit-nav-swiped','1')}catch{}}},{passive:true});ro?.observe(el);update(el);requestAnimationFrame(()=>requestAnimationFrame(()=>{reveal(el);update(el)}))}else update(el)}};
let frame=0;const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(scan)};
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('resize',schedule);document.fonts?.ready?.then(()=>{fontEpoch++;schedule()});schedule();
