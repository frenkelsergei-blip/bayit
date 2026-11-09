// Last input type on <html data-input="pointer|keyboard">, so focus rings can show for keyboard users only
// (user report 2026-11-08: a blue frame around a window's X after tapping to open it).
const root=document.documentElement;
const set=value=>{if(root.dataset.input!==value)root.dataset.input=value};
addEventListener('pointerdown',()=>set('pointer'),{capture:true,passive:true});
addEventListener('keydown',event=>{if(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' ','Escape'].includes(event.key))set('keyboard')},{capture:true});
set('pointer');
