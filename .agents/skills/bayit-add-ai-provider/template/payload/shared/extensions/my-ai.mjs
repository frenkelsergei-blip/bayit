// AI provider "My AI" (extension my-ai, docs/extension-skills.md). Checked against the provider's official docs:
// base URL, auth header, model list and tool calling. format: 'chat' (OpenAI-compatible Chat Completions),
// 'responses' (OpenAI Responses API) or 'anthropic' (Anthropic Messages). The base is a fixed https address;
// its origin is listed in extension.json "outbound". The family's key stays in the encrypted household secrets.
export const MY_AI={
 id:'my-ai',
 name:'My AI',
 company:'My AI Inc.',
 format:'chat',
 base:'https://api.my-ai.example/v1',
 keyHint:'API key',
 keysUrl:'https://my-ai.example/keys',
 billingUrl:'',
};
