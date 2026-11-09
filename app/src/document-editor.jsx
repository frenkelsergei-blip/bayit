import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,FileText,HouseLine,LockSimple,X,ClipboardText,Tag,UsersThree,Sparkle} from '@phosphor-icons/react';
import {FormSection} from './form-section';
import './household-window.css';
import {PersonChip} from './person-chip';
import {AssignedPeople} from './assigned-people';
import {RecordAccess} from './record-access';
import {DocumentAI} from './document-ai';
import {DocumentDates} from './document-dates';
import {useConfirmedSave} from './confirmed-save';
import {useDraftGuard} from './draft-guard';
import {putLocalFile,deleteLocalFile} from './file-store';
import {documentPeople} from '../../shared/document-people.mjs';
import {DocumentCategoryChoice,documentCategories,documentCategoryCatalog} from './document-categories';
import './document-people.css';

export function DocumentSubjects({a,record,Avatar,compact=false}){
 const people=documentPeople(record);
 return <span className={'document-subjects'+(compact?' compact':'')}>
  {people===null?<span className="document-subject-label">{a.T('Not assigned yet','טרם שויך')}</span>:people.length===0?<span className="document-subject-label"><HouseLine size={18}/>{a.T('Household document','מסמך של הבית')}</span>:<AssignedPeople ids={people.filter(person=>a.members.some(m=>m.id===person))} name={a.name} Avatar={Avatar} member={id=>a.members.find(m=>m.id===id)} size={compact?24:32} label={a.T('Documents about','מסמכים שקשורים ל־')}/>}
 </span>;
}

