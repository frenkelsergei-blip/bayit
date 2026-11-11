// Local extension registries (Modular Bayit, work package 2.1): upstream ships them empty, core registries join them,
// extra entries pass the same checks as core ones, and the public export never ships or overwrites them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {LOCAL_REGISTRIES,INSTALLED_FILE,emptyRegistry,localFiles,extensionReport} from '../app/scripts/local-registries.mjs';
import {FEATURES} from '../shared/features.mjs';
import {AI_PROVIDERS} from '../shared/ai-providers.mjs';
import {SPEECH_PROVIDERS,speechNames} from '../app/cloud/speech.mjs';
import {STATEMENT_FORMATS} from '../shared/finance-parse.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..'),src=p=>readFileSync(join(root,p),'utf8');
const scratch=mkdtempSync(join(tmpdir(),'bayit-extensions-'));
process.on('exit',()=>rmSync(scratch,{recursive:true,force:true}));
let copies=0;
// A fresh copy of the registry code with one local file replaced; each copy has its own path, so its own modules.
function copyWith(file,code){
 const dir=join(scratch,'copy-'+(++copies));
 cpSync(join(root,'shared'),join(dir,'shared'),{recursive:true});
 for(const f of ['speech.mjs','speech-household-ai.mjs','ai-providers.mjs','ai-usage.mjs','outbound.mjs','util.mjs','credential-keys.mjs','extensions/speech.mjs'])cpSync(join(root,'app/cloud',f),join(dir,'app/cloud',f));
 if(file){mkdirSync(dirname(join(dir,file)),{recursive:true});writeFileSync(join(dir,file),code)}
 return dir;
}
const load=(dir,module)=>import(pathToFileURL(join(dir,module)).href);
const withExtra=(file,name,entries,module)=>load(copyWith(file,'export const '+name+'=['+entries+'];\n'),module);

// A person's copy with extensions installed keeps its own local entries; upstream (installed.json is []) ships them empty.
const withExtensions=JSON.parse(src(INSTALLED_FILE)).length>0&&'this copy has extensions installed (shared/extensions/installed.json)';
test('local registry files exist and ship empty in the source tree',{skip:withExtensions},()=>{
 for(const r of LOCAL_REGISTRIES.filter(r=>!r.optional))assert.equal(src(r.file),emptyRegistry(r),r.file+' must be exactly the empty template');
 assert.deepEqual(JSON.parse(src(INSTALLED_FILE)),[]);
 for(const f of localFiles(root))assert.ok(f.exists&&f.empty,f.file+' must be empty upstream');
});

test('with empty local files the registries are exactly the core ones',{skip:withExtensions},()=>{
 assert.deepEqual(AI_PROVIDERS.map(p=>p.id),['anthropic','openai','gemini','xai','custom']);
 assert.deepEqual(SPEECH_PROVIDERS,['off','cloudflare','household-ai']);assert.deepEqual(speechNames(),{});
 assert.deepEqual(STATEMENT_FORMATS,['leumi','max']);
 assert.equal(FEATURES.length,17);
});

const feature=extra=>`{id:'weather',group:'everyday',icon:'CloudSun',defaultOn:false,en:'Weather',he:'מזג אוויר',description:{en:'Today’s weather.',he:'מזג האוויר היום.'},routes:['weather'],widgets:['weather'],${extra||''}}`;
test('an extra feature is picked up by every lookup',async()=>{
 const m=await withExtra('shared/extensions/features.mjs','EXTRA_FEATURES',feature(),'shared/features.mjs');
 assert.equal(m.FEATURES.at(-1).id,'weather');assert.ok(m.FEATURE_IDS.includes('weather'));
 assert.equal(m.routeFeature('weather'),'weather');assert.equal(m.widgetFeature('weather'),'weather');
 assert.equal(m.featureDefaults().weather,false);m.validateFeatures({weather:true});
 assert.equal(m.routeAllowed(m.featureContext({features:{weather:false}},'mom','parent'),'weather'),false);
});
test('an invalid extra feature fails loudly when the registry loads',async()=>{
 const reject=(entries,pattern)=>assert.rejects(withExtra('shared/extensions/features.mjs','EXTRA_FEATURES',entries,'shared/features.mjs'),pattern);
 await reject(feature().replace(`he:'מזג אוויר',`,''),/Bayit feature "weather": needs an icon and English and Hebrew/);
 await reject(feature().replace(`widgets:['weather']`,`widgets:['tasks']`),/widgets "tasks" already belongs to "tasks"/);
 await reject(feature().replace(`routes:['weather']`,`routes:['settings']`),/neutral core route/);
 await reject(feature().replace(`id:'weather'`,`id:'tasks'`),/"tasks": this id is already registered/);
 await reject(feature().replace(`group:'everyday'`,`group:'garden'`),/group must be one of/);
 await assert.rejects(load(copyWith('shared/extensions/features.mjs','export const EXTRA_FEATURES={};\n'),'shared/features.mjs'),/must export an array/);
});

