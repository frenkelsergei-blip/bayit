import {hasVoucherSecret, voucherFields, voucherSecret, voucherTransition} from '../../shared/vouchers.mjs';

// Fictional preview only. Keep entered redemption details out of browser persistence.
const previews = new Map();
function preview(a) {
 const key = JSON.stringify([a.data.householdId, a.user]);
 if (!previews.has(key)) {
  const fixtures = new Map();
  if (a.data.householdId === 'demo' || !a.data.householdId) {
   const expiry = new Date(Date.parse(a.today) + 7 * 86400000).toISOString().slice(0,10);
   fixtures.set('sample', {record:{id:'sample', version:1, merchant:'BUYME', title:'BUYME', balanceCents:15000, balanceDate:a.today, startsOn:a.today, expiresOn:expiry, shelf:'active', hasRedemption:true}, secret:{code:'0000 0000', original:''}});
  }
  previews.set(key, fixtures);
 }
 return previews.get(key);
}

export async function voucherRequest(a, {id, method='GET', body, redeem=false}={}) {
 if (a.cloud) {
  const path = '/api/vouchers' + (id ? '/' + encodeURIComponent(id) : '') + (redeem ? '/redeem' : '');
  const response = await fetch(path, {method, cache:'no-store', headers:{
   'X-Bayit-Household':a.data.householdId, ...(body ? {'Content-Type':'application/json'} : {})
  }, body:body ? JSON.stringify(body) : undefined});
  const data = await response.json();
  if (!response.ok) throw Object.assign(Error(data.error), {code:data.code, status:response.status});
  return data;
 }
 const records = preview(a);
 if (!id) return {records:[...records.values()].map(value => value.record)};
 const existing = records.get(id);
 if (redeem) return existing?.secret || {};
 if (method === 'DELETE') {
  records.delete(id);
  return {deleted:true};
 }
 const previous = existing?.record;
 let record;
 if (method === 'POST') {
  record = {...previous, ...voucherTransition(previous, body.action, a.today)};
 } else {
  const fields = voucherFields(body);
  const balanceReviewed = body.balanceReviewed === true || previous?.balanceCents !== fields.balanceCents;
  const balanceDate = balanceReviewed ? (fields.balanceCents === null ? '' : a.today) : previous.balanceDate;
  record = {shelf:'active', ...previous, ...fields, balanceDate};
 }
 const secret = body.secret !== undefined ? voucherSecret(body.secret) : existing?.secret;
 record = {...record, id, version:(previous?.version || 0) + 1, hasRedemption:hasVoucherSecret(secret)};
 records.set(id, {record, secret});
 return {record};
}
