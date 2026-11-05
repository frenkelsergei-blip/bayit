// Birthdays: stored on the profile, shown in the family calendar as a yearly event when the person chooses.
export const birthdayEventId=memberId=>'birthday-'+memberId;
export function ageOn(birthday,date){if(!/^\d{4}-\d{2}-\d{2}$/.test(birthday||''))return null;const [y,m,d]=birthday.split('-').map(Number),[cy,cm,cd]=date.split('-').map(Number);let age=cy-y;if(cm<m||cm===m&&cd<d)age--;return age>=0&&age<130?age:null}
export function syncBirthday(d,memberId,{name,birthday,inCalendar,color,ownerId}){
 d.events=d.events||[];const eventId=birthdayEventId(memberId),index=d.events.findIndex(e=>e.id===eventId),valid=/^\d{4}-\d{2}-\d{2}$/.test(birthday||'');
 if(!valid||!inCalendar){if(index>=0)d.events.splice(index,1);return}
 const existing=d.events[index]||{},event={...existing,id:eventId,birthdayOf:memberId,title:name+'’s birthday',he:'יום ההולדת של '+name,date:birthday,time:existing.time||'08:00',repeat:'yearly',memberIds:[memberId],icon:'1F382',color:color||existing.color||'yellow',visibility:'family',ownerId:existing.ownerId||ownerId,allowedIds:[]};
 if(index>=0){if(JSON.stringify(existing)!==JSON.stringify(event))d.events[index]=event}else d.events.push(event)
}
