import React, {useCallback, useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Archive, ArrowSquareOut, Bell, CalendarDots, Camera, Check, Copy, LockSimple, PencilSimple, Plus, Ticket, Trash, Wallet, X} from '@phosphor-icons/react';
import {voucherFields, voucherSecret, voucherStatus} from '../../shared/vouchers.mjs';
import {DateField} from './date-field';
import {FormSection} from './form-section';
import {HouseholdBrowse} from './household-browse';
import {householdDate} from './household-date';
import {HouseholdForm} from './household-form';
import {voucherRequest} from './voucher-client';
import {readVoucherPhoto, renderVoucherBarcode} from './voucher-photo';
import './voucher-wallet.css';

const statusLabels = {
 soon:['Expires soon','פג בקרוב'], valid:['Valid','בתוקף'], expired:['Expired','פג תוקף'],
 upcoming:['Starts later','טרם בתוקף'], unknown:['Unknown expiry','תוקף לא ידוע'], used:['Fully used','מומש במלואו']
};
const errorLabels = {
 VOUCHER_MERCHANT_REQUIRED:['Enter the issuer name.','הזינו את שם המנפיק.'],
 VOUCHER_INVALID_BALANCE:['Enter a non-negative amount with up to two decimal places.','הזינו סכום חיובי או אפס עם עד שתי ספרות אחרי הנקודה.'],
 VOUCHER_INVALID_DATES:['The end date must be on or after the start date.','תאריך הסיום צריך להיות ביום תחילת התוקף או אחריו.'],
 VOUCHER_INVALID_LINK:['Enter a valid HTTPS link.','הזינו קישור HTTPS תקין.'],
 VOUCHER_INVALID_CODE:['Enter a code of up to 200 characters on one line.','הזינו קוד של עד 200 תווים בשורה אחת.'],
 VOUCHER_INVALID_PHOTO:['Try a smaller, clear voucher photo.','נסו תמונה ברורה וקטנה יותר.'],
 VOUCHER_INVALID_WALLET:['Use a direct issuer .pkpass link or an official Google Wallet save link.','הזינו קישור ישיר לקובץ ‎.pkpass מהמנפיק או קישור שמירה רשמי של Google Wallet.'],
 VOUCHER_CHANGED:['This voucher changed on another device. Close and reopen it to review the latest version.','השובר השתנה במכשיר אחר. סגרו ופתחו אותו מחדש כדי לראות את הגרסה העדכנית.'],
 VOUCHER_LIMIT:['You can keep up to 200 vouchers.','אפשר לשמור עד 200 שוברים.'],
 VOUCHER_SCHEMA_REQUIRED:['Update the household server to use vouchers.','עדכנו את שרת הבית כדי להשתמש בשוברים.']
};
const errorText = (T, error) => T(...(errorLabels[error?.code || error?.message] || ['Could not complete the request. Try again.','הפעולה לא הושלמה. אפשר לנסות שוב.']));
const dateText = (a, value) => value ? householdDate(a,value) : a.T('Unknown','לא ידוע');
const balanceText = (a, cents) => cents === null ? a.T('Balance unknown','יתרה לא ידועה') :
 new Intl.NumberFormat(a.lang === 'he' ? 'he-IL' : 'en-IL', {style:'currency',currency:'ILS',minimumFractionDigits:cents % 100 ? 2 : 0}).format(cents / 100);

