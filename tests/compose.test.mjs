// compose.yaml must give Docker a valid configuration. Found in the 2026-11-11 install trial: `tmpfs: [/tmp:size=32m,mode=1777]`
// is a YAML flow list, so the comma split it into two entries and every `docker compose up` failed with
// "invalid mount path: 'mode=1777'". With Docker Compose available the test asks Compose itself; otherwise it reads the file
// with YAML's flow-list rule (a comma outside quotes starts a new entry).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const root=new URL('../',import.meta.url).pathname;
const text=readFileSync(new URL('../compose.yaml',import.meta.url),'utf8');

// The value of `tmpfs:` under the `bayit:` service, as a list of strings, by YAML's rules for the forms used here.
export function tmpfsEntries(source){
 const lines=source.split('\n');let inBayit=false,indent=-1;
 for(let i=0;i<lines.length;i++){
  const line=lines[i],m=/^(\s*)([A-Za-z_-]+):(.*)$/.exec(line);if(!m)continue;
  const level=m[1].length;
  if(m[2]==='bayit'&&level===2){inBayit=true;indent=level;continue}
  if(inBayit&&level<=indent)inBayit=false;
  if(!inBayit||m[2]!=='tmpfs')continue;
  const rest=m[3].replace(/\s+#.*$/,'').trim();
  if(rest.startsWith('[')){
   const inner=rest.slice(1,rest.lastIndexOf(']'));const out=[];let cur='',quote='';
   for(const c of inner){if(quote){if(c===quote)quote='';else cur+=c}else if(c==='"'||c==="'")quote=c;else if(c===','){out.push(cur.trim());cur=''}else cur+=c}
   if(cur.trim())out.push(cur.trim());return out;
  }
  if(rest)return [rest.replace(/^["']|["']$/g,'')];
  const out=[];for(let j=i+1;j<lines.length;j++){const item=/^\s*-\s*(.+)$/.exec(lines[j]);if(!item)break;out.push(item[1].trim().replace(/^["']|["']$/g,''))}
  return out;
 }
 return null;
}

const oneTmpMount=list=>{
 assert.ok(Array.isArray(list),'the bayit service has a tmpfs entry');
 assert.equal(list.length,1,'exactly one tmpfs mount, got '+JSON.stringify(list));
 assert.match(list[0],/^\/tmp:/,'the mount is /tmp');
 assert.match(list[0],/size=32m/);assert.match(list[0],/mode=1777/);
};

test('the YAML reader follows the flow-list comma rule (the 2026-11-11 bug is caught)',()=>{
 const broken='services:\n  bayit:\n    tmpfs: [/tmp:size=32m,mode=1777]\n';
 assert.deepEqual(tmpfsEntries(broken),['/tmp:size=32m','mode=1777']);
 assert.throws(()=>oneTmpMount(tmpfsEntries(broken)));
 assert.deepEqual(tmpfsEntries('services:\n  bayit:\n    tmpfs:\n      - "/tmp:size=1m,mode=1777"\n'),['/tmp:size=1m,mode=1777']);
});

test('compose.yaml: the bayit service has one /tmp tmpfs mount with both options (file)',()=>{oneTmpMount(tmpfsEntries(text))});

const compose=spawnSync('docker',['compose','version'],{encoding:'utf8',timeout:15000});
test('compose.yaml: Docker Compose accepts it and sees one tmpfs mount',{skip:compose.status!==0?'Docker Compose is not available here':false},()=>{
 const r=spawnSync('docker',['compose','-f','compose.yaml','--profile','https','config','--format','json'],{cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,COMPOSE_PROJECT_NAME:'bayit-compose-check'}});
 assert.equal(r.status,0,'docker compose config failed: '+(r.stderr||r.error?.message));
 const config=JSON.parse(r.stdout);
 oneTmpMount(config.services.bayit.tmpfs);
 assert.ok(config.services.caddy,'the https profile keeps its caddy service');
});
