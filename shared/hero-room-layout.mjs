import {HERO_BY_ID} from './hero-catalog.mjs';
export const HERO_ROOM_SLOTS=['shelf','window','wall','floor'];
const slots={plant:'window','flowers-pot':'window',tree:'window',books:'shelf',pencils:'shelf',puzzle:'shelf',trophy:'shelf',gift:'shelf',clock:'shelf',calendar:'wall',toybox:'floor',ball:'floor',bike:'floor',watering:'floor',dollhouse:'floor'};
export const heroRoomSlot=id=>slots[id]||null;
export function heroRoomDisplay(profile={}){
 const hero=profile.hero||{},saved=hero.roomDisplay;
 if(saved&&typeof saved==='object'&&!Array.isArray(saved))return Object.fromEntries(HERO_ROOM_SLOTS.map(slot=>[slot,heroRoomSlot(saved[slot])===slot&&hero.owned?.includes(saved[slot])?saved[slot]:null]));
 const old=hero.loadout?.decor;return Object.fromEntries(HERO_ROOM_SLOTS.map(slot=>[slot,heroRoomSlot(old)===slot?old:null]));
}
export function validateHeroRoom(placements,profile){
 if(!placements||typeof placements!=='object'||Array.isArray(placements)||Object.keys(placements).some(key=>!HERO_ROOM_SLOTS.includes(key)))throw Error('room-layout');
 const next={};for(const slot of HERO_ROOM_SLOTS){const id=placements[slot]??null;if(id!==null&&(typeof id!=='string'||heroRoomSlot(id)!==slot||HERO_BY_ID[id]?.category!=='room'||!profile.hero?.owned?.includes(id)))throw Error('room-layout');next[slot]=id}return next;
}
