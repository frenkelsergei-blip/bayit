// A real database session for delivery fixtures. Production has no fallback for unbound subscriptions.
export async function bindTestSession(DB,household,member){
 const user=(await DB.prepare('SELECT user_id FROM memberships WHERE household_id=? AND member_id=?').bind(household,member).first())?.user_id||member;
 await DB.prepare('INSERT OR IGNORE INTO users(id,name,email) VALUES(?,?,?)').bind(user,member,member+'@example.test').run();
 await DB.prepare('INSERT OR IGNORE INTO memberships(household_id,user_id,member_id,role,created_at) VALUES(?,?,?,\'parent\',?)').bind(household,user,member,new Date().toISOString()).run();
 const id=crypto.randomUUID();await DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) VALUES(?,?,?,?)').bind(id,'fixture-'+id,user,new Date(Date.now()+86400000).toISOString()).run();
 await DB.prepare('UPDATE push_subscriptions SET session_id=? WHERE household_id=? AND member_id=?').bind(id,household,member).run();return id;
}
