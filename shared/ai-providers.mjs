// AI providers a household can choose in Settings → AI. Shared by the server adapters and the settings UI.
// format: "anthropic" = Anthropic Messages API, "responses" = OpenAI Responses API (needed for Codex models),
// "chat" = OpenAI-compatible Chat Completions (Gemini, Grok, OpenRouter, Ollama, LM Studio, ...).
export const AI_PROVIDERS=[
 {id:'anthropic',name:'Claude',company:'Anthropic',format:'anthropic',base:'https://api.anthropic.com/v1',keyHint:'sk-ant-…',keysUrl:'https://console.anthropic.com/settings/keys'},
 {id:'openai',name:'OpenAI',company:'GPT · Codex',format:'responses',base:'https://api.openai.com/v1',keyHint:'sk-…',keysUrl:'https://platform.openai.com/api-keys'},
 {id:'gemini',name:'Gemini',company:'Google',format:'chat',base:'https://generativelanguage.googleapis.com/v1beta/openai',keyHint:'AIza…',keysUrl:'https://aistudio.google.com/apikey'},
 {id:'xai',name:'Grok',company:'xAI',format:'chat',base:'https://api.x.ai/v1',keyHint:'xai-…',keysUrl:'https://console.x.ai/'},
 {id:'custom',name:'Custom',company:'OpenAI-compatible',format:'chat',base:'',keyHint:'API key',keysUrl:''}
];
export const AI_PROVIDER=Object.fromEntries(AI_PROVIDERS.map(p=>[p.id,p]));
export const providerName=id=>AI_PROVIDER[id]?.name||'AI';
