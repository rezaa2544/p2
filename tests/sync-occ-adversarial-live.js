'use strict';
// E3: real PostgreSQL + two HTTP listeners invoking production route factories.
// Sessions are explicit fixtures: this is NOT authentication/production certification.
const assert=require('assert/strict'),http=require('http'),crypto=require('crypto');
const {Pool}=require('pg');
const db=require('../server/db');
const {createConflicts}=require('../server/conflicts');
const factories={classes:require('../server/routes/classes').createClassRoutes,grades:require('../server/routes/grades').createGradeRoutes,attendance:require('../server/routes/attendance').createAttendanceRoutes,users:require('../server/routes/users').createUserRoutes,students:require('../server/routes/students').createStudentRoutes};
const methods={classes:'updateClass',grades:'updateGrade',attendance:'updateAttendance',users:'updateUser',students:'updateStudent'};
const url=process.env.SYNC_TEST_DATABASE_URL;
if(!url) throw Error('SYNC_TEST_DATABASE_URL required; missing real PG is failure, never skip');
process.env.PAYESH_STRICT_BASE_VERSION='1';
const schema='sync_drill_'+crypto.randomBytes(8).toString('hex');
const admin=new Pool({connectionString:url}),pool=new Pool({connectionString:url,options:'-c search_path='+schema});
let checks=0,seq=1000,servers=[];
function check(name,fn){fn();checks++;console.log(JSON.stringify({check:name,result:'PASS'}));}
const user={id:5,role:'manager',school_id:1};
const stores=[];
async function listen(){
 const store={classes:[],users:[],grades:[],attendance:[],sync_conflicts:[]};stores.push(store);
 const ctx={store,db,sessionFrom:async()=>user,markDirty(){},audit(){},ids:{nextId:async()=>++seq}};
 const conflict=createConflicts(ctx),routes={};for(const [c,f] of Object.entries(factories)){assert.equal(typeof f,'function',c);routes[c]=f(ctx);}
 const server=http.createServer(async(req,res)=>{try{let data='';for await(const part of req)data+=part;const body=data?JSON.parse(data):{};req.user=user;
  if(req.url==='/resolve')return await conflict.apiResolve(req,res,body);
  const c=req.url.slice(1);const r=await routes[c][methods[c]](req,c==='students'?12:c==='users'?11:1,body);res.writeHead(r.status,{'Content-Type':'application/json'});res.end(JSON.stringify(r.body));
 }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));servers.push(server);return 'http://127.0.0.1:'+server.address().port;
}
async function req(base,path,body){const r=await fetch(base+path,{method:path==='/resolve'?'POST':'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
async function row(table='classes',id=1){return (await pool.query('SELECT * FROM "'+table+'" WHERE id=$1',[id])).rows[0];}
async function conflict(id,version=9,incoming={name:'incoming'},extra={}){await pool.query('INSERT INTO sync_conflicts(id,collection,record_id,school_id,server_version,incoming,server_state,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,extra.collection||'classes',extra.record_id||1,extra.school_id===undefined?1:extra.school_id,version,JSON.stringify({data:incoming}),JSON.stringify({id:1,name:'historical',version}), 'open']);}
(async()=>{try{
 await admin.query('CREATE SCHEMA '+schema);db.__setPoolForTests(pool);
 await pool.query(`CREATE TABLE classes(id int primary key,school_id int,name text,version int,updated_at timestamptz);
 CREATE TABLE users(id int primary key,school_id int,role text,full_name text,version int,updated_at timestamptz);
 CREATE TABLE grades(id int primary key,school_id int,student_id int,score numeric,graded_by int,version int,updated_at timestamptz);
 CREATE TABLE attendance(id int primary key,school_id int,student_id int,status text,version int,updated_at timestamptz);
 CREATE TABLE sync_conflicts(id bigint primary key,collection text,record_id int,school_id int,user_id int,client_uid text,base_version int,server_version int,server_state jsonb,client_data jsonb,incoming jsonb,status text,winner text,resolved_by int,resolved_at timestamptz,reason text,created_at timestamptz,updated_at timestamptz);`);
 const a=await listen(),b=await listen();
 for(let round=1;round<=5;round++){
 await pool.query("TRUNCATE classes,users,grades,attendance,sync_conflicts; INSERT INTO classes VALUES(1,1,'newer',9,NOW()); INSERT INTO users VALUES(11,1,'teacher','Teacher',9,NOW()),(12,1,'student','Student',9,NOW()); INSERT INTO grades VALUES(1,1,12,20,5,9,NOW()); INSERT INTO attendance VALUES(1,1,12,'present',9,NOW());");
 for(const store of stores){store.sync_conflicts=[];store.classes=[];store.users=[];store.grades=[];store.attendance=[];}
 const bodies={classes:{name:'older'},grades:{score:3},attendance:{status:'absent'},users:{full_name:'Older'},students:{full_name:'Older'}};
 for(const c of Object.keys(bodies)){
  const missing=await req(a,'/'+c,bodies[c]);check(`r${round} ${c} missing base`,()=>assert.equal(missing.status,400,JSON.stringify(missing)));
  const stale=await req(b,'/'+c,{...bodies[c],base_version:8});check(`r${round} ${c} stale base`,()=>assert.equal(stale.status,409,JSON.stringify(stale)));
 }
 await conflict(1,2);const stale=await req(a,'/resolve',{conflict_id:1,winner:'incoming'});
 check(`r${round} stale resolution`,()=>assert.equal(stale.status,409));check(`r${round} newer data survives`,()=>assert.equal(stale.body.code,'stale_conflict'));
 assert.equal((await row()).version,9);assert.equal((await row()).name,'newer');
 const serverWins=await req(b,'/resolve',{conflict_id:1,winner:'server'});check(`r${round} server-wins reports live state`,()=>{assert.equal(serverWins.status,200);assert.equal(serverWins.body.applied_data.version,9);assert.equal(serverWins.body.applied_data.name,'newer');});
 await conflict(2);const race=await Promise.all([req(a,'/resolve',{conflict_id:2,winner:'incoming'}),req(b,'/classes',{name:'other-client',base_version:9})]);
 check(`r${round} two-client resolution/PATCH race`,()=>assert.deepEqual(race.map(x=>x.status).sort(),[200,409]));
 const winner=race[0].status===200?'incoming':'other-client';const current=await row();check(`r${round} exactly one committed mutation`,()=>{assert.equal(current.version,10);assert.equal(current.name,winner);});
 await conflict(3,10,{name:'resolved-once'});const twins=await Promise.all([req(a,'/resolve',{conflict_id:3,winner:'incoming'}),req(b,'/resolve',{conflict_id:3,winner:'incoming'})]);check(`r${round} duplicate resolution race`,()=>assert.deepEqual(twins.map(x=>x.status).sort(),[200,409]));assert.equal((await row()).version,11);
 stores[0].sync_conflicts=[{id:3,collection:'classes',record_id:1,school_id:1,server_version:11,status:'open',incoming:{data:{name:'cached-replay'}}}];
 const cacheReplay=await req(a,'/resolve',{conflict_id:3,winner:'incoming'});check(`r${round} stale cache cannot reopen DB conflict`,()=>assert.equal(cacheReplay.status,409));
 await pool.query('UPDATE classes SET school_id=2 WHERE id=1');await conflict(10,11,{name:'foreign-current-row'});
 const foreign=await req(a,'/resolve',{conflict_id:10,winner:'incoming'});check(`r${round} current target tenant enforced`,()=>assert.equal(foreign.status,403));await pool.query('UPDATE classes SET school_id=1 WHERE id=1');
 const attacks=[{id:4,data:{school_id:2,name:'foreign'},status:403},{id:5,data:{evil:'field'},status:403},{id:6,data:{id:222,name:'forged'},status:400}];
 for(const t of attacks){await conflict(t.id,11,t.data);const r=await req(a,'/resolve',{conflict_id:t.id,winner:'incoming'});check(`r${round} payload attack ${t.id}`,()=>assert.equal(r.status,t.status));}
 await conflict(7,11,{name:'resurrect'},{record_id:99});const deleted=await req(a,'/resolve',{conflict_id:7,winner:'incoming'});check(`r${round} no resurrection`,()=>assert.equal(deleted.status,409));
 await conflict(8,11,{name:'null-scope'},{school_id:null});const global=await req(a,'/resolve',{conflict_id:8,winner:'incoming'});check(`r${round} null tenant denied`,()=>assert.equal(global.status,403));
 await conflict(9,11,{name:'must-rollback'});
 await pool.query("CREATE OR REPLACE FUNCTION reject_resolution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected storage failure'; END $$; CREATE TRIGGER reject_resolution BEFORE UPDATE ON sync_conflicts FOR EACH ROW EXECUTE FUNCTION reject_resolution();");
 const cacheBeforeFailure=JSON.stringify(stores);
 const failure=await req(a,'/resolve',{conflict_id:9,winner:'incoming'});check(`r${round} persistence failure`,()=>assert.equal(failure.status,503));
 check(`r${round} failure does not mutate caches`,()=>assert.equal(JSON.stringify(stores),cacheBeforeFailure));
 check(`r${round} atomic target rollback`,()=>assert.equal(failure.body.ok,false));assert.equal((await row()).version,11);assert.equal((await pool.query('SELECT status FROM sync_conflicts WHERE id=9')).rows[0].status,'open');
 await pool.query('DROP TRIGGER reject_resolution ON sync_conflicts');const retry=await req(b,'/resolve',{conflict_id:9,winner:'incoming'});check(`r${round} retry after recovery`,()=>assert.equal(retry.status,200));assert.equal((await row()).version,12);
 }
 console.log(JSON.stringify({result:'PASS',checks,rounds:5,level:'E3 real PG/HTTP; fixture sessions, minimal schema; NOT certification'}));
}finally{for(const s of servers)await new Promise(r=>s.close(r));db.__setPoolForTests(null);await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();}})().catch(e=>{console.error(e);process.exitCode=1});