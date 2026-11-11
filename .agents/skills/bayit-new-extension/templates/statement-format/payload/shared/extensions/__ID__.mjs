// Statement format "__NAME_EN__" (extension __ID__, docs/extension-skills.md). Pure parsing: no network, no logging.
// Rows come from app/cloud/statement-pdf.mjs: {text, items:[{s, x}]} (s: the word or cell text, x: its position).
// parse returns the shape of parseLeumi (kind 'bank') or parseMax (kind 'card') in shared/finance-parse.mjs:
//   {issuer, kind, account (last 4 digits only), period:{from,to}, transactions:[{date:'YYYY-MM-DD', description,
//    amount (integer agorot/cents, negative = money out), balance?, account, seq}], checks:[{id, ok, detail}],
//    closingBalance?}
// checks must reconcile with numbers PRINTED on the statement (running balance, closing balance, card total), so
// a misread statement is reported, never imported silently. Built-in formats are always recognised first.
// Amount text such as '1,234.50' or '-120.50' → integer agorot/cents (null when it is not a number).
const cents=s=>{const n=Math.round(Number(String(s).replace(/,/g,''))*100);return Number.isFinite(n)?n:null};
export const __EXPORT__={
 id:'__ID__',
 name:'__NAME_EN__',
 // TODO(bayit): recognise this statement from its first rows (a title or the issuer's web address), and nothing else.
 detect:rows=>false,
 parse(rows){
  // TODO(bayit): read account, period and transactions by column; add checks that reconcile with the printed totals.
  throw Object.assign(Error('__NAME_EN__ statements cannot be read yet.'),{status:422});
 },
};
