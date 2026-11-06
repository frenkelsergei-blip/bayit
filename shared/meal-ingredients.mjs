export function normalizeIngredients(items=[]){
 return items.map(i=>{const name=String(i.name||'').trim(),quantityValue=Number(i.quantityValue??i.quantity??1);if(!name||!Number.isFinite(quantityValue)||quantityValue<=0)throw Error('Choose an ingredient name and a positive quantity.');return {...i,name,he:String(i.he||name),quantityValue,unit:i.unit||'items',checked:!!i.checked}});
}
export function scaleIngredients(items,before,after){
 if(!(Number(before)>0&&Number(after)>0))return items;
 return items.map(i=>({...i,quantityValue:Math.round((Number(i.quantityValue??i.quantity)||1)*Number(after)/Number(before)*1000)/1000}));
}
