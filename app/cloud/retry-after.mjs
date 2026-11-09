// Retry-After accepts delta seconds or an IMF-fixdate. Bound untrusted provider input.
export function retryAfterDelay(value,now=Date.now()){
 const text=String(value??'').trim();let delay;
 if(/^\d+$/.test(text))delay=Number(text)*1000;
 else if(/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text)){const stamp=Date.parse(text);if(Number.isFinite(stamp)&&new Date(stamp).toUTCString()===text)delay=stamp-now}
 if(!Number.isFinite(delay))return null;
 return Math.min(7*86400000,Math.max(1000,delay));
}
