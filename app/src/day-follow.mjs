// A chosen day lasts until the household's date changes (owner, 2026-11-13: Tasks opened on "Tue, Nov 10" three days later,
// showing two tasks). Today's week strip, Calendar and Tasks keep a day you picked, or a link opened, for the rest of that
// day; once midnight passes (or the app resumes on a later day) they all go back to today.

// The next shown day when the household date may have changed. `seen` is the date the screen last knew as today.
export function followDay({day,following,seen},today){
 if(seen!==today)return {day:today,following:true,seen:today};
 return {day:following?today:day,following,seen};
}

// Tasks opened by a link (Today's rows, notifications, a saved task): today's date shows the whole Today view
// (Overdue, Today, Anytime); any other date shows that one day.
export const linkRange=(date,today)=>date&&date!==today?'day':'today';
