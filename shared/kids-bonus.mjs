import {heroState} from './hero-home.mjs';

export function validateKidsBonus(input, members){
 if(!input||typeof input.id!=='string'||!/^[-a-zA-Z0-9]{8,100}$/.test(input.id))throw Error('Choose a valid bonus request.');
 if(!members.some(m=>m.id===input.childId&&m.role==='child'))throw Error('Choose a child.');
 if(!Number.isSafeInteger(input.amount)||input.amount<1||input.amount>10000)throw Error('Choose 1–10,000 virtual coins.');
 if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.trim().length>240)throw Error('Write a reason, up to 240 characters.');
 return {id:input.id,childId:input.childId,amount:input.amount,reason:input.reason.trim()};
}
export function applyKidsBonus(profile, bonus){
 const next=structuredClone(profile||{}),hero=heroState(next),amount=Number(hero.bonusStars)||0;
 if(!Number.isSafeInteger(amount)||amount<0||amount+bonus.amount>1000000000)throw Error('This bonus would exceed the virtual balance limit.');
 next.hero={...hero,bonusStars:amount+bonus.amount,revision:hero.revision+1,lastBonusGrant:bonus.id};
 return next;
}

// A remembered sample/removed child ID must never become a real recipient.
export const resolveBonusChild=(children,preferred)=>children.find(m=>m.id===preferred)?.id||children[0]?.id;
