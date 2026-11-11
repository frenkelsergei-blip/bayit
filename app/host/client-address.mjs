// The client's address on the Docker host (passkey security review, finding 2). Cloudflare's edge sets CF-Connecting-IP
// itself; on Docker the server strips any CF-Connecting-IP / X-Forwarded-For a client sends and sets CF-Connecting-IP
// from the socket, so per-address rate limits count people separately and nobody can choose their own address.
// Behind a reverse proxy (Caddy, Cloudflare Tunnel, Tailscale) every socket is the proxy, so the forwarded address is
// used, but only when the socket is in BAYIT_TRUSTED_PROXIES (comma-separated addresses or IPv4 CIDR ranges):
// the right-most X-Forwarded-For hop that is not itself a trusted proxy. Only use proxies that OVERWRITE or APPEND
// X-Forwarded-For (Caddy 2 does); a proxy that passes the client's header through unchanged lets a client pick its
// address. Ranges are IPv4 CIDR only; IPv6 proxies are listed as exact addresses.
const v4=a=>{const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);if(!m)return null;const p=m.slice(1).map(Number);return p.every(x=>x<256)?((p[0]<<24)>>>0)+(p[1]<<16)+(p[2]<<8)+p[3]:null};
// An IPv4 literal, or an IPv6 literal made only of hex groups and colons (with an optional IPv4 tail).
export const isIP=a=>v4(a)!==null||(/^[0-9a-f:]+(:\d{1,3}(\.\d{1,3}){3})?$/.test(a)&&a.includes(':')&&a.length<=45&&(a.match(/::/g)||[]).length<=1);
export const normalizeAddress=a=>{a=String(a||'').trim().toLowerCase();if(a.startsWith('[')&&a.endsWith(']'))a=a.slice(1,-1);return a.startsWith('::ffff:')&&v4(a.slice(7))!==null?a.slice(7):a};
export function trustedProxies(list){
 const rules=String(list||'').split(/[\s,]+/).filter(Boolean).map(entry=>{
  const [base,bits]=entry.split('/'),n=v4(normalizeAddress(base));
  if(bits!==undefined&&n!==null&&+bits>=0&&+bits<=32){const mask=+bits===0?0:(~0<<(32-+bits))>>>0;return a=>{const x=v4(a);return x!==null&&((x&mask)>>>0)===((n&mask)>>>0)}}
  const exact=normalizeAddress(entry);return a=>a===exact;
 });
 return a=>rules.some(r=>r(normalizeAddress(a)));
}
export function clientAddress(socketAddress,forwardedFor,trusted){
 const socket=normalizeAddress(socketAddress)||'unknown';
 if(!trusted(socket))return socket;
 // Only well-formed IP literals count; anything else in the header means the socket is used (re-review R2).
 const hops=String(forwardedFor||'').split(',').map(normalizeAddress).filter(Boolean);
 for(let i=hops.length-1;i>=0;i--){if(!isIP(hops[i]))return socket;if(!trusted(hops[i]))return hops[i]}
 return socket;
}