export function VoucherWallet({app:a, ui}) {
 const {T} = a;
 const {Button, Select, Tabs} = ui;
 const [records, setRecords] = useState(null);
 const [error, setError] = useState('');
 const [shelf, setShelf] = useState('active');
 const [filters, setFilters] = useState({});
 const [window, setWindow] = useState(null);
 const returnFocus = useRef(null);
 const wallet = useRef(null);
 const openedLink = useRef('');
 const load = useCallback(async () => {
  setError('');
  try { setRecords((await voucherRequest(a)).records); }
  catch (failure) { setError(errorText(T,failure)); }
 }, [a.cloud,a.data.householdId,a.user,a.lang,a.today]);
 useEffect(() => { load(); }, [load]);
 useEffect(() => {
  const id = new URLSearchParams(a.route.split('?')[1] || '').get('voucher');
  if (!id) {openedLink.current = '';return;}
  if (!records || openedLink.current === id) return;
  openedLink.current = id;
  if (records.some(record => record.id === id && record.shelf === 'active')) setWindow({mode:'details',id});
  else setError(T('This voucher is unavailable.','השובר הזה אינו זמין.'));
 }, [a.route,records]);
 useEffect(() => {
  const row = wallet.current?.previousElementSibling?.querySelector('.nav-section');
  const active = row?.querySelector('[aria-current="page"]');
  if (!active || typeof ResizeObserver === 'undefined') return;
  const reveal = () => {
   const bounds = row.getBoundingClientRect(), tab = active.getBoundingClientRect();
   if (tab.left < bounds.left + 32 || tab.right > bounds.right - 32) {
    row.scrollLeft += (tab.left + tab.right - bounds.left - bounds.right) / 2;
   }
  };
  const observer = new ResizeObserver(reveal);
  observer.observe(row);
  return () => observer.disconnect();
 }, [a.lang]);

 const inShelf = (records || []).filter(record => record.shelf === shelf);
 const soon = inShelf.filter(record => voucherStatus(record,a.today) === 'soon').length;
 const search = (filters.search || '').trim().toLowerCase();
 const merchants = [...new Set([...inShelf.map(record => record.merchant), ...(filters.merchant || [])])].sort((x,y) => x.localeCompare(y,a.lang));
 const results = inShelf.filter(record => {
  const balance = record.balanceCents === null ? 'unknown' : record.balanceCents === 0 ? 'zero' : 'remaining';
  return (!search || (record.title+' '+record.merchant).toLowerCase().includes(search)) &&
   (!filters.merchant?.length || filters.merchant.includes(record.merchant)) &&
   (!filters.status?.length || filters.status.includes(voucherStatus(record,a.today))) &&
   (!filters.balance?.length || filters.balance.includes(balance));
 }).sort((x,y) => filters.sort === 'name' ? x.title.localeCompare(y.title,a.lang) :
  (x.expiresOn || '9999').localeCompare(y.expiresOn || '9999') || x.title.localeCompare(y.title,a.lang));
 const groups = [
  {key:'merchant',label:T('Issuer','מנפיק'),options:merchants.map(value => ({value,label:value}))},
  {key:'status',label:T('Validity','תוקף'),options:Object.entries(statusLabels).map(([value,label]) => ({value,label:T(...label)}))},
  {key:'balance',label:T('Balance','יתרה'),options:[
   {value:'remaining',label:T('Remaining balance','נותרה יתרה')},{value:'zero',label:T('Zero balance','יתרה אפס')},{value:'unknown',label:T('Unknown balance','יתרה לא ידועה')}
  ]}
 ];
 const sorts = [{id:'expiry',label:T('Earliest expiry','תוקף קרוב קודם')},{id:'name',label:T('Name','לפי שם')}];
 const selected = records?.find(record => record.id === window?.id);
 const show = (mode, id, target) => { returnFocus.current = target; setWindow({mode,id}); };
 const close = () => { setWindow(null); requestAnimationFrame(() => returnFocus.current?.focus()); };
 const save = async (id, method, body) => {
  let response;
  try { response = await voucherRequest(a,{id,method,body}); }
  catch (failure) {
   if (failure.code === 'VOUCHER_CHANGED') await load();
   throw failure;
  }
  setRecords(current => {
   if (response.deleted) return current.filter(record => record.id !== id);
   return current.some(record => record.id === id) ? current.map(record => record.id === id ? response.record : record) : [...current,response.record];
  });
  return response.record;
 };
 return <section ref={wallet} className="voucher-wallet" aria-label={T('Vouchers','שוברים')}>
  <div className="voucher-wallet-toolbar">
   <Tabs value={shelf} label={T('Voucher lists','רשימות שוברים')} onChange={value => {setShelf(value);setFilters({});}}
    items={[[ 'active',T('Active','פעילים') ],[ 'archive',T('Archive','ארכיון') ],[ 'trash',T('Trash','אשפה') ]]}/>
   <Button icon={Plus} disabled={!records} onClick={event => show('new',crypto.randomUUID(),event.currentTarget)}>{T('Add voucher','הוספת שובר')}</Button>
  </div>
  {!a.cloud && <p className="voucher-preview-note">{T('Preview with fictional data. Changes last until reload.','תצוגת דוגמה עם נתונים מדומים. השינויים נשמרים עד לטעינה מחדש.')}</p>}
  {error && <div className="voucher-error"><p role="alert">{error}</p><Button secondary onClick={load}>{T('Try again','ניסיון חוזר')}</Button></div>}
  {!records && !error && <p role="status">{T('Loading vouchers…','טוענים שוברים…')}</p>}
  {records && <>
   <HouseholdBrowse a={a} value={filters} onChange={setFilters} groups={groups} sorts={sorts} ui={{Select}}/>
   {shelf === 'active' && soon > 0 && <button type="button" className="voucher-expiring" aria-pressed={filters.status?.includes('soon') || false}
    onClick={() => setFilters(value => ({...value,status:value.status?.includes('soon') ? [] : ['soon']}))}><Bell size={22}/>{T(soon === 1 ? '1 voucher expires in the next 7 days' : soon+' vouchers expire in the next 7 days',soon === 1 ? 'שובר אחד פג בשבעת הימים הקרובים' : soon+' שוברים פגים בשבעת הימים הקרובים')}</button>}
   {groups.some(group => filters[group.key]?.length) && <div className="voucher-active-filters">
    {groups.flatMap(group => group.options.filter(option => filters[group.key]?.includes(option.value)).map(option =>
     <button type="button" key={group.key+option.value} onClick={() => setFilters({...filters,[group.key]:filters[group.key].filter(value => value !== option.value)})}
      aria-label={T('Remove filter ','הסרת סינון ')+option.label}>{option.label}<X size={16}/></button>))}
    <span role="status">{results.length} {T('results','תוצאות')}</span>
   </div>}
   {results.length > 0 ? <ul className="voucher-records">
    {results.map(record => {
     const status = voucherStatus(record,a.today);
     return <li key={record.id}><button type="button" className={'voucher-record'+(status === 'soon' ? ' expiring' : '')} onClick={event => show('details',record.id,event.currentTarget)}>
      <span className="voucher-icon"><Ticket size={27}/></span>
      <span className="voucher-record-text"><strong dir="auto">{record.title}</strong>{record.merchant !== record.title && <small dir="auto">{record.merchant}</small>}
       <small>{status === 'upcoming' ? T('Starts ','מתחיל ב־')+dateText(a,record.startsOn) : record.expiresOn ? T('Expires ','סוף תוקף ')+dateText(a,record.expiresOn) : T('Expiry unknown','תוקף לא ידוע')}</small>
       {['used','expired'].includes(status) && <span className="voucher-tag">{T(...statusLabels[status])}</span>}
      </span>
      <span className="voucher-row-balance"><strong dir="auto">{balanceText(a,record.balanceCents)}</strong>{record.balanceCents !== null && <small>{T('Manual balance','יתרה ידנית')}</small>}</span>
     </button></li>;
    })}
   </ul> : <p className="voucher-empty">{inShelf.length ? T('No vouchers match these filters.','אין שוברים שתואמים לסינון.') : T('No vouchers in this list yet.','הרשימה הזו עדיין ריקה.')}</p>}
  </>}
  {window?.mode === 'new' && <VoucherEditor key={window.id} a={a} id={window.id} onClose={close} save={async (...args) => {
   await save(...args);setShelf('active');setFilters({});close();a.notify(T('Voucher saved.','השובר נשמר.'));
  }}/>}
  {selected && ['edit','balance'].includes(window.mode) && <VoucherEditor key={window.mode+selected.id} a={a} record={selected} id={selected.id} balanceOnly={window.mode === 'balance'}
   onClose={() => setWindow({...window,mode:'details'})} save={async (...args) => {
    await save(...args);setWindow({...window,mode:'details'});a.notify(T('Voucher saved.','השובר נשמר.'));
   }}/>}
  {selected && ['details','redeem'].includes(window.mode) && <VoucherDetails key={selected.id+window.mode} a={a} record={selected} Button={Button}
   redeem={window.mode === 'redeem'} close={window.mode === 'redeem' ? () => setWindow({...window,mode:'details'}) : close}
   open={mode => setWindow({...window,mode})} action={async (method,body) => {await save(selected.id,method,body);close();}}/>}
 </section>;
}

