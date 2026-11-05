// Keeps the browser/PWA chrome colour (status bar, iPad home-indicator strip) equal to the page background
// for the current theme, palette and day/night, instead of a fixed cobalt.
const meta=()=>document.querySelector('meta[name="theme-color"]');
function sync(){const m=meta();if(!m)return;const bg=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();if(bg&&m.content!==bg)m.content=bg}
let frame=0;const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(sync)};
new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-palette','data-day-surface','data-night','class','style']});
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',schedule);
schedule();
