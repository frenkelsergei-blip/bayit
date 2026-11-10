import {effectiveAudience} from './record-audience.mjs';
import {assignTaskPeople} from './task-assignment.mjs';
import {normalizeReminders,validateReminderList} from './item-reminders.mjs';

export const calendarDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
 Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export const clockTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const text = (value,max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
// Features registry: a plan is an AI feature; its events need Calendar and its tasks need Tasks.
export const MESSAGE_PLAN_KIND_FEATURE = {event:'calendar',task:'tasks'};
export const messagePlanKinds = on => ['event','task'].filter(kind => on(MESSAGE_PLAN_KIND_FEATURE[kind]));
export const messagePlanAvailable = on => on('ai') && messagePlanKinds(on).length > 0;
export const messageDraftTool = {name:'extract_household_plan',description:'Draft a named plan with events, tasks and reminders for human review.',
 input_schema:{type:'object',properties:{title:{type:'string'},items:{type:'array',items:{type:'object',properties:{
  kind:{type:'string',enum:['event','task']},title:{type:'string'},date:{type:'string'},time:{type:'string'},note:{type:'string'},
  allDay:{type:'boolean'},reminderRequested:{type:'boolean'},reminders:{type:'array',items:{type:'integer'}}
 },required:['kind','title']}}},required:['items']}};

export function normalizeMessageDraft(value) {
 if (!Array.isArray(value?.items)) throw Error('Invalid message draft.');
 const items = value.items.slice(0,12).flatMap(item => {
  if (!['event','task'].includes(item?.kind) || !text(item.title,160)) return [];
  const date = calendarDate(item.date)?item.date:'';
  const allDay = item.kind==='event' && item.allDay===true;
  const time = !allDay && clockTime(item.time)?item.time:'';
  const reminderRequested = item.reminderRequested===true;
  const reminders = reminderRequested && date && (time || item.kind==='task' || allDay)
   ? normalizeReminders(item.reminders,{allDay:!time}) : [];
  return [{kind:item.kind,title:text(item.title,160),date,time,allDay,note:text(item.note,800),reminderRequested,reminders}];
 });
 return {title:text(value.title,120),items};
}

export const messagePlanId = id => 'intake-'+id;

export function messagePlanReceipt(body,ownerId,prepared) {
 return {
  id:messagePlanId(body.id),ownerId,scope:'private',status:'intake',title:text(body.title,120)||text(prepared[0].record.title,120),
  items:prepared.map(({collection,record})=>({collection,id:record.id})),appliedAt:new Date().toISOString()
 };
}

export function prepareMessagePlan(body, actor, members) {
 if (!/^[a-f0-9-]{36}$/.test(body?.id || '') || !Array.isArray(body.items) || !body.items.length || body.items.length > 12) throw Error('Choose up to twelve draft items.');
 return body.items.map((item,index) => {
  const title = text(item?.title,160), event = item?.kind === 'event', date = item?.date || '', time = item?.time || '';
  if (!title || !['event','task'].includes(item?.kind) || ((event || date) && !calendarDate(date)) || (time && (!date || !clockTime(time))) || (event && !time && item.allDay !== true)) {
   throw Error('Review each title, date and time. For an event without a time, choose All day.');
  }
  const assignees = Array.isArray(item.assignees) ? [...new Set(item.assignees)] : [];
  if (assignees.some(id => !members.some(member => member.id === id)) || (actor.role === 'child' && !event && assignees.some(id => id !== actor.id))) throw Error('Choose permitted household members.');
  const ownerId = actor.id, visibility = item.visibility === 'family' ? 'family' : 'private';
  const audience = effectiveAudience({ownerId,visibility},assignees);
  const note = text(item.note,800);
  const record = {id:messagePlanId(body.id)+'-'+index,ownerId,title,he:title,date,time:event && item.allDay === true?'':time,note,noteHe:note,
   visibility:audience.visibility,allowedIds:audience.allowedIds,repeat:'once'};
  if (item.reminders != null) {
   validateReminderList(item.reminders);
   if (item.reminders.length && (!date || (record.time && item.reminders.some(n=>n<0)))) throw Error('Choose a date and a valid reminder time.');
   record.reminders = item.reminders;
  }
  if (event) Object.assign(record,{memberIds:assignees,durationMinutes:60,color:'lilac',editPolicy:'owner',editorIds:[]});
  else {record.done=false;if (assignees.length) assignTaskPeople(record,assignees);}
  return {collection:event?'events':'tasks',record};
 });
}
