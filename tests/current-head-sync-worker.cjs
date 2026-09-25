'use strict';
// Disposable HTTP host for CURRENT production modules. Fixed sessions, no auth claim.
const http=require('http'),{Pool}=require('pg'),path=require('path');
const root=process.env.REPO_ROOT, db=require(path.join(root,'server/db'));
const pool=new Pool({connectionString:process.env.SYNC_DATABASE_URL,options:'-c search_path='+process.env.LAB_SCHEMA,application_name:'arena-current-'+process.env.WORKER_LABEL});db.__setPoolForTests(pool);
const store={};const user={id:5,role:'manager',school_id:1};
async function hydrate(){for(const c of ['classes','users','grades','attendance','announcements','sync_conflicts'])store[c]=(await pool.query('SELECT * FROM "'+c+'"')).rows;store.schools=[{id:1},{id:2}];store.__processed_uids={};store.__server_version=0;}
(async()=>{await hydrate();let reqNow;
const ctx={store,db,sessionFrom:async()=>user,ids:{nextId:async()=>Number((await pool.query("SELECT nextval('lab_ids') n")).rows[0].n)},MAX_BATCH:100,AT_DRIFT_MS:86400000,audit(){},markDirty(){},sendJson:(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))}};
const sync=require(path.join(root,'server/sync')).createSync(ctx),conflicts=require(path.join(root,'server/conflicts')).createConflicts(ctx);
const spec={classes:['createClassRoutes','updateClass'],users:['createUserRoutes','updateUser'],students:['createStudentRoutes','updateStudent'],grades:['createGradeRoutes','updateGrade'],attendance:['createAttendanceRoutes','updateAttendance']};const routes={};for(const c in spec)routes[c]=require(path.join(root,'server/routes',c))[spec[c][0]](ctx);
const server=http.createServer(async(req,res)=>{try{
 if(req.url==='/lab'){
  const fs=require('fs');
  const seed={classes:(await pool.query('SELECT * FROM classes')).rows,announcements:(await pool.query('SELECT * FROM announcements')).rows};
  const source=['00-data-layer.js','03-persistence.js','27-sync.js'].map(f=>fs.readFileSync(path.join(root,'src/js',f),'utf8')).join('\n');
  const setup='var db='+JSON.stringify(seed)+'; var ids={classes:1,announcements:1}; var S={user:{id:5,role:"manager",school_id:1}}; var fa=String,esc=String; var toast=function(){};';
  res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Real client modules / fixture session</title><script>'+setup+'\n'+source.replace(/<\/script/gi,'<\\/script')+'\nDATA_MODE="server"; SYNC.demoMode=false; SYNC.serverUrl="/api/sync"; loadQueue();<'+ '/script>');
 }
 const end=res.end.bind(res);if(req.headers['x-lab-hold-response']==='1')res.end=body=>{process.send({event:'held',status:res.statusCode,body:JSON.parse(body)});};
 let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};req.user=user;
 if(req.url==='/api/sync')return await sync.apiSync(req,res,body);
 if(req.url==='/api/sync/resolve-conflict')return await conflicts.apiResolve(req,res,body);
 const match=req.url.match(/^\/api\/v1\/(classes|users|students|grades|attendance)\/(\d+)$/);
 if(match && req.method==='PATCH'){const result=await routes[match[1]][spec[match[1]][1]](req,Number(match[2]),body);res.statusCode=result.status;return res.end(JSON.stringify(result.body));}
 res.statusCode=404;res.end('{}');
}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});
process.on('message',async m=>{if(m==='hydrate'){await hydrate();process.send({event:'hydrated'});}});
server.listen(0,'127.0.0.1',()=>process.send({event:'ready',port:server.address().port}));
})().catch(e=>{console.error(e);process.exitCode=1});
