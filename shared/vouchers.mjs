const maxBalance = 100_000_000;
export const voucherBarcodeTypes = Object.freeze({QR_CODE:'qrcode',CODE_128:'code128',CODE_39:'code39',EAN_13:'ean13',EAN_8:'ean8',UPC_A:'upca',PDF_417:'pdf417',AZTEC:'azteccode',DATA_MATRIX:'datamatrix'});
const text = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
 Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function voucherFields(input) {
 const merchant = text(input.merchant, 80);
 const title = text(input.title, 100) || merchant;
 const {balanceCents, startsOn = '', expiresOn = ''} = input;
 if (!merchant) throw Error('VOUCHER_MERCHANT_REQUIRED');
 if (balanceCents !== null && (!Number.isInteger(balanceCents) || balanceCents < 0 || balanceCents > maxBalance)) throw Error('VOUCHER_INVALID_BALANCE');
 if ((startsOn !== '' && !validDate(startsOn)) || (expiresOn !== '' && !validDate(expiresOn)) ||
     (startsOn && expiresOn && startsOn > expiresOn)) throw Error('VOUCHER_INVALID_DATES');
 const reminderDays = input.reminderDays ?? null;
 if (reminderDays !== null && ![1,3,7,14,30].includes(reminderDays)) throw Error('VOUCHER_INVALID_REMINDER');
 return {merchant, title, balanceCents, startsOn, expiresOn, reminderDays, ...(reminderDays !== null ? {reminderTelegram:input.reminderTelegram===true,reminderPush:input.reminderPush===true} : {})};
}

function voucherURL(value) {
 const link = typeof value === 'string' ? value.trim() : '';
 if (!link) return '';
 let url;
 try { url = new URL(link); } catch { throw Error('VOUCHER_INVALID_LINK'); }
 if (link.length > 5000 || url.protocol !== 'https:' || url.username || url.password) throw Error('VOUCHER_INVALID_LINK');
 return link;
}

export function voucherSecret(input) {
 const format = Object.hasOwn(voucherBarcodeTypes,input.format) ? input.format : '';
 const code = typeof input.code === 'string' ? (format ? input.code : input.code.trim()) : '';
 const original = voucherURL(input.original);
 if (code.length > 200 || /[\u0000-\u001f\u007f]/.test(code)) throw Error('VOUCHER_INVALID_CODE');
 const photo = typeof input.photo === 'string' ? input.photo : '';
 if (photo && (photo.length > 245_000 || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(photo))) throw Error('VOUCHER_INVALID_PHOTO');
 const apple = voucherURL(input.apple), google = voucherURL(input.google);
 if (apple && !new URL(apple).pathname.toLowerCase().endsWith('.pkpass')) throw Error('VOUCHER_INVALID_WALLET');
 if (google && !/^https:\/\/pay\.google\.com\/gp\/v\/save\/[A-Za-z0-9_.-]+$/.test(google)) throw Error('VOUCHER_INVALID_WALLET');
 return {code, original, ...(format && code ? {format} : {}), ...(photo ? {photo} : {}), ...(apple ? {apple} : {}), ...(google ? {google} : {})};
}

export const hasVoucherSecret = secret => !!(secret?.code || secret?.original || secret?.photo || secret?.apple || secret?.google);

export function voucherReminderDue(record, today) {
 if (record.shelf !== 'active' || record.used || record.balanceCents === 0 || !record.reminderDays || !record.expiresOn) return false;
 const days = (Date.parse(record.expiresOn)-Date.parse(today))/86400000;
 return days >= 0 && days <= record.reminderDays;
}

export function voucherStatus(record, today) {
 if (record.used) return 'used';
 if (record.startsOn && record.startsOn > today) return 'upcoming';
 if (!record.expiresOn) return 'unknown';
 if (record.expiresOn < today) return 'expired';
 const days = (Date.parse(record.expiresOn) - Date.parse(today)) / 86400000;
 return days <= 7 ? 'soon' : 'valid';
}

export function voucherTransition(record, action, today) {
 if (action === 'archive' && record.shelf === 'active') return {shelf:'archive'};
 if (action === 'trash' && record.shelf !== 'trash') return {shelf:'trash', previousShelf:record.shelf};
 if (action === 'restore' && record.shelf === 'trash') return {shelf:record.previousShelf, previousShelf:null};
 if (action === 'restore' && record.shelf === 'archive') return {shelf:'active', used:false};
 if (action === 'use' && record.shelf === 'active') return {shelf:'archive', used:true, balanceCents:0, balanceDate:today};
 throw Error('VOUCHER_INVALID_ACTION');
}
