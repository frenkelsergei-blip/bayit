// Household dates read the same way as the rest of the app (full audit 06): "Nov 10, 2026" / "10 בנוב׳ 2026".
// Anything that is not a plain ISO day (YYYY-MM-DD) is shown unchanged; unknown dates stay unknown.
export function householdDate(a,iso,{weekday=false}={}){
 if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return iso;
 const d=new Date(iso+'T12:00:00Z');if(Number.isNaN(d.getTime()))return iso;
 return d.toLocaleDateString(a.lang==='he'?'he-IL':'en-US',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric',...(weekday?{weekday:'short'}:{})});
}
