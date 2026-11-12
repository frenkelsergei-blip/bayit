// A photographed shopping note (2026-11-12, concept C round 2 "צילום רשימה"): the household's own AI provider reads
// a handwritten or printed list into a DRAFT of items; a person ticks what to add. Nothing is saved by reading, the
// photo is not stored, and only what the person ticks becomes ordinary shopping items. Pure functions, server and app.
import {productKey} from './shopping-rhythm.mjs';
import {matchItem} from './item-dictionary.mjs';

export const noteTool={name:'read_shopping_note',description:'Read one photographed shopping list into its items. Only what is written; never add items that are not on the note.',
 input_schema:{type:'object',additionalProperties:false,required:['items'],properties:{
  items:{type:'array',maxItems:60,items:{type:'object',additionalProperties:false,required:['written','title'],properties:{
   written:{type:'string',description:'The line exactly as written on the note'},
   title:{type:'string',description:'Plain product name, e.g. "פיתות"'},
   quantity:{type:'number',description:'Only if a number is written'},
   unit:{type:'string',enum:['items','kg','packs'],description:'Only if written'}}}}}}};

const str=(v,max)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):'';
export function normalizeNote(value){
 if(!value||!Array.isArray(value.items)||value.items.length>60)throw Error('Invalid note.');
 const seen=new Set(),items=[];
 for(const i of value.items){const title=str(i?.title,80),written=str(i?.written,120)||title;if(!title)continue;const key=productKey({title});if(seen.has(key))continue;seen.add(key);
  const q=typeof i.quantity==='number'&&Number.isFinite(i.quantity)&&i.quantity>0&&i.quantity<=1000?Math.round(i.quantity*100)/100:null;
  items.push({written,title,key,...(q!=null?{quantity:q}:{}),...(['kg','packs'].includes(i.unit)?{unit:i.unit}:{})})}
 if(!items.length)throw Error('No items were read.');
 return {items};
}

// The window's rows: what is already open on the list starts unticked, with what is there.
export function noteRows(items,listItems){
 const open=new Map(listItems.filter(i=>!i.done).map(i=>[productKey(i),i]));
 return items.map(i=>{const on=open.get(i.key),m=matchItem(i.title);return {...i,icon:m.icon,group:m.group,onList:on||null,picked:!on}});
}
