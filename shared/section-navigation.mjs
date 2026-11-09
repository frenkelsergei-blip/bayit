// Inner tabs share a page: keep their menu, scroll position and focus stable.
export const sectionRoot=route=>String(route||'today').replace(/^#/,'').split(/[/?]/)[0]||'today';
export function resetSectionScroll(previous,next){
 if(sectionRoot(previous)!==sectionRoot(next))return true;
 return [previous,next].some(route=>/\/(new|edit)(?:[?]|$)/.test(String(route||'')));
}
