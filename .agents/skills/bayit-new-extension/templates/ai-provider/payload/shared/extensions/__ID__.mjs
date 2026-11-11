// AI provider "__NAME_EN__" (extension __ID__, docs/extension-skills.md). Every value comes from the provider's
// CURRENT official docs: base URL, auth header, model list and tool calling. Don't guess.
// format: 'chat' (OpenAI-compatible Chat Completions), 'responses' (OpenAI Responses API) or 'anthropic' (Anthropic
// Messages). Any other wire format is a core change, not an extension.
// The family's key is pasted by a parent in the AI window and stays in the encrypted household secrets: never here.
export const __EXPORT__={
 id:'__ID__',
 name:'__NAME_EN__',
 company:'__NAME_EN__', // TODO(bayit): the company that runs it, as shown under the name in the AI window
 format:'chat', // TODO(bayit): 'chat', 'responses' or 'anthropic', from the provider's docs
 base:'https://api.__ID__.invalid/v1', // TODO(bayit): the documented https API base; put its origin in extension.json "outbound"
 keyHint:'API key', // TODO(bayit): how the key starts, e.g. 'sk-…', so a parent recognises it
 keysUrl:'', // TODO(bayit): https page where a parent creates a key, or ''
 billingUrl:'', // TODO(bayit): https page with the real credit balance, or ''
};
