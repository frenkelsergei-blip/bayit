// Bayit on any machine: runs the same server code as Cloudflare Pages (app/cloud/worker.mjs) on Node.js,
// with a local SQLite database, a local file folder, static client files and a built-in reminder timer.
// Built by host/build-host.mjs into dist/host/server.mjs; see docs/self-hosting-docker.md.
import http from 'node:http';
import {Readable} from 'node:stream';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,stat,chmod} from 'node:fs/promises';
import {join,resolve,extname,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import worker from '../cloud/worker.mjs';
import {openD1,migrate} from './d1-sqlite.mjs';
import {openFileStore} from './file-store.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8080),HOST=process.env.HOST||'0.0.0.0';
const DATA=resolve(process.env.DATA_DIR||join(here,'data')),STATIC=resolve(process.env.STATIC_DIR||join(here,'public')),MIGRATIONS=resolve(process.env.MIGRATIONS_DIR||join(here,'migrations'));
const ORIGIN=process.env.BAYIT_ORIGIN?new URL(process.env.BAYIT_ORIGIN).origin:'';

// Installation secrets: taken from the environment, otherwise generated once and kept in the data folder.
async function installationSecrets(){
 const file=join(DATA,'secrets.json');let saved={};
 try{saved=JSON.parse(await readFile(file,'utf8'))}catch{}
 const want={AUTH_SECRET:()=>randomBytes(32).toString('base64url'),APP_ENCRYPTION_KEY:()=>randomBytes(32).toString('base64'),REMINDER_CRON_SECRET:()=>randomBytes(24).toString('base64url')};
 let changed=false;for(const [name,make]of Object.entries(want))if(!process.env[name]&&!saved[name]){saved[name]=make();changed=true}
 if(changed){await writeFile(file,JSON.stringify(saved,null,1));await chmod(file,0o600)}
 return Object.fromEntries(Object.keys(want).map(name=>[name,process.env[name]||saved[name]]));
}

await mkdir(join(DATA,'files'),{recursive:true});
const db=openD1(join(DATA,'bayit.sqlite')),applied=migrate(db,MIGRATIONS);
const secrets=await installationSecrets();
const pass=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','BAYIT_ORIGIN','HOME_TIMEZONE'];
const env={...Object.fromEntries(pass.filter(k=>process.env[k]).map(k=>[k,process.env[k]])),...secrets,DB:db,FILES:openFileStore(join(DATA,'files')),ASSETS:{fetch:serveStatic}};
// Test-only overrides; the server code accepts them for loopback addresses only.
for(const k of ['TELEGRAM_API_ORIGIN','AI_TEST_ORIGIN','SPEECH_TEST_ORIGIN','RISEUP_TEST_ORIGIN'])if(process.env[k])env[k]=process.env[k];
const ctx={waitUntil:p=>Promise.resolve(p).catch(e=>console.error('Bayit background task failed:',e?.message||e)),passThroughOnException(){}};

const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.webmanifest':'application/manifest+json','.txt':'text/plain; charset=utf-8','.mp4':'video/mp4','.webm':'video/webm'};
const SECURITY={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(self), geolocation=()'};
// Static client with single-page-app fallback, like Pages' not_found_handling.
async function serveStatic(request){
 const url=new URL(request.url);let path;try{path=decodeURIComponent(url.pathname)}catch{return new Response('Bad request',{status:400})}
 let file=resolve(STATIC,'.'+path);if(file!==STATIC&&!file.startsWith(STATIC+sep))return new Response('Not found',{status:404});
 let info=await stat(file).catch(()=>null);if(info?.isDirectory()){file=join(file,'index.html');info=await stat(file).catch(()=>null)}
 if(!info){if(extname(path)&&!path.endsWith('.html'))return new Response('Not found',{status:404,headers:SECURITY});file=join(STATIC,'index.html');info=await stat(file)}
 const headers={...SECURITY,'Content-Type':TYPES[extname(file).toLowerCase()]||'application/octet-stream','Content-Length':String(info.size),'Cache-Control':path.startsWith('/assets/')&&/-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(path)?'public, max-age=31536000, immutable':file.endsWith('.html')||path==='/version.json'?'no-cache':'public, max-age=3600'};
 return new Response(request.method==='HEAD'?null:Readable.toWeb(createReadStream(file)),{headers});
}

function toRequest(req){
 const base=ORIGIN||((req.headers['x-forwarded-proto']||'http').split(',')[0]+'://'+(req.headers['x-forwarded-host']||req.headers.host||'localhost'));
 const headers=new Headers();for(const [k,v]of Object.entries(req.headers)){if(k.startsWith(':'))continue;if(Array.isArray(v))v.forEach(x=>headers.append(k,x));else if(v!=null)headers.set(k,v)}
 const body=!['GET','HEAD'].includes(req.method);
 return new Request(new URL(req.url,base),{method:req.method,headers,body:body?Readable.toWeb(req):undefined,duplex:body?'half':undefined});
}
async function send(res,response,head){
 const headers={};response.headers.forEach((v,k)=>{if(k!=='set-cookie')headers[k]=v});const cookies=response.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;
 res.writeHead(response.status,headers);
 if(!response.body||head)return res.end();
 Readable.fromWeb(response.body).on('error',()=>res.destroy()).pipe(res);
}

const server=http.createServer(async(req,res)=>{
 try{const request=toRequest(req);await send(res,await worker.fetch(request,env,ctx),req.method==='HEAD')}
 catch(error){console.error('Bayit request failed:',error?.message||error);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'The server could not complete this request.'}))}
});
server.listen(PORT,HOST,()=>console.log('Bayit is running on http://'+(HOST==='0.0.0.0'?'localhost':HOST)+':'+PORT+(ORIGIN?' (public address '+ORIGIN+')':'')+'. Data: '+DATA+(applied.length?'. Applied migrations: '+applied.join(', '):'')+(env.GOOGLE_CLIENT_ID?'':'. Google sign-in is off until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.')));

// Built-in scheduler: the same once-a-minute tick the Cloudflare cron Worker sends (reminders, digests, daily RiseUp sync).
const tick=async()=>{try{const r=await worker.fetch(new Request(new URL('/api/internal/reminders',ORIGIN||'http://127.0.0.1:'+PORT),{method:'POST',headers:{Authorization:'Bearer '+env.REMINDER_CRON_SECRET}}),env,ctx);if(!r.ok)console.error('Bayit reminders: tick failed with',r.status)}catch(e){console.error('Bayit reminders:',e?.message||e)}};
const timer=setInterval(tick,60000);setTimeout(tick,5000);
const stop=()=>{clearInterval(timer);server.close(()=>{db.close();process.exit(0)});setTimeout(()=>process.exit(0),5000).unref()};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