function VoucherEditor({a,id,record,balanceOnly,onClose,save}) {
 const {T} = a;
 const [draft,setDraft] = useState(() => ({...record, merchant:record?.merchant || '', title:record?.title || '',
  balance:record?.balanceCents == null ? '' : String(record.balanceCents/100), startsOn:record?.startsOn || '', expiresOn:record?.expiresOn || ''}));
 const [version] = useState(record?.version || 0);
 const [replace,setReplace] = useState(!record);
 const [secret,setSecret] = useState({code:'',original:''});
 const [saving,setSaving] = useState(false);
 const [reading,setReading] = useState(false);
 const [error,setError] = useState('');
 const [photoNote,setPhotoNote] = useState('');
 const set = (key,value) => setDraft(current => ({...current,[key]:value}));
 const scan = async file => {
  if (!file) return;
  setReading(true);setError('');setPhotoNote('');
  try {
   const result = await readVoucherPhoto(file);
   setSecret(current => ({...current,photo:result.photo, ...(result.code ? {code:result.code,format:result.format} : {})}));
   setPhotoNote(result.code ? T('Barcode found. Compare the value to the photo before saving.','נמצא ברקוד. השוו את הקוד לתמונה לפני השמירה.') : T('The photo is ready. Enter the code manually if you can read it.','התמונה מוכנה. אם הקוד קריא, אפשר להזין אותו ידנית.'));
  } catch (failure) {setError(errorText(T,failure));}
  finally {setReading(false);}
 };
 const submit = async event => {
  event.preventDefault();
  if (saving || reading) return;
  setSaving(true);setError('');
  try {
   const balance = draft.balance.trim().replace(',','.');
   if (balance && !/^\d+(?:\.\d{1,2})?$/.test(balance)) throw Error('VOUCHER_INVALID_BALANCE');
   const fields = voucherFields({...draft,balanceCents:balance ? Math.round(Number(balance)*100) : null});
   await save(id,'PUT',{...fields,version,...(balanceOnly ? {balanceReviewed:true} : {}),...(replace && !balanceOnly ? {secret:voucherSecret(secret)} : {})});
  } catch (failure) { setError(errorText(T,failure)); }
  finally { setSaving(false); }
 };
 return <HouseholdForm a={a} title={balanceOnly ? T('Update balance','עדכון יתרה') : record ? T('Edit voucher','עריכת שובר') : T('Add voucher','הוספת שובר')}
  className="voucher-editor" onClose={onClose} onSubmit={submit} saving={saving} error={error}
  actions={<button className="button" type="submit" disabled={saving || reading}>{T('Save','שמירה')}</button>}>
  {!balanceOnly && <FormSection icon={Ticket} title={T('Voucher details','פרטי שובר')} T={T}>
   <label>{T('Issuer','מנפיק')}<input required maxLength={80} value={draft.merchant} onChange={event => set('merchant',event.target.value)}/></label>
   <label>{T('Voucher name','שם השובר')}<input maxLength={100} value={draft.title} onChange={event => set('title',event.target.value)}/></label>
  </FormSection>}
  <FormSection icon={Wallet} title={T('Balance','יתרה')} tone="yellow" T={T}>
   <label>{T('Remaining balance (₪)','יתרה נותרת (₪)')}<input inputMode="decimal" dir="ltr" maxLength={11} value={draft.balance} onChange={event => set('balance',event.target.value)}/></label>
   <small>{T('Leave blank if you do not know the balance.','השאירו ריק אם היתרה לא ידועה.')}</small>
  </FormSection>
  {!balanceOnly && <>
   <FormSection icon={CalendarDots} title={T('Validity','תוקף')} tone="peach" T={T}>
    <div className="two-fields voucher-dates">{[['startsOn',T('Starts on','תחילת תוקף')],['expiresOn',T('Expires on','סוף תוקף')]].map(([key,label]) =>
     <div key={key}><span className="field-label">{label}</span><DateField aria-label={label} value={draft[key]} onChange={event => set(key,event.target.value)}/></div>)}</div>
   </FormSection>
   <FormSection icon={Bell} title={T('Expiry reminder','התראת תוקף')} tone="yellow" T={T}>
    <label>{T('Remind me','תזכורת') }<select value={draft.reminderDays || ''} disabled={!draft.expiresOn} onChange={event => set('reminderDays',Number(event.target.value)||null)}>
     <option value="">{T('Off','כבויה')}</option>{[1,3,7,14,30].map(days => <option key={days} value={days}>{T(days+' days before',days+' ימים לפני')}</option>)}
    </select></label>
    {!draft.expiresOn && <small>{T('Choose an end date to enable reminders.','בחרו סוף תוקף כדי להפעיל תזכורות.')}</small>}
    {!!draft.reminderDays && draft.expiresOn && <>
     <label className="checkbox-label"><input type="checkbox" checked={!!draft.reminderTelegram} onChange={event => set('reminderTelegram',event.target.checked)}/>Telegram</label>
     <label className="checkbox-label"><input type="checkbox" checked={!!draft.reminderPush} onChange={event => set('reminderPush',event.target.checked)}/>{T('Device notifications','התראות במכשיר')}</label>
     <small>{T('Delivery uses your linked channels and quiet hours.','המשלוח משתמש בערוצים המקושרים ובשעות השקט שלכם.')}</small>
    </>}
   </FormSection>
   <FormSection icon={LockSimple} title={T('Private redemption details','פרטי מימוש פרטיים')} tone="lilac" T={T}>
    {record && <label className="checkbox-label"><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)}/>{T('Replace redemption details','החלפת פרטי המימוש')}</label>}
    {replace && <>
     <label className="voucher-upload"><span><Camera size={20}/>{T('Scan a photo or screenshot','סריקת צילום או צילום מסך')}</span><input type="file" accept="image/*" disabled={reading} onChange={event => scan(event.target.files[0])}/></label>
     {reading && <p role="status">{T('Reading on this device…','קוראים במכשיר הזה…')}</p>}
     {photoNote && <small role="status">{photoNote}</small>}
     {secret.photo && <img className="voucher-photo-preview" src={secret.photo} alt={T('Voucher photo to review','צילום השובר לבדיקה')}/>}
     <label>{T('Voucher code','קוד השובר')}<input dir="auto" autoComplete="off" spellCheck={false} maxLength={200} value={secret.code} onChange={event => setSecret({...secret,code:event.target.value})}/></label>
     <label>{T('Original link','קישור לשובר המקורי')}<input dir="ltr" type="url" autoComplete="off" maxLength={2000} value={secret.original} onChange={event => setSecret({...secret,original:event.target.value})}/></label>
     <details><summary>{T('Issuer Wallet links','קישורי Wallet מהמנפיק')}</summary>
      <label>Apple Wallet<input dir="ltr" type="url" autoComplete="off" maxLength={5000} value={secret.apple || ''} onChange={event => setSecret({...secret,apple:event.target.value})}/></label>
      <label>Google Wallet<input dir="ltr" type="url" autoComplete="off" maxLength={5000} value={secret.google || ''} onChange={event => setSecret({...secret,google:event.target.value})}/></label>
     </details>
     {record && <small>{T('Saving replaces the previous code, photo and links.','השמירה מחליפה את הקוד, התמונה והקישורים הקודמים.')}</small>}
    </>}
   </FormSection>
  </>}
 </HouseholdForm>;
}

