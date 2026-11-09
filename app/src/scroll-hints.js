// Horizontal strips (tabs, task lists, people chips, the When control) scroll without a visible scrollbar.
// Instead, the strip fades softly at the edge that has more content. data-hscroll gets "start" and/or "end"
// (logical sides, so it works in Hebrew RTL too).
const SELECTOR='.tabs,.tasks-lists,.tasks-people,.tasks-range,.shopping-list-tabs,.calendar-person-legend,.phone-quick-icons,.data-table';
const update=el=>{const max=el.scrollWidth-el.clientWidth;if(max<=2){el.removeAttribute('data-hscroll');if(el.dataset.auditScroll){el.removeAttribute('tabindex');delete el.dataset.auditScroll}return}if(!el.hasAttribute('tabindex')){el.tabIndex=0;el.dataset.auditScroll='true';if(!el.getAttribute('aria-label'))el.setAttribute('aria-label',document.documentElement.lang==='he'?'תוכן שניתן לגלול לרוחב':'Horizontally scrollable content')}const pos=Math.abs(el.scrollLeft),flags=[pos>8?'start':'',max-pos>8?'end':'']/* 8px: scroll-snap can leave a strip a few px from its edge (user report 2026-11-08: both sides faded at the start) */.filter(Boolean).join(' ');if(el.getAttribute('data-hscroll')!==flags)el.setAttribute('data-hscroll',flags)};
const seen=new WeakSet(),ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(entries=>entries.forEach(e=>update(e.target))):null;
// A newly shown tab bar that scrolls opens with its chosen tab in view and clear of the 44px edge fades
// (user report 2026-11-08: "verify that you can see the yellow one").
const reveal=el=>{if(el.scrollWidth-el.clientWidth<=2)return;const on=el.querySelector(':scope>.active,:scope>[aria-current=page],:scope>[aria-selected=true],:scope>[aria-pressed=true]');if(!on)return;const b=el.getBoundingClientRect(),o=on.getBoundingClientRect();if(o.left<b.left+44||o.right>b.right-44)el.scrollLeft+=(o.left+o.width/2)-(b.left+b.width/2)};
const scan=()=>{for(const el of document.querySelectorAll(SELECTOR)){if(!seen.has(el)){seen.add(el);el.addEventListener('scroll',()=>update(el),{passive:true});ro?.observe(el);update(el);requestAnimationFrame(()=>requestAnimationFrame(()=>{reveal(el);update(el)}))}else update(el)}};
let frame=0;const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(scan)};
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('resize',schedule);document.fonts?.ready?.then(schedule);schedule();
