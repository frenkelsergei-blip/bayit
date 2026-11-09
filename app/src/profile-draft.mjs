// Compare only editable profile values, using the same effective defaults as
// the editor. Progress, equipment and notification delivery save elsewhere.
export function profileDraftState(value={},defaults={}){
 const text=v=>typeof v==='string'?v:'';
 return {
  name:text(value.name).trim(),
  photo:text(value.photo),
  displayMode:value.displayMode||defaults.displayMode||'photo',
  badgeIcon:value.badgeIcon||'1F3E0',
  character:value.character||defaults.character||'',
  color:value.color||defaults.color||'blue',
  birthday:value.birthday||'',
  birthdayInCalendar:value.birthdayInCalendar!==false,
  locale:value.locale||defaults.locale||'en',
 };
}
export function hasProfileChanges(draft,saved,defaults){
 return JSON.stringify(profileDraftState(draft,defaults))!==JSON.stringify(profileDraftState(saved,defaults));
}
