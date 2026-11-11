// Messaging channels (Modular Bayit work package 2.3). Telegram is the first registered channel; installed extensions
// add more in app/cloud/extensions/channels.mjs. The contract, what core guarantees and what a channel may never do
// are in docs/channel-contract.md; tests/channels.test.mjs runs tests/channel-conformance.mjs against every channel.
//
// A channel provides exactly these fields:
//  id, name {en, he}, feature (Features-registry id that gates delivery), apiPath '/api/<id>/', hookPath '/api/<id>/hook/',
//  api(request, env, user, home, path, url)   settings endpoints, reached only after core sign-in, origin and rate checks
//  webhook(request, env, hookId)              inbound, reached BEFORE sign-in: it verifies the request itself
//  delivery {targets, recipients, open, render, send, blocked, cleanup, prepare?, dueSnoozes?+snoozeSent?, correct?}
//                                             hooks for core's scheduled delivery (channel-delivery.mjs)
import {joinRegistry} from '../../shared/extension-registry.mjs';
import {FEATURES} from '../../shared/features.mjs';
import {TELEGRAM_CHANNEL} from './telegram.mjs';
import {deliverChannels} from './channel-delivery.mjs';
import {EXTRA_CHANNELS} from './extensions/channels.mjs';

export const CHANNEL_FIELDS=['id','name','feature','apiPath','hookPath','api','webhook','delivery'];
export const DELIVERY_HOOKS=['targets','recipients','open','render','send','blocked','cleanup'];
export const OPTIONAL_DELIVERY_HOOKS=['prepare','dueSnoozes','snoozeSent','correct'];
// Core's own /api/ areas (worker.mjs). A channel's paths may never fall inside one of them; tests/channels.test.mjs
// checks this list against worker.mjs.
export const RESERVED_API=['ai','ai-history','ai-usage','auth','bayit-ai','channels','config','documents','family','files','finance','google-calendar','health','home-suggestions','households','insurance','internal','kids-parent','maps','message-plan','passkeys','push','registration','security','session','voice','vouchers'];
export function channelProblem(c){
 const extra=Object.keys(c).filter(k=>!CHANNEL_FIELDS.includes(k));
 if(extra.length)return 'may not carry '+extra.join(', ')+'. Access rules, delivery records and the scheduler stay in core.';
 if(RESERVED_API.includes(c.id))return 'this id is one of core’s own /api/ areas.';
 if(typeof c.name?.en!=='string'||!c.name.en||typeof c.name?.he!=='string'||!c.name.he)return 'needs name {en, he}.';
 if(!FEATURES.some(f=>f.id===c.feature))return 'feature must be a registered feature id.';
 if(c.apiPath!=='/api/'+c.id+'/'||c.hookPath!==c.apiPath+'hook/')return "apiPath must be '/api/"+c.id+"/' and hookPath '/api/"+c.id+"/hook/'.";
 if(typeof c.api!=='function'||typeof c.webhook!=='function')return 'needs api(request, env, user, home, path, url) and webhook(request, env, hookId).';
 const d=c.delivery;if(!d||typeof d!=='object')return 'needs delivery hooks.';
 const unknown=Object.keys(d).filter(k=>!DELIVERY_HOOKS.includes(k)&&!OPTIONAL_DELIVERY_HOOKS.includes(k));if(unknown.length)return 'delivery may not carry '+unknown.join(', ')+'.';
 const missing=DELIVERY_HOOKS.filter(k=>typeof d[k]!=='function');if(missing.length)return 'delivery needs '+missing.join(', ')+'.';
 for(const k of OPTIONAL_DELIVERY_HOOKS)if(k in d&&typeof d[k]!=='function')return 'delivery.'+k+' must be a function.';
 if(!d.dueSnoozes!==!d.snoozeSent)return 'delivery needs both dueSnoozes and snoozeSent, or neither.';
 return '';
}
export const CHANNELS=joinRegistry('channel',[TELEGRAM_CHANNEL],EXTRA_CHANNELS,channelProblem);
export const channelById=id=>CHANNELS.find(c=>c.id===id)||null;
// worker.mjs routing: the inbound webhook (before sign-in) and the settings endpoints (after it).
export const channelForHook=path=>CHANNELS.find(c=>path.startsWith(c.hookPath))||null;
export const channelForAPI=path=>CHANNELS.find(c=>path.startsWith(c.apiPath))||null;
// The scheduler's delivery step: every channel, core first.
export const deliverChannelReminders=(env,now,options)=>deliverChannels(env,now,CHANNELS,options);
