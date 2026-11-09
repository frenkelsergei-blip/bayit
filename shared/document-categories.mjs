export const DOCUMENT_CATEGORIES=[
 ['Home','Home','בית','1F3E0'],['Identity','Identity','זהות','1FAAA'],['Licenses','Licenses & permits','רישיונות ואישורים','1F4C7'],['Vehicle','Vehicle','רכב','1F697'],['Medical','Medical','רפואה','1F3E5'],['Insurance','Insurance','ביטוח','1F6E1'],['Finance','Money & banking','כספים ובנקאות','1F4B0'],['School','School & education','לימודים וחינוך','1F4DA'],['Work','Work','עבודה','1F4BC'],['Travel','Travel','נסיעות','1F9F3'],['Appliances','Appliances & warranties','מכשירים ואחריות','1F9FE'],['Other','Other','אחר','1F4C4']
].map(([id,title,he,icon])=>({id,title,he,icon}));
export function documentCategories(record){
 if(Array.isArray(record?.categories))return record.categories;
 if(!record?.category)return [];
 return [DOCUMENT_CATEGORIES.find(c=>c.id===record.category)||{id:record.category,title:record.category,he:record.category,icon:'1F4C4'}];
}
export function documentCategoryCatalog(documents=[],custom=[]){
 const map=new Map(DOCUMENT_CATEGORIES.map(c=>[c.id,c]));
 for(const doc of documents)for(const category of documentCategories(doc))if(!map.has(category.id))map.set(category.id,category);
 for(const c of custom)map.set(c.id,c);
 return [...map.values()];
}
export function validateDocumentCategories(value,validIcon,max=12){
 if(!Array.isArray(value)||value.length>max||new Set(value.map(c=>c?.id)).size!==value.length)throw Error('Choose valid document categories.');
 for(const c of value)if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['id','title','he','icon'].includes(k))||typeof c.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(c.id)||['title','he'].some(k=>typeof c[k]!=='string'||!c[k].trim()||c[k].length>80)||!validIcon(c.icon))throw Error('Choose valid document category details.');
}