export function DocumentEditor({a,record,file,contacts,saveRecord,onSaved,onClose,ui:{Avatar,Select,Button,Icon,IconPicker}}){
 const [draft,setDraft]=useState(()=>{const next={...record,allowedIds:[...(record.allowedIds||[])],categories:documentCategories(record)};const people=documentPeople(record);delete next.memberId;if(people!==null)next.memberIds=people;return next;}),[custom,setCustom]=useState([]),[pickIcon,setPickIcon]=useState(false),[categoryEditing,setCategoryEditing]=useState(false),[validation,setValidation]=useState('');
 const {saving,saveError,commit}=useConfirmedSave(a),uploaded=useRef(null),closeButton=useRef(null),titleId=useId();
 const guard=useDraftGuard(a,{draft,custom,categoryEditing},{key:record.id,dirty:file?true:undefined}),people=documentPeople(draft);
 useEffect(()=>{closeButton.current?.focus({preventScroll:true})},[]);
 const change=patch=>setDraft(d=>({...d,...patch}));
 const close=()=>{if(saving)return;guard(()=>{if(file&&uploaded.current)void deleteLocalFile(uploaded.current).catch(()=>{});onClose()})};
 const submit=async e=>{
  e.preventDefault();
  if(!draft.title?.trim())return;
  if(people===null){setValidation(a.T('Choose who this document is about, or choose Household.','בחרו למי המסמך קשור, או בחרו מסמך של הבית.'));return;}
  if(draft.visibility==='selected'&&!draft.allowedIds.some(id=>id!==a.user)){setValidation(a.T('Choose at least one person who can see it.','בחרו לפחות אדם אחד שיוכל לצפות במסמך.'));return;}
  if(draft.validFrom&&draft.expires&&draft.expires<draft.validFrom){setValidation(a.T('Expiry must be on or after the issue / valid-from date.','תאריך התוקף צריך להיות בתאריך ההנפקה / תחילת התוקף או אחריו.'));return;}
  setValidation('');
  await commit(async()=>{
   let fileId=draft.fileId;
   if(file){if(!uploaded.current){const candidate=crypto.randomUUID();await putLocalFile(candidate,file);uploaded.current=candidate;}fileId=uploaded.current;}
   const next={...draft,category:draft.categories[0]?.id||'',memberIds:people,ownerId:record.ownerId,allowedIds:draft.visibility==='selected'?draft.allowedIds.filter(id=>id!==a.user):[],...(fileId?{fileId}:{}),...(file?{createdAt:record.createdAt||new Date().toISOString()}:{} )};
   delete next.kind;delete next.memberId;
   return saveRecord(next,custom);
  },()=>{guard.accept();onSaved(draft.id)});
 };
 const explanation=draft.visibility==='private'?a.T('Only you can see the document and open its file. Choosing who it is about does not share it with them.','רק אתם יכולים לראות את המסמך ולפתוח את הקובץ. שיוך לאדם אינו משתף איתו את המסמך.'):draft.visibility==='family'?a.T('Every member of this household, including children, can see the document and open its file. You remain in control of editing and sharing.','כל בני הבית, כולל הילדים, יוכלו לראות את המסמך ולפתוח את הקובץ. עריכה ושינוי השיתוף נשארים בשליטתכם.'):a.T('Only you and the people selected here can see the document and open its file. Only you can edit its details and sharing.','רק אתם והאנשים שתבחרו כאן תוכלו לראות את המסמך ולפתוח את הקובץ. רק אתם יכולים לערוך את הפרטים והשיתוף.');
 return createPortal(<div className="document-editor-backdrop household-window-backdrop"><section className="document-editor household-window wide" role="dialog" aria-modal="true" aria-labelledby={titleId} dir={a.lang==='he'?'rtl':'ltr'} onKeyDown={e=>{if(e.key==='Escape'&&e.target.closest('[role="dialog"]')===e.currentTarget){e.preventDefault();close()}}}>
  <form onSubmit={submit} aria-busy={saving}>
   <header className="document-editor-header"><h2 id={titleId}>{file?a.T('Add document','הוספת מסמך'):a.T('Document details & sharing','פרטי המסמך ושיתוף')}</h2><button ref={closeButton} type="button" className="icon-button" aria-label={a.T('Close document','סגירת המסמך')} disabled={saving} onClick={close}><X size={24}/></button></header>
   <div className="document-editor-body"><div className="form-columns"><div className="form-column"><FormSection T={a.T} icon={ClipboardText} tone="blue" title={a.T('Details','פרטים')}><div className="document-upload-file"><FileText size={30}/><div><strong dir="auto">{draft.filename}</strong><small>{file?a.T('Ready to upload · saved only after confirmation','מוכן להעלאה · יישמר רק לאחר אישור השמירה'):a.T('Uploaded by','הועלה על ידי')+' '+a.name(record.ownerId)}</small></div></div><div className="household-name-row"><label>{a.T('Document title','שם המסמך')}<input required value={a.text(draft)||''} dir="auto" maxLength={500} onChange={e=>change({title:e.target.value,he:e.target.value})}/></label><button type="button" className="document-icon-choice household-icon-choice" aria-label={a.T('Choose document icon','בחירת אייקון למסמך')} onClick={()=>setPickIcon(true)}><Icon code={draft.icon||'1F4C4'} size={34}/><FileText size={14}/></button></div><label>{a.T('Description (optional)','תיאור (לא חובה)')}<textarea value={draft.description||''} maxLength={10000} onChange={e=>change({description:e.target.value})}/></label><label>{a.T('Linked contact (optional)','איש קשר מקושר (לא חובה)')}<Select aria-label={a.T('Linked contact','איש קשר מקושר')} value={draft.contactId||''} onChange={e=>change({contactId:e.target.value})}><option value="">{a.T('No linked contact','ללא איש קשר')}</option>{contacts.map(c=><option key={c.id} value={c.id}>{a.text(c)}</option>)}</Select></label></FormSection><FormSection T={a.T} icon={Tag} tone="peach" title={a.T('Categories & dates','קטגוריות ותאריכים')}><DocumentCategoryChoice a={a} onComposing={setCategoryEditing} value={draft.categories} onChange={categories=>change({categories})} catalog={documentCategoryCatalog(a.visible(a.data.documents||[]),[...(a.data.profiles[a.user]?.documentCategories||[]),...custom])} onCreate={c=>setCustom(list=>[...list,c])} ui={{Icon,IconPicker,Button}}/><DocumentDates a={a} value={draft} onChange={change}/></FormSection><FormSection T={a.T} icon={Sparkle} tone="green" className="document-ai-section" title={a.T('Summary with AI (optional)','סיכום בעזרת AI (לבחירה)')}><DocumentAI a={a} record={draft} file={file} onApply={patch=>change({...patch,description:patch.description?[draft.description,patch.description].filter(Boolean).join('\n\n').slice(0,10000):draft.description})}/></FormSection></div><div className="form-column"><FormSection T={a.T} icon={UsersThree} tone="yellow" title={a.T('Who it is about','למי זה קשור')}><fieldset className="document-assignment"><legend>{a.T('Who is this document about?','למי המסמך קשור?')}</legend><p>{a.T('Choose one or more people, or Household for a shared subject. This does not give anyone access.','אפשר לבחור אדם אחד או יותר, או מסמך של הבית לנושא משותף. הבחירה אינה מעניקה הרשאת צפייה.')}</p><div className="document-assignment-people"><button type="button" aria-pressed={people?.length===0} className={'document-household-choice'+(people?.length===0?' chosen':'')} onClick={()=>change({memberIds:[]})}><HouseLine size={24}/>{a.T('Household','מסמך של הבית')}{people?.length===0&&<Check size={16}/>}</button>{a.members.map(m=><PersonChip key={m.id} who={m.id} name={a.name(m.id)} Avatar={Avatar} tone={m.color} selected={!!people?.includes(m.id)} onClick={()=>{const next=people?.includes(m.id)?people.filter(id=>id!==m.id):[...(people||[]),m.id];change({memberIds:next.length?next:undefined})}}/>)}</div></fieldset></FormSection><FormSection T={a.T} icon={LockSimple} tone="lilac" title={a.T('Privacy & permissions','פרטיות והרשאות')}><RecordAccess app={a} value={draft.visibility} onChange={visibility=>change({visibility})} allowed={draft.allowedIds} onAllowed={allowedIds=>change({allowedIds})} showEditors={false} explanation={explanation} ui={{Avatar,Select}}/><div className="document-owner"><LockSimple size={20}/><span>{a.T('Uploaded and managed by','העלאה וניהול:')}</span><PersonChip who={record.ownerId} name={a.name(record.ownerId)} Avatar={Avatar} tone={a.members.find(m=>m.id===record.ownerId)?.color} size={30}/></div></FormSection></div></div>
   </div>
   <footer className="document-editor-footer">{(validation||saveError)&&<p role="alert" className="save-error">{validation||saveError}</p>}<div className="actions"><Button secondary disabled={saving} onClick={close}>{a.T('Cancel','ביטול')}</Button><Button type="submit" disabled={saving} icon={Check}>{saving?a.T('Saving…','שומרים…'):file?a.T('Upload & save','העלאה ושמירה'):a.T('Save changes','שמירת שינויים')}</Button></div></footer>
  </form>
  {pickIcon&&<IconPicker allowUploads={false} selected={draft.icon||'1F4C4'} close={()=>setPickIcon(false)} onSelect={icon=>{change({icon});setPickIcon(false)}}/>}
 </section></div>,document.body);
}