const provider=`{id:'mistral',name:'Mistral',company:'Mistral AI',format:'chat',base:'https://api.mistral.ai/v1',keyHint:'API key',keysUrl:'https://console.mistral.ai/api-keys',billingUrl:''}`;
test('an extra AI provider is offered, and an invalid one is rejected',async()=>{
 const m=await withExtra('shared/extensions/ai-providers.mjs','EXTRA_AI_PROVIDERS',provider,'shared/ai-providers.mjs');
 assert.equal(m.AI_PROVIDER.mistral.base,'https://api.mistral.ai/v1');assert.equal(m.providerName('mistral'),'Mistral');
 const reject=(entries,pattern)=>assert.rejects(withExtra('shared/extensions/ai-providers.mjs','EXTRA_AI_PROVIDERS',entries,'shared/ai-providers.mjs'),pattern);
 await reject(provider.replace('https://api.mistral.ai','http://api.mistral.ai'),/Bayit AI provider "mistral": base must be an https address/);
 await reject(provider.replace(`format:'chat'`,`format:'soap'`),/format must be one of/);
 await reject(provider.replace(`base:'https://api.mistral.ai/v1'`,`base:''`),/base must be an https address/);
 await reject(provider.replace(`id:'mistral'`,`id:'openai'`),/already registered/);
});

const speech=`{id:'test-whisper',name:{en:'Test speech',he:'דיבור לבדיקה'},cost:{en:'Free in tests.',he:'חינם בבדיקות.'},available:env=>!!env.TEST_SPEECH,transcribe:async(env,bytes,{language})=>' heard '+bytes.length+' '+language+' '}`;
test('an extra speech provider can be chosen and transcribes, and an invalid one is rejected',async()=>{
 const m=await withExtra('app/cloud/extensions/speech.mjs','EXTRA_SPEECH',speech,'app/cloud/speech.mjs');
 assert.deepEqual(m.SPEECH_PROVIDERS,['off','cloudflare','household-ai','test-whisper']);
 assert.equal(m.speechAvailability({TEST_SPEECH:'1'})['test-whisper'],true);assert.equal(m.speechAvailability({})['test-whisper'],false);
 assert.equal(await m.transcribe({TEST_SPEECH:'1'},'test-whisper',new Uint8Array(3),{language:'he'}),'heard 3 he');
 await assert.rejects(m.transcribe({},'test-whisper',new Uint8Array(3)),e=>e.status===409,'an unavailable provider is refused');
 assert.deepEqual(m.speechNames(),{'test-whisper':{en:'Test speech',he:'דיבור לבדיקה'}});
 const failing=await withExtra('app/cloud/extensions/speech.mjs','EXTRA_SPEECH',speech.replace(/transcribe:.*\}$/,`transcribe:async()=>{throw Error('secret detail')}}`),'app/cloud/speech.mjs');
 await assert.rejects(failing.transcribe({TEST_SPEECH:'1'},'test-whisper',new Uint8Array(1)),e=>e.status===502&&!/secret/.test(e.message));
 await assert.rejects(withExtra('app/cloud/extensions/speech.mjs','EXTRA_SPEECH',speech.replace(/,transcribe:.*\}$/,'}'),'app/cloud/speech.mjs'),/Bayit speech provider "test-whisper": needs name/);
 await assert.rejects(withExtra('app/cloud/extensions/speech.mjs','EXTRA_SPEECH',`{id:'cloudflare',name:{en:'x',he:'x'},cost:{en:'x',he:'x'},available:()=>true,transcribe:()=>''}`,'app/cloud/speech.mjs'),/already registered/);
});

