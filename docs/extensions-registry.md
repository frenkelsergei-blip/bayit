# How extensions register

Bayit's core keeps its registries. An extension adds new files plus **one line in a local registry file**. Upstream Bayit ships every local file empty and never edits it, so updating Bayit never conflicts with the extensions you installed.

## The files

| Seam | Local file (ships empty) | Joined into |
|---|---|---|
| Features | `shared/extensions/features.mjs` → `EXTRA_FEATURES` | `FEATURES` in `shared/features.mjs` |
| AI providers | `shared/extensions/ai-providers.mjs` → `EXTRA_AI_PROVIDERS` | `AI_PROVIDERS` in `shared/ai-providers.mjs` |
| Speech-to-text | `app/cloud/extensions/speech.mjs` → `EXTRA_SPEECH` | `SPEECH_PROVIDERS`, `transcribe()` in `app/cloud/speech.mjs` |
| Sign-in methods | `app/cloud/extensions/signin.mjs` → `EXTRA_SIGNIN` | `SIGNIN_METHODS` in `app/cloud/signin-methods.mjs` (contract: `docs/sign-in-methods.md`) |
| Statement formats | `shared/extensions/statement-formats.mjs` → `EXTRA_STATEMENT_FORMATS` | `detectFormat()`, `parseStatement()` in `shared/finance-parse.mjs` |
| Install record | `shared/extensions/installed.json` → `[]` | read by `bayit-doctor` |

The connections seam (`shared/extensions/connections.mjs`) follows the same rule.

## The rule

1. Core entries come first, then the local ones. An extension never replaces a core entry: ids must be new, and built-in statement formats are recognised before extra ones.
2. Every extra entry passes the same check as the core entries (`shared/extension-registry.mjs`). A bad entry throws when the registry loads, so the tests and the app's start fail with a message naming the seam and the id. Nothing is skipped quietly.
3. Features: each route, widget, Statistics tab, Telegram command, AI tool or action, reminder kind and notification category belongs to exactly one feature, and a route may not be a neutral core route. `tests/features.test.mjs` keeps checking that everything in the app is mapped.
4. Record every installed extension in `installed.json`:
   ```json
   [{"id":"weather","version":"1.0.0","entries":{"features":["weather"]},"files":["shared/extensions/weather.mjs"]}]
   ```
   `node app/scripts/bayit-extension.mjs apply <package>` writes the line and this record for you (package format: `docs/extension-skills.md`). `node app/scripts/bayit-doctor.mjs` lists them and reports a registry entry that is not recorded, or a recorded entry or file that is missing.
5. Local files and the files listed in `installed.json` are private to your installation. The public export (`work/export-public.sh`) never copies them, ships the local files empty, and stops instead of overwriting a copy whose local files have entries.

## One example line per seam

```js
// shared/extensions/features.mjs
import {WEATHER} from './weather.mjs';
export const EXTRA_FEATURES=[WEATHER];
// WEATHER = {id:'weather',group:'everyday',icon:'CloudSun',defaultOn:false,en:'Weather',he:'מזג אוויר',
//   description:{en:'Today’s weather.',he:'מזג האוויר היום.'},routes:['weather'],widgets:['weather']}

// shared/extensions/ai-providers.mjs
export const EXTRA_AI_PROVIDERS=[{id:'mistral',name:'Mistral',company:'Mistral AI',format:'chat',base:'https://api.mistral.ai/v1',keyHint:'API key',keysUrl:'https://console.mistral.ai/api-keys',billingUrl:''}];

// app/cloud/extensions/speech.mjs
import {OPENAI_SPEECH} from './openai-speech.mjs';
export const EXTRA_SPEECH=[OPENAI_SPEECH];
// OPENAI_SPEECH = {id:'openai-speech',name:{en:'OpenAI',he:'OpenAI'},cost:{en:'…',he:'…'},available:(env,household)=>({ok,reason}),transcribe:async(env,bytes,{language,mimeType,household})=>text}

// shared/extensions/statement-formats.mjs
import {TESTBANK} from './testbank.mjs';
export const EXTRA_STATEMENT_FORMATS=[TESTBANK];
// TESTBANK = {id:'testbank',name:'Test Bank',detect:rows=>boolean,parse:rows=>({issuer,kind:'bank'|'card',…,checks})}
```

Field rules: AI providers use `format` `anthropic`, `responses` or `chat` and a fixed `https` base; speech providers follow the contract at the top of `app/cloud/speech.mjs` (`name` and `cost` in Hebrew and English, `available(env, household)` returning a boolean or `{ok, reason}`, optional `check`, `transcribe(env, bytes, {language, mimeType, household})`), go through `outbound.mjs`, record billed tokens in the AI usage ledger, pass `tests/speech-providers.test.mjs`, and their errors reach the family only as "could not be transcribed"; statement parsers return the same shape as `parseLeumi` (bank) or `parseMax` (card), with their own reconciliation checks. `tests/extensions.test.mjs` shows a working and a rejected entry for each seam.
