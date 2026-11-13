// Today on wide screens, direction A (owner's choice 2026-11-13; see today-wide.css). From 1024px the sections sit in
// two columns that stack independently, so a short section never leaves a hole beside a long one:
// - each section goes to the shorter column, in the order the person chose (the reading order stays the DOM order);
// - a wide section (Top priorities in Cards) spans both columns;
// - Expenses this month followed by Coming up: bills start on the same line at equal height.
// Below 1024 (today-wide.css does not set --today-columns) every placement is cleared and the page is as before.
import './today-wide.css';

const ROW = 4; // grid-auto-rows in today-wide.css

function clear(grid) {
  delete grid.dataset.todayColumns;
  for (const c of grid.children) for (const p of ['gridColumn', 'gridRow', 'height', 'alignSelf']) c.style[p] = '';
}

function place(grid) {
  const cols = Number(getComputedStyle(grid).getPropertyValue('--today-columns').trim()) || 1;
  if (cols < 2) { if (grid.dataset.todayColumns !== undefined) clear(grid); return; }
  grid.dataset.todayColumns = String(cols);
  const compact = document.documentElement.dataset.density === 'compact', kids = [...grid.children], end = new Array(cols).fill(1);
  const span = c => {
    c.style.gridRow = ''; c.style.height = ''; c.style.alignSelf = '';
    const gap = parseFloat(getComputedStyle(c).marginBlockEnd) || 0;
    return Math.max(1, Math.ceil((c.getBoundingClientRect().height + gap) / ROW));
  };
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i], next = kids[i + 1];
    if (c.classList.contains('wide') && !compact) {
      const s = Math.max(...end), h = span(c);
      c.style.gridColumn = '1 / -1'; c.style.gridRow = s + ' / span ' + h; end.fill(s + h); continue;
    }
    if (cols === 2 && c.classList.contains('today-money') && next?.classList.contains('today-bills')) {
      const s = Math.max(...end), h = Math.max(span(c), span(next));
      c.style.gridColumn = '1'; next.style.gridColumn = '2';
      for (const x of [c, next]) { x.style.gridRow = s + ' / span ' + h; x.style.alignSelf = 'stretch'; x.style.height = 'calc(100% - ' + getComputedStyle(x).marginBlockEnd + ')'; }
      end.fill(s + h); i++; continue;
    }
    let k = 0; for (let j = 1; j < cols; j++) if (end[j] < end[k]) k = j;
    const h = span(c); c.style.gridColumn = String(k + 1); c.style.gridRow = end[k] + ' / span ' + h; end[k] += h;
  }
}

// A stable ref callback for Today's section grid (React 19 runs the returned cleanup on unmount).
export function todayColumns(grid) {
  if (!grid || typeof ResizeObserver === 'undefined') return;
  let frame = 0;
  const tick = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; place(grid); }); };
  // A paired card has a set height, so its own size hides content that loads later (the month's figures, bills):
  // watch each section and what is directly inside it, and any change to the sections' content.
  const sizes = new ResizeObserver(tick), watch = () => { for (const c of grid.children) { sizes.observe(c); for (const d of c.children) sizes.observe(d); } };
  sizes.observe(grid); watch();
  const sections = new MutationObserver(() => { watch(); tick(); });
  sections.observe(grid, {childList: true, subtree: true, characterData: true});
  const density = new MutationObserver(tick);
  density.observe(document.documentElement, {attributes: true, attributeFilter: ['data-density']});
  tick();
  return () => { cancelAnimationFrame(frame); sizes.disconnect(); sections.disconnect(); density.disconnect(); };
}