function VoucherDetails({a,record,Button,redeem,close,open,action}) {
 const {T} = a;
 const titleId = useId();
 const closeRef = useRef(null);
 const [secret,setSecret] = useState(null);
 const [error,setError] = useState('');
 const [busy,setBusy] = useState(false);
 const [confirm,setConfirm] = useState('');
 useEffect(() => {closeRef.current?.focus({preventScroll:true});},[]);
 const reveal = useCallback(async () => {
  setError('');
  try { setSecret(await voucherRequest(a,{id:record.id,redeem:true})); }
  catch (failure) { setError(errorText(T,failure)); }
 },[record.id,a.user,a.data.householdId,a.lang]);
 useEffect(() => {if (redeem) reveal();},[redeem,reveal]);
 const change = async name => {
  setBusy(true);setError('');
  try {
   await action(name === 'delete' ? 'DELETE' : 'POST',{version:record.version,action:name});
   a.notify(T('Voucher updated.','השובר עודכן.'));
  } catch (failure) {setError(errorText(T,failure));}
  finally {setBusy(false);}
 };
 const copyCode = async () => {
  try {await navigator.clipboard.writeText(secret.code);a.notify(T('Code copied.','הקוד הועתק.'));}
  catch {setError(T('Select the code to copy it.','בחרו את הקוד כדי להעתיק אותו.'));}
 };
 const issuer = record.merchant.trim().toLowerCase() === 'buyme' ? 'https://buyme.co.il/' : '';
 return createPortal(<div className="document-editor-backdrop household-window-backdrop">
  <section className="document-editor household-window voucher-detail-sheet" dir={a.lang === 'he' ? 'rtl' : 'ltr'} role="dialog" aria-modal="true" aria-labelledby={titleId}
   onKeyDown={event => {
    if (event.key === 'Escape' && !busy) {event.stopPropagation();close();}
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled),a[href]')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && event.target === first) {event.preventDefault();last?.focus();}
    if (!event.shiftKey && event.target === last) {event.preventDefault();first?.focus();}
   }}>
   <header className="document-editor-header"><h2 id={titleId}>{redeem ? T('Redeem at checkout','מימוש בקופה') : T('Voucher details','פרטי שובר')}</h2>
    <button ref={closeRef} type="button" className="icon-button" disabled={busy} aria-label={T('Close','סגירה')} onClick={close}><X size={23}/></button>
   </header>
   <div className="document-editor-body">
    <div className="voucher-detail-title"><span className="voucher-icon"><Ticket size={27}/></span><div><h3 dir="auto">{record.title}</h3>{record.title !== record.merchant && <small dir="auto">{record.merchant}</small>}</div>
     <span className="voucher-tag"><LockSimple size={17}/>{T('Private','פרטי')}</span></div>
    {redeem ? <>
     {!secret && !error && <p role="status">{T('Opening voucher…','פותחים את השובר…')}</p>}
     {!secret && error && <Button secondary onClick={reveal}>{T('Try again','ניסיון חוזר')}</Button>}
     {secret && <VoucherCode T={T} secret={secret} sample={record.id === 'sample'}/>}
     {secret && <div className="voucher-detail-actions">
      {secret.code && <Button secondary icon={Copy} onClick={copyCode}>{T('Copy code','העתקת קוד')}</Button>}
      {secret.original && <a className="button secondary" href={secret.original} target="_blank" rel="noopener noreferrer"><ArrowSquareOut size={20}/>{T('Open original voucher','פתיחת השובר המקורי')}</a>}
      {secret.apple && <a className="button secondary" href={secret.apple} target="_blank" rel="noopener noreferrer">{T('Add to Apple Wallet','הוספה ל־Apple Wallet')}</a>}
      {secret.google && <a className="button secondary" href={secret.google} target="_blank" rel="noopener noreferrer">{T('Add to Google Wallet','הוספה ל־Google Wallet')}</a>}
     </div>}
    </> : <>
     <div className="voucher-balance">
      <strong dir="auto">{balanceText(a,record.balanceCents)}</strong>
      {record.balanceDate && <small>{T('Manual balance · updated ','יתרה ידנית · עודכנה ב־')+dateText(a,record.balanceDate)}</small>}
      {record.shelf !== 'trash' && <div className="voucher-detail-actions">
       <Button secondary onClick={() => open('balance')}>{T('Update balance','עדכון יתרה')}</Button>
       {issuer && <a className="button secondary" href={issuer} target="_blank" rel="noopener noreferrer"><ArrowSquareOut size={20}/>{T('Check with issuer','בדיקה אצל המנפיק')}</a>}
      </div>}
     </div>
     <dl className="voucher-validity"><div><dt>{T('Starts on','תחילת תוקף')}</dt><dd>{dateText(a,record.startsOn)}</dd></div>
      <div><dt>{T('Expires on','סוף תוקף')}</dt><dd>{dateText(a,record.expiresOn)}</dd></div></dl>
     {record.reminderDays && record.expiresOn && <div className="voucher-reminder"><Bell size={20}/>{T('Reminder '+record.reminderDays+' days before','תזכורת '+record.reminderDays+' ימים לפני סוף התוקף')}</div>}
     <div className={'voucher-detail-actions'+(record.shelf !== 'trash' ? ' voucher-management-actions' : '')}>
      {record.shelf !== 'trash' && <Button secondary icon={PencilSimple} disabled={busy} onClick={() => open('edit')}>{T('Edit','עריכה')}</Button>}
      {record.shelf === 'active' && <Button secondary icon={Archive} disabled={busy} onClick={() => change('archive')}>{T('Archive','ארכוב')}</Button>}
      {record.shelf !== 'active' && <Button secondary disabled={busy} onClick={() => change('restore')}>{T('Restore','שחזור')}</Button>}
      <Button secondary icon={Trash} disabled={busy} onClick={() => record.shelf === 'trash' ? setConfirm('delete') : change('trash')}>{record.shelf === 'trash' ? T('Delete permanently','מחיקה לצמיתות') : T('Move to Trash','לאשפה')}</Button>
     </div>
    </>}
    {confirm && <div className="voucher-confirm">
     <p role="alert">{confirm === 'delete' ? T('Permanently delete this voucher and its redemption details?','למחוק לצמיתות את השובר ואת פרטי המימוש שלו?') : T('Set the balance to zero and move this voucher to the archive?','לאפס את היתרה ולהעביר את השובר לארכיון?')}</p>
     <div className="voucher-detail-actions"><Button secondary disabled={busy} onClick={() => setConfirm('')}>{T('Cancel','ביטול')}</Button><Button disabled={busy} onClick={() => change(confirm)}>{T('Confirm','אישור')}</Button></div>
    </div>}
    {error && <p role="alert" className="save-error">{error}</p>}
   </div>
   {(redeem || (record.shelf === 'active' && record.hasRedemption)) && <footer className="document-editor-footer voucher-detail-footer">
    {redeem ? <>
     <Button secondary disabled={busy} onClick={() => open('balance')}>{T('Update balance','עדכון יתרה')}</Button>
     <Button icon={Check} disabled={busy || !!confirm} onClick={() => setConfirm('use')}>{T('Mark fully used','סימון כמומש במלואו')}</Button>
    </> : <Button onClick={() => open('redeem')} disabled={busy}>{T('Redeem at checkout','מימוש בקופה')}</Button>}
   </footer>}
  </section>
 </div>, document.body);
}

function VoucherCode({T,secret,sample}) {
 const canvas = useRef(null);
 const [rendered,setRendered] = useState(false);
 useEffect(() => {
  if (!secret.format || !secret.code) return;
  let alive = true;
  renderVoucherBarcode(canvas.current,secret.format,secret.code).then(ok => {if (alive) setRendered(ok);});
  return () => {alive = false;};
 },[secret.format,secret.code]);
 return <>
  {(secret.code || secret.format) && <div className="voucher-code">
   <span>{sample ? T('Sample code','קוד דוגמה') : T('Show this at checkout','הציגו בקופה')}</span>
   {secret.format && <canvas ref={canvas} hidden={!rendered} aria-label={T('Voucher barcode','ברקוד השובר')}/>}
   <strong dir="ltr">{secret.code}</strong>
  </div>}
  {secret.photo && <details className="voucher-source-photo" open={!secret.format || !rendered}>
   <summary>{T('Voucher photo','צילום השובר')}</summary><img src={secret.photo} alt={T('Original voucher photo','צילום השובר')}/>
  </details>}
 </>;
}
