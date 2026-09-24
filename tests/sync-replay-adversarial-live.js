'use strict';
// Real PostgreSQL data path. Session/rate-limit fixtures; no auth certification.
const assert=require('assert/strict'),crypto=require('crypto'),{Pool}=require('pg');
const db=require('../server/db'),{createSync}=require('../server/sync');
const url=process.env.SYNC_TEST_DATABASE_URL;if(!url)throw Error('SYNC_TEST_DATABASE_URL required');
const schema='replay_'+crypto.randomBytes(8).toString('hex');const admin=new Pool({connectionString:url}),pool=new Pool({connectionString:url,options:'-c search_path='+schema+' -c statement_timeout=10000'});
let count=0,id=1000;function check(n,fn){fn();count++;console.log(JSON.stringify({check:n,result:'PASS'}));}
function make(hook){const store={classes:[{id:1,school_id:1,name:'before',version:9}],announcements:[],users:[],__processed_uids:{}};const wrapped={...db,persistSyncBatch:async ops=>{if(hook)await hook(ops);return db.persistSyncBatch(ops)}};const sync=createSync({store,db:wrapped,ids:{nextId:async()=>++id},sessionFrom:async()=>({id:5,school_id:1,role:'manager'}),sendJson:(r,status,body)=>{r.reply={status,body}},audit(){},markDirty(){},MAX_BATCH:50,AT_DRIFT_MS:999999});return {store,send:async ops=>{const r={};await sync.apiSync({},r,{ops:structuredClone(ops)});return r.reply}};}
function op(uid,c='classes',t='upd',extra={}){return {uid,c,t,by:5,user_id:5,school_id:1,at:new Date().toISOString(),...(t==='upd'||t==='del'?{id:1,base_version:9}:{}),data:c==='classes'?{name:'older'}:{title:'single intention',school_id:1},...extra};}
(async()=>{try{
await admin.query('CREATE SCHEMA '+schema);db.__setPoolForTests(pool);await pool.query(`CREATE TABLE classes(id int primary key,school_id int,name text,version int,updated_at timestamptz); CREATE TABLE announcements(id int primary key,school_id int,title text,updated_at timestamptz); CREATE TABLE server_processed_uids(uid text primary key,processed_at timestamptz); CREATE TABLE sync_conflicts(id bigint primary key,collection text,record_id int,school_id int,user_id int,client_uid text,base_version int,incoming_version int,current_version int,server_version int,client_data jsonb,server_data jsonb,server_state jsonb,incoming jsonb,status text,created_at timestamptz,updated_at timestamptz);`);
for(let round=1;round<=5;round++){
 await pool.query("TRUNCATE classes,announcements,sync_conflicts,server_processed_uids; INSERT INTO classes VALUES(1,1,'before',9,NOW())");const uid=suffix=>schema+'-'+round+'-'+suffix;
 const race=make(async()=>{await pool.query("UPDATE classes SET name='newer-client-B',version=10 WHERE id=1");});const response=await race.send([op(uid('race'))]);
 check(`r${round} race final PG CAS rejects older write`,()=>assert.equal(response.status,409,JSON.stringify(response)));let row=(await pool.query('SELECT * FROM classes')).rows[0];check(`r${round} race preserves newer data`,()=>{assert.equal(row.name,'newer-client-B');assert.equal(row.version,10);});
 const collision=await make().send([op(uid('insert-collision'),'classes','ins',{data:{id:1,name:'rewind'}})]);check(`r${round} insert cannot upsert newer identity`,()=>assert.equal(collision.status,409));assert.equal((await pool.query('SELECT version FROM classes')).rows[0].version,10);
 const late=await make().send([op(uid('late'), 'classes','upd')]);check(`r${round} out-of-order older event`,()=>assert.equal(late.body.results[0].ok,false));assert.equal((await pool.query('SELECT version FROM classes')).rows[0].version,10);
 const del=make(async()=>{await pool.query('UPDATE classes SET version=11 WHERE id=1')});const dr=await del.send([op(uid('delete'),'classes','del',{base_version:10,data:{}})]);check(`r${round} raced stale delete refused`,()=>assert.equal(dr.status,409));assert.equal((await pool.query('SELECT version FROM classes')).rows[0].version,11);
 let enter,unblock,calls=0;const entered=new Promise(r=>enter=r),hold=new Promise(r=>unblock=r);
 const same=make(async()=>{if(++calls===1){enter();await hold;throw Error('injected first attempt failure');}});
 const pendingOp=op(uid('pending-duplicate'),'announcements','ins');
 const first=same.send([pendingOp]);await entered;let prematurelyAcked=false;
 const second=same.send([pendingOp]).then(r=>{prematurelyAcked=true;return r});
 await new Promise(r=>setTimeout(r,15));const early=prematurelyAcked;unblock();const pendingPair=await Promise.all([first,second]);
 check(`r${round} pending duplicate not acknowledged before commit`,()=>assert.equal(early,false));
 check(`r${round} waiting retry survives first rollback`,()=>assert.deepEqual(pendingPair.map(r=>r.status),[503,200]));
 await pool.query('TRUNCATE announcements');
 let arrivals=0,release;const barrier=new Promise(r=>release=r);const hook=async()=>{if(++arrivals===2)release();await barrier};const a=make(hook),b=make(hook);const insert=op(uid('duplicate'),'announcements','ins');const pair=await Promise.all([a.send([insert]),b.send([insert])]);
 check(`r${round} concurrent UID only one transaction commits`,()=>assert.deepEqual(pair.map(x=>x.status).sort(),[200,503]));
 check(`r${round} exactly one inserted record`,()=>assert.equal(pair.filter(x=>x.body.ok).length,1));assert.equal((await pool.query('SELECT count(*)::int n FROM announcements')).rows[0].n,1);
 const retried=await make().send([insert]);check(`r${round} duplicate retry acknowledged without reapply`,()=>{assert.equal(retried.status,200);assert.equal(retried.body.results[0].code,'duplicate_ignored');});assert.equal((await pool.query('SELECT count(*)::int n FROM announcements')).rows[0].n,1);
 // Fault AFTER data mutation but BEFORE UID persistence must roll back both.
 await pool.query("CREATE OR REPLACE FUNCTION fail_uid() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected UID persistence failure'; END $$; CREATE TRIGGER fail_uid BEFORE INSERT ON server_processed_uids FOR EACH ROW EXECUTE FUNCTION fail_uid();");
 const faultOp=op(uid('fault'),'announcements','ins');const fail=await make().send([faultOp]);check(`r${round} UID persistence failure is not success`,()=>assert.equal(fail.status,503));assert.equal((await pool.query('SELECT count(*)::int n FROM announcements')).rows[0].n,1);
 await pool.query('DROP TRIGGER fail_uid ON server_processed_uids');const retry=await make().send([faultOp]);check(`r${round} failed UID is retryable`,()=>assert.equal(retry.status,200));assert.equal((await pool.query('SELECT count(*)::int n FROM announcements')).rows[0].n,2);
}
console.log(JSON.stringify({result:'PASS',checks:count,rounds:5,level:'E3 real PG; in-process independent sync contexts; no production/auth certification'}));
}finally{db.__setPoolForTests(null);await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();}})().catch(e=>{console.error(e);process.exitCode=1});
