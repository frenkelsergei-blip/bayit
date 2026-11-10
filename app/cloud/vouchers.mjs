import {bodyJSON, decryptKey, encryptKey, fail, json, localDate} from './util.mjs';
import {hasVoucherSecret, voucherFields, voucherSecret, voucherTransition} from '../../shared/vouchers.mjs';

export const voucherAAD = (house, owner, id) => JSON.stringify(['voucher', house, owner, id]);

const publicRecord = row => ({...JSON.parse(row.metadata), id:row.id, version:row.version, hasRedemption:!!row.has_secret});
export async function listPrivateVouchers(env, house, owner) {
 const available = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vouchers'").first();
 if (!available || !owner) return [];
 return (await env.DB.prepare('SELECT id, metadata, version, ciphertext IS NOT NULL AS has_secret FROM vouchers WHERE household_id=? AND owner_id=?').bind(house, owner).all()).results.map(publicRecord);
}

function validated(parse, value) {
 try { return parse(value); } catch (error) {
  throw Object.assign(fail('Check the voucher fields.'), {code:error.message});
 }
}

export async function handleVouchers(request, env, home, path) {
 const {user_id:owner, member_id:memberId} = home.membership;
 if (!owner || !home.state.members.some(member => member.id === memberId)) throw fail('This membership is unavailable.', 403);
 if (!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vouchers'").first()) {
  throw Object.assign(fail('Update the installation database to use vouchers.', 503), {code:'VOUCHER_SCHEMA_REQUIRED'});
 }
 const route = /^\/api\/vouchers(?:\/([0-9a-f-]{36})(\/redeem)?)?$/.exec(path);
 if (!route) throw fail('Voucher unavailable.', 404);
 const [, id, redeem] = route;
 const method = request.method;
 const {id: house} = home;
 const records = 'SELECT id, metadata, version, ciphertext IS NOT NULL AS has_secret FROM vouchers WHERE household_id=? AND owner_id=?';
 if (method === 'GET' && !id) {
  const rows = (await env.DB.prepare(records).bind(house, owner).all()).results;
  return json({records:rows.map(publicRecord)});
 }
 if (!id) throw fail('Method not allowed.', 405);
 const read = () => env.DB.prepare(records+' AND id=?').bind(house, owner, id).first();
 const existing = await read();
 if (redeem) {
  if (method !== 'GET') throw fail('Method not allowed.', 405);
  if (!existing || JSON.parse(existing.metadata).shelf !== 'active') throw fail('Voucher unavailable.', 404);
  const current = await env.DB.prepare('SELECT ciphertext FROM vouchers WHERE household_id=? AND owner_id=? AND id=? AND version=?').bind(house, owner, id, existing.version).first();
  if (!current) throw fail('Voucher changed. Open it again.', 409);
  return json(current.ciphertext ? JSON.parse(await decryptKey(current.ciphertext, env, voucherAAD(house, owner, id))) : {code:'', original:''});
 }
 if (!['PUT','POST','DELETE'].includes(method)) throw fail('Method not allowed.', 405);
 const body = await bodyJSON(request, method === 'PUT' ? 275_000 : 5000);
 if (!body || typeof body !== 'object' || !Number.isInteger(body.version)) throw fail('Refresh and try again.');
 const today = localDate();
 if (method === 'PUT' && body.version === 0) {
  if (existing) return json({record:publicRecord(existing)});
  const fields = validated(voucherFields, body);
  const secret = validated(voucherSecret, body.secret || {});
  const ciphertext = hasVoucherSecret(secret) ? await encryptKey(JSON.stringify(secret), env, voucherAAD(house, owner, id)) : null;
  const metadata = {...fields, shelf:'active', used:false, balanceDate:fields.balanceCents === null ? '' : today};
  await env.DB.prepare('INSERT OR IGNORE INTO vouchers(household_id,owner_id,id,metadata,ciphertext) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM vouchers WHERE household_id=? AND owner_id=?)<200')
   .bind(house, owner, id, JSON.stringify(metadata), ciphertext, house, owner).run();
  const saved = await read();
  if (!saved) throw Object.assign(fail('Delete an unused voucher before adding another.', 409), {code:'VOUCHER_LIMIT'});
  return json({record:publicRecord(saved)}, 201);
 }
 if (!existing) throw fail('Voucher unavailable.', 404);
 if (body.version !== existing.version) throw Object.assign(fail('Voucher changed. Refresh and try again.', 409), {code:'VOUCHER_CHANGED'});
 const previous = JSON.parse(existing.metadata);
 if (method === 'DELETE') {
  if (previous.shelf !== 'trash') throw fail('Move the voucher to Trash first.', 409);
  const result = await env.DB.prepare('DELETE FROM vouchers WHERE household_id=? AND owner_id=? AND id=? AND version=?').bind(house, owner, id, body.version).run();
  if (!result.meta.changes) throw Object.assign(fail('Voucher changed. Refresh and try again.', 409), {code:'VOUCHER_CHANGED'});
  return json({deleted:true});
 }
 let next, secretChange = false, ciphertext = null;
 if (method === 'POST') {
  next = {...previous, ...validated(record => voucherTransition(record, body.action, today), previous)};
 } else {
  if (previous.shelf === 'trash') throw fail('Restore the voucher before editing.', 409);
  const fields = validated(voucherFields, body);
  const balanceReviewed = body.balanceReviewed === true || fields.balanceCents !== previous.balanceCents;
  next = {...previous, ...fields, balanceDate:balanceReviewed ? (fields.balanceCents === null ? '' : today) : previous.balanceDate};
  if (body.secret !== undefined) {
   const secret = validated(voucherSecret, body.secret);
   secretChange = true;
   if (hasVoucherSecret(secret)) ciphertext = await encryptKey(JSON.stringify(secret), env, voucherAAD(house, owner, id));
  }
 }
 const changed = await env.DB.prepare('UPDATE vouchers SET metadata=?, ciphertext=CASE WHEN ? THEN ? ELSE ciphertext END, version=version+1 WHERE household_id=? AND owner_id=? AND id=? AND version=? RETURNING id, metadata, version, ciphertext IS NOT NULL AS has_secret')
  .bind(JSON.stringify(next), secretChange ? 1 : 0, ciphertext, house, owner, id, body.version).first();
 if (!changed) throw Object.assign(fail('Voucher changed. Refresh and try again.', 409), {code:'VOUCHER_CHANGED'});
 return json({record:publicRecord(changed)});
}
