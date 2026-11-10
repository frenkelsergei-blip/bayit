import {voucherReminderDue, voucherStatus} from '../../shared/vouchers.mjs';
import {inQuietHours, notificationPrefs} from './reminders.mjs';
import {listPrivateVouchers} from './vouchers.mjs';

export const voucherLink = (home, id) => '#household/vouchers?' + new URLSearchParams({home,voucher:id});

async function vouchersForMember(env, home, memberId) {
 const owner = await env.DB.prepare('SELECT user_id FROM memberships WHERE household_id=? AND member_id=?').bind(home.id,memberId).first('user_id');
 return listPrivateVouchers(env,home.id,owner);
}

export async function searchVouchers(env, home, memberId, query, date) {
 const needle = query.trim().toLocaleLowerCase().replace(/[?!.]+$/,'');
 return (await vouchersForMember(env,home,memberId))
  .filter(record => record.shelf === 'active' && !['used','expired'].includes(voucherStatus(record,date)))
  .filter(record => !needle || (record.title+' '+record.merchant).toLocaleLowerCase().includes(needle))
  .sort((a,b) => (a.expiresOn || '9999').localeCompare(b.expiresOn || '9999')).slice(0,6);
}

export async function voucherDeliveryMessages(env, home, memberId, {date,time,channel}) {
 const profile = home.state.profiles?.[memberId] || {};
 const prefs = notificationPrefs(profile);
 if (!['push','telegram'].includes(channel) || prefs.enabled === false || inQuietHours(time,prefs.quietStart,prefs.quietEnd)) return [];
 const he = profile.locale === 'he';
 const channelOptIn = channel === 'telegram' ? 'reminderTelegram' : 'reminderPush';
 return (await vouchersForMember(env,home,memberId)).filter(record => record[channelOptIn] === true && voucherReminderDue(record,date)).map(record => {
  const key = 'voucher:'+record.id+':'+record.expiresOn;
  return {key,tag:key,title:he?'שובר מתקרב לסוף התוקף':'A voucher expires soon',
   body:(prefs.previews === true ? record.title+' · ' : '')+record.expiresOn,url:voucherLink(home.id,record.id)};
 });
}
