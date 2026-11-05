// The Node/Docker host adapters: a D1-compatible SQLite database and an R2-compatible file folder.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

let sqlite=null;try{sqlite=await import('node:sqlite')}catch{}
const skip=!sqlite&&'node:sqlite unavailable';

test('D1 adapter: bind, first, all, run meta and transactional batch', {skip}, async()=>{
 const {openD1}=await import('../app/host/d1-sqlite.mjs'),db=openD1(':memory:');
 await db.exec('CREATE TABLE t(id TEXT PRIMARY KEY, n INTEGER, flag INTEGER)');
 const r=await db.prepare('INSERT INTO t VALUES(?,?,?)').bind('a',1,true).run();
 assert.equal(r.meta.changes,1);assert.equal(r.success,true);
 assert.equal((await db.prepare('INSERT OR IGNORE INTO t VALUES(?,?,?)').bind('a',2,false).run()).meta.changes,0);
 assert.deepEqual(await db.prepare('SELECT * FROM t WHERE id=?').bind('a').first(),{id:'a',n:1,flag:1});
 assert.equal(await db.prepare('SELECT n FROM t WHERE id=?').bind('a').first('n'),1);
 assert.equal(await db.prepare('SELECT * FROM t WHERE id=?').bind('zz').first(),null);
 await db.prepare('INSERT INTO t VALUES(?,?,?)').bind('b',undefined,null).run();
 assert.equal((await db.prepare('SELECT * FROM t ORDER BY id').all()).results.length,2);
 await assert.rejects(db.batch([db.prepare('UPDATE t SET n=9 WHERE id=?').bind('a'),db.prepare('INSERT INTO t VALUES(?,?,?)').bind('a',3,0)]),/UNIQUE/);
 assert.equal(await db.prepare('SELECT n FROM t WHERE id=?').bind('a').first('n'),1,'a failed batch changes nothing');
 const out=await db.batch([db.prepare('UPDATE t SET n=n+1').bind(),db.prepare('SELECT COUNT(*) c FROM t').bind()]);
 assert.equal(out[0].meta.changes,2);assert.equal(out[1].results[0].c,2);
});

test('migrations run in order, once each', {skip}, async()=>{
 const {openD1,migrate}=await import('../app/host/d1-sqlite.mjs'),db=openD1(':memory:'),dir=new URL('../app/cloud/migrations',import.meta.url).pathname;
 const first=migrate(db,dir);assert.ok(first.includes('0001.sql')&&first.includes('0006_finance_connections.sql'));
 assert.deepEqual(migrate(db,dir),[],'nothing runs twice');
 assert.ok(await db.prepare("SELECT name FROM sqlite_master WHERE name='finance_connections'").first());
});

test('file store keeps content and type, and refuses paths outside its folder', async()=>{
 const {openFileStore}=await import('../app/host/file-store.mjs'),files=openFileStore(mkdtempSync(join(tmpdir(),'bayit-files-')));
 await files.put('households/h1/doc',new TextEncoder().encode('hello'),{httpMetadata:{contentType:'application/pdf'}});
 const got=await files.get('households/h1/doc');assert.equal(await new Response(got.body).text(),'hello');assert.equal(got.httpMetadata.contentType,'application/pdf');assert.equal(got.size,5);
 assert.equal(await files.get('households/h1/missing'),null);
 await assert.rejects(files.put('../escape','x'),/Invalid file key/);
 await files.delete('households/h1/doc');assert.equal(await files.get('households/h1/doc'),null);
});
