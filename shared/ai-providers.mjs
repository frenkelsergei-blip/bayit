// AI providers a household can choose in Settings → AI. Shared by the server adapters and the settings UI.
// format: "anthropic" = Anthropic Messages API, "responses" = OpenAI Responses API (needed for Codex models),
// billingUrl: where a parent checks the real credit balance (Bayit can only estimate its own spend).
// "chat" = OpenAI-compatible Chat Completions (Gemini, Grok, OpenRouter, Ollama, LM Studio, ...).
// Installed extensions add providers in shared/extensions/ai-providers.mjs; they pass the same checks as core ones.
import {joinRegistry} from './extension-registry.mjs';
import {EXTRA_AI_PROVIDERS} from './extensions/ai-providers.mjs';

const CORE_AI_PROVIDERS=[
 {id:'anthropic',name:'Claude',company:'Anthropic',format:'anthropic',base:'https://api.anthropic.com/v1',keyHint:'sk-ant-…',keysUrl:'https://console.anthropic.com/settings/keys',billingUrl:'https://platform.claude.com/settings/billing'},
 {id:'openai',name:'OpenAI',company:'GPT · Codex',format:'responses',base:'https://api.openai.com/v1',keyHint:'sk-…',keysUrl:'https://platform.openai.com/api-keys',billingUrl:'https://platform.openai.com/settings/organization/billing/overview'},
 {id:'gemini',name:'Gemini',company:'Google',format:'chat',base:'https://generativelanguage.googleapis.com/v1beta/openai',keyHint:'AIza…',keysUrl:'https://aistudio.google.com/apikey',billingUrl:'https://aistudio.google.com/usage'},
 {id:'xai',name:'Grok',company:'xAI',format:'chat',base:'https://api.x.ai/v1',keyHint:'xai-…',keysUrl:'https://console.x.ai/',billingUrl:'https://console.x.ai/'},
 {id:'custom',name:'Custom',company:'OpenAI-compatible',format:'chat',base:'',keyHint:'API key',keysUrl:'',billingUrl:''}
];
export const AI_FORMATS=['anthropic','responses','chat'];
const https=v=>typeof v==='string'&&/^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(v),optionalHttps=v=>v===''||https(v);
function providerProblem(p){
 if(!AI_FORMATS.includes(p.format))return 'format must be one of '+AI_FORMATS.join(', ')+'.';
 if(typeof p.name!=='string'||!p.name.trim()||typeof p.company!=='string'||typeof p.keyHint!=='string'||!p.keyHint.trim())return 'needs a name, company and keyHint.';
 // Only the built-in "custom" provider takes its address from the family; every other one has a fixed https base.
 if(p.id==='custom'?p.base!=='':!https(p.base))return 'base must be an https address without a query.';
 if(!optionalHttps(p.keysUrl)||!optionalHttps(p.billingUrl))return 'keysUrl and billingUrl must be https addresses or empty.';
 return '';
}
// Core providers first, then the ones installed extensions add.
export const AI_PROVIDERS=joinRegistry('AI provider',CORE_AI_PROVIDERS,EXTRA_AI_PROVIDERS,providerProblem);
export const AI_PROVIDER=Object.fromEntries(AI_PROVIDERS.map(p=>[p.id,p]));
export const providerName=id=>AI_PROVIDER[id]?.name||'AI';
