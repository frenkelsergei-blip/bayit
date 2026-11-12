// "Whose" filter for Tasks, Today and Calendar (user request 2026-11-11): each person sees their own tasks and events
// by default, and Everyone or another person stays one tap away. This is a view rule only: who can see a record is
// still decided by shared/record-audience.mjs, and callers pass only records the viewer may see (a.visible).
//
// "Mine in a list" (inMyView) is the personal rule isMine (assigned to me, plus my own private records), plus records
// that belong to everyone:
//  - a task or event with no assignee at all (nobody was chosen, e.g. older or imported records);
//  - a birthday event (birthdayOf): the family's birthdays concern everyone, though only the birthday person is assigned.
// "Whole family" records list every member as an assignee, so they are already mine.
// A task I created for someone else is theirs, not mine.
import {isMine,recordAssignees,canSeeRecord} from './record-audience.mjs';

export const WHOSE_MINE='mine',WHOSE_ALL='all';

export function inMyView(record,userId,collection){
 if(!record||!userId||!canSeeRecord(record,userId,collection))return false; // never widens access
 if(isMine(record,userId,collection))return true;
 if(collection==='events'&&record.birthdayOf)return true;
 return !recordAssignees(record,collection).length;
}

// whose: 'mine' | 'all' | a member id. A member id that is the viewer means 'mine'.
export function matchesWhose(record,whose,userId,collection){
 if(!whose||whose===WHOSE_ALL)return true;
 if(whose===WHOSE_MINE||whose===userId)return inMyView(record,userId,collection);
 return recordAssignees(record,collection).includes(whose);
}

// The remembered choice is only Everyone vs mine; another person is a passing view and is never remembered.
// Anything unknown reads as mine, so a fresh device starts at mine.
export const rememberedWhose=value=>value===WHOSE_ALL?WHOSE_ALL:WHOSE_MINE;