const format=`{id:'testbank',name:'Test Bank',detect:rows=>rows.some(r=>r.text.includes('TESTBANK STATEMENT')),parse:rows=>({issuer:'testbank',kind:'bank',account:'1',period:{from:'',to:''},transactions:[],checks:[]})}`;
test('an extra statement format is detected after the built-in ones, and an invalid one is rejected',async()=>{
 const m=await withExtra('shared/extensions/statement-formats.mjs','EXTRA_STATEMENT_FORMATS',format,'shared/finance-parse.mjs');
 const rows=[{text:'TESTBANK STATEMENT',items:[{s:'TESTBANK STATEMENT',x:0}]}];
 assert.deepEqual(m.STATEMENT_FORMATS,['leumi','max','testbank']);
 assert.equal(m.detectFormat(rows),'testbank');assert.equal(m.parseStatement(rows).issuer,'testbank');
 assert.equal(m.detectFormat([{text:'max.co.il TESTBANK STATEMENT',items:[]}]),'max','built-in formats win');
 assert.throws(()=>m.parseStatement([{text:'unknown',items:[]}]),e=>e.status===422);
 await assert.rejects(withExtra('shared/extensions/statement-formats.mjs','EXTRA_STATEMENT_FORMATS',format.replace(/,parse:.*\}$/,'}'),'shared/finance-parse.mjs'),/Bayit statement format "testbank": needs a name/);
});

test('bayit-doctor reports entries missing from installed.json and records whose entries are missing',async()=>{
 assert.deepEqual((await extensionReport(root)).problems,[]);
 const dir=copyWith('shared/extensions/features.mjs','export const EXTRA_FEATURES=['+feature()+'];\n');
 assert.match((await extensionReport(dir)).problems.join('\n'),/features entry "weather" is not recorded/);
 writeFileSync(join(dir,INSTALLED_FILE),JSON.stringify([{id:'weather',version:'1.0.0',entries:{features:['weather'],speech:['test-whisper']},files:['shared/extensions/weather.mjs']}]));
 const report=(await extensionReport(dir)).problems.join('\n');
 assert.doesNotMatch(report,/"weather" is not recorded/);
 assert.match(report,/its speech entry "test-whisper" is missing/);assert.match(report,/its file shared\/extensions\/weather\.mjs is missing/);
 assert.match(src('app/scripts/bayit-doctor.mjs'),/const ext=await extensionReport\(root\);/);
});

// The export script is private (work/ is not published); the public copy skips the script checks.
test('the public export ships local files empty and never overwrites a copy that has entries',{skip:!existsSync(join(root,'work/export-public.sh'))&&'work/export-public.sh is private'},()=>{
 const script=src('work/export-public.sh'),cli=join(root,'app/scripts/local-registries.mjs');
 assert.match(script,/local-registries\.mjs" private-paths "\$SRC"/);
 assert.match(script,/rsync -a --delete --exclude-from "\$\(private_for app\)"/);
 assert.match(script,/for dir in shared server design-system; do rsync -a --delete --exclude-from "\$\(private_for "\$dir"\)"/);
 assert.match(script,/rsync -a --delete --exclude-from "\$\(private_for tests\)"/);
 assert.match(script,/local-registries\.mjs" ensure-empty "\$DST"/);
 // Private paths: every local file plus the files installed extensions added.
 const dir=copyWith(INSTALLED_FILE,JSON.stringify([{id:'weather',entries:{},files:['shared/extensions/weather.mjs','tests/weather.test.mjs']}]));
 const paths=execFileSync(process.execPath,[cli,'private-paths',dir]).toString().trim().split('\n');
 for(const r of LOCAL_REGISTRIES)assert.ok(paths.includes(r.file),r.file);
 assert.ok(paths.includes(INSTALLED_FILE)&&paths.includes('shared/extensions/weather.mjs')&&paths.includes('tests/weather.test.mjs'));
 // A fresh public copy gets the empty templates.
 const copy=join(scratch,'public-copy');mkdirSync(copy);
 execFileSync(process.execPath,[cli,'ensure-empty',copy]);
 for(const r of LOCAL_REGISTRIES.filter(r=>!r.optional))assert.equal(readFileSync(join(copy,r.file),'utf8'),emptyRegistry(r));
 assert.deepEqual(JSON.parse(readFileSync(join(copy,INSTALLED_FILE),'utf8')),[]);
 // A copy whose local file has entries is left untouched and the export stops.
 const full='export const EXTRA_FEATURES=['+feature()+'];\n';writeFileSync(join(copy,'shared/extensions/features.mjs'),full);
 assert.throws(()=>execFileSync(process.execPath,[cli,'ensure-empty',copy],{stdio:'pipe'}),e=>/Not overwriting them/.test(e.stderr.toString()));
 assert.equal(readFileSync(join(copy,'shared/extensions/features.mjs'),'utf8'),full);
 assert.ok(existsSync(join(copy,'app/cloud/extensions/speech.mjs')));
});
