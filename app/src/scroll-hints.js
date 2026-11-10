// Horizontal strips (tabs, task lists, people chips, the When control) scroll without a visible scrollbar.
// Instead, the strip fades softly at the edge that has more content. data-hscroll gets "start" and/or "end"
// (logical sides, so it works in Hebrew RTL too).
const SELECTOR='.nav-section>.nav-track,.tabs:not(.nav-section),.tasks-lists,.tasks-people,.tasks-range,.shopping-list-tabs,.calendar-person-legend,.phone-quick-icons,.data-table';
const update=(el,fromScroll)=>{if(!fromScroll&&el.classList.contains('nav-track')){peek(el);if(!el._touched)reveal(el)}const max=el.scrollWidth-el.clientWidth;if(max<=2){el.removeAttribute('data-hscroll');if(el.dataset.auditScroll){el.removeAttribute('tabindex');delete el.dataset.auditScroll}return}if(!el.hasAttribute('tabindex')){el.tabIndex=0;el.dataset.auditScroll='true';if(!el.getAttribute('aria-label'))el.setAttribute('aria-label',document.documentElement.lang==='he'?'תוכן שניתן לגלול לרוחב':'Horizontally scrollable content')}const pos=Math.abs(el.scrollLeft),flags=[pos>8?'start':'',max-pos>8?'end':'']/* 8px: scroll-snap can leave a strip a few px from its edge (user report 2026-11-08: both sides faded at the start) */.filter(Boolean).join(' ');if(el.getAttribute('data-hscroll')!==flags)el.setAttribute('data-hscroll',flags)};
// A section menu that does not fit sizes its tiles (within 95–110% of the shared --nav-tile) so the tile at the edge is
// cut near its middle: a half tile always peeks out, never a sliver (user report 2026-11-09: "not clear there are
// more"). Tiles never go below their own longest word. Sets --nav-peek on the bar; navigation.css uses it as the basis.
function peek(el){const tiles=[...el.children].filter(t=>t.tagName==='BUTTON'),cs=getComputedStyle(el),base=parseFloat(cs.getPropertyValue('--nav-tile'));
 if(!tiles.length||!(base>0)||cs.display!=='flex'||getComputedStyle(tiles[0]).flexGrow==='0'){el.style.removeProperty('--nav-peek');return}
 for(const t of tiles){t.style.setProperty('flex','0 0 auto');t.style.setProperty('width','min-content')}
 const mins=tiles.map(t=>t.getBoundingClientRect().width);for(const t of tiles){t.style.removeProperty('flex');t.style.removeProperty('width')}
 const gap=parseFloat(cs.columnGap)||0,W=el.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),total=b=>mins.reduce((n,m)=>n+Math.max(b,m),0)+gap*(tiles.length-1);
 if(total(base)<=W+1){el.style.removeProperty('--nav-peek');return}
 let best=base,score=1e9;for(let b=base*.95;b<=base*1.1;b+=.5){let x=0,f=1;for(const m of mins){const w=Math.max(b,m);if(x+w>W){f=(W-x)/w;break}x+=w+gap}
  const sc=Math.abs(f-.5)+Math.abs(b-base)/base*.2;if(sc<score){score=sc;best=b}}
 const v=best.toFixed(1)+'px';if(el.style.getPropertyValue('--nav-peek')!==v)el.style.setProperty('--nav-peek',v)}
const seen=new WeakSet(),ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(entries=>entries.forEach(e=>update(e.target))):null;
// A newly shown tab bar that scrolls opens with its chosen tab in view and clear of the 44px edge fades
// (user report 2026-11-08: "verify that you can see the yellow one").
// Section menus keep re-centring their chosen tile while tile widths settle (fonts, --nav-peek), until the person
// touches or scrolls the bar themself; their tiles are kept clear of the wider 52px fade (tab-fade.css).
const reveal=el=>{if(el.scrollWidth-el.clientWidth<=2)return;const edge=el.classList.contains('nav-track')?56:44;const on=el.querySelector(':scope>.active,:scope>[aria-current=page],:scope>[aria-selected=true],:scope>[aria-pressed=true]');if(!on)return;const b=el.getBoundingClientRect(),o=on.getBoundingClientRect();if(o.left<b.left+edge||o.right>b.right-edge)el.scrollLeft+=(o.left+o.width/2)-(b.left+b.width/2)};
const scan=()=>{for(const el of document.querySelectorAll(SELECTOR)){if(!seen.has(el)){seen.add(el);el.addEventListener('scroll',()=>update(el,true),{passive:true});for(const ev of ['pointerdown','touchstart','wheel','keydown'])el.addEventListener(ev,()=>{el._touched=true},{passive:true});ro?.observe(el);update(el);requestAnimationFrame(()=>requestAnimationFrame(()=>{reveal(el);update(el)}))}else update(el)}};
let frame=0;const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(scan)};
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('resize',schedule);document.fonts?.ready?.then(schedule);schedule();
