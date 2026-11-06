// Horizontal strips (tabs, task lists, people chips, the When control) scroll without a visible scrollbar.
// Instead, the strip fades softly at the edge that has more content. data-hscroll gets "start" and/or "end"
// (logical sides, so it works in Hebrew RTL too).
const SELECTOR='.tabs,.tasks-lists,.tasks-people,.tasks-range,.shopping-list-tabs,.calendar-person-legend,.phone-quick-icons,.data-table';
const update=el=>{const max=el.scrollWidth-el.clientWidth;if(max<=2){el.removeAttribute('data-hscroll');if(el.dataset.auditScroll){el.removeAttribute('tabindex');delete el.dataset.auditScroll}return}if(!el.hasAttribute('tabindex')){el.tabIndex=0;el.dataset.auditScroll='true';if(!el.getAttribute('aria-label'))el.setAttribute('aria-label',document.documentElement.lang==='he'?'תוכן שניתן לגלול לרוחב':'Horizontally scrollable content')}const pos=Math.abs(el.scrollLeft),flags=[pos>2?'start':'',max-pos>2?'end':''].filter(Boolean).join(' ');if(el.getAttribute('data-hscroll')!==flags)el.setAttribute('data-hscroll',flags)};
const seen=new WeakSet(),ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(entries=>entries.forEach(e=>update(e.target))):null;
const scan=()=>{for(const el of document.querySelectorAll(SELECTOR)){if(!seen.has(el)){seen.add(el);el.addEventListener('scroll',()=>update(el),{passive:true});ro?.observe(el)}update(el)}};
let frame=0;const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(scan)};
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('resize',schedule);document.fonts?.ready?.then(schedule);schedule();
