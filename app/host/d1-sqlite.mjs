// A Cloudflare D1-compatible database on a local SQLite file (node:sqlite), for running Bayit outside Cloudflare.
// Implements the subset Bayit and @auth/d1-adapter use: prepare().bind().first/all/run/raw, batch() and exec().
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

const clean=v=>v===undefined?null:typeof v==='boolean'?(v?1:0):v instanceof ArrayBuffer?new Uint8Array(v):v;
const returnsRows=sql=>/^\s*(select|with|pragma|values)\b/i.test(sql)||/\breturning\b/i.test(sql);
const plain=row=>row&&{...row};

class Statement{
 constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args}
 bind(...args){return new Statement(this.db,this.sql,args.map(clean))}
 statement(){return this.db.statement(this.sql)}
 rows(){const started=performance.now(),results=this.statement().all(...this.args).map(plain);return {success:true,results,meta:{duration:performance.now()-started,changes:/\breturning\b/i.test(this.sql)?results.length:0,rows_read:results.length,last_row_id:0}}}
 execute(){
  if(returnsRows(this.sql))return this.rows();
  const started=performance.now(),r=this.statement().run(...this.args);
  return {success:true,results:[],meta:{duration:performance.now()-started,changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid),rows_read:0}};
 }
 async first(column){const row=this.statement().get(...this.args);if(!row)return null;return column?(row[column]??null):plain(row)}
 async all(){return this.rows()}
 async run(){return this.execute()}
 async raw(options={}){const s=this.statement(),rows=s.all(...this.args),values=rows.map(r=>Object.values(r));return options.columnNames?[s.columns?.().map(c=>c.name)||Object.keys(rows[0]||{}),...values]:values}
}

export function openD1(file){
 const db=new DatabaseSync(file),cache=new Map();
 db.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
 const handle={statement:sql=>{let s=cache.get(sql);if(!s){s=db.prepare(sql);cache.set(sql,s)}return s}};
 return {
  raw:db,
  prepare:sql=>new Statement(handle,sql),
  // Like D1, a batch runs in one transaction: all statements succeed or none do.
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=statements.map(s=>s.execute());db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}},
  async exec(sql){db.exec(sql);return {count:1,duration:0}},
  close:()=>db.close()
 };
}

// Applies app/cloud/migrations in order, once each, recorded in d1_migrations like `wrangler d1 migrations apply`.
export function migrate(d1,dir){
 const db=d1.raw;
 db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)');
 const done=new Set(db.prepare('SELECT name FROM d1_migrations').all().map(r=>r.name)),applied=[];
 for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()){
  if(done.has(name))continue;
  db.exec('BEGIN');
  try{db.exec(readFileSync(join(dir,name),'utf8'));db.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(name);db.exec('COMMIT');applied.push(name)}
  catch(error){db.exec('ROLLBACK');throw new Error('Migration '+name+' failed: '+error.message)}
 }
 return applied;
}
