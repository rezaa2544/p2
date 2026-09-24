'use strict';
const assert=require('assert/strict'),vm=require('vm'),fs=require('fs'),path=require('path');
const {checkOcc}=require('../server/occ');let checks=0;
function check(name,fn){fn();checks++;console.log(JSON.stringify({check:name,result:'PASS'}));}
for(let round=1;round<=5;round++){
 const saved={};const c={db:{grades:[{id:1,version:9,score:20}],classes:[{id:1,version:9,name:'new'}]},ids:{},SYNC:{queue:[]},Store:{get:k=>saved[k],getJSON:(k,d)=>saved[k]||d,set:(k,v)=>{saved[k]=v},setJSON:(k,v)=>{saved[k]=v}}};vm.createContext(c);
 for(const f of ['03-persistence.js','29-pull.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/js',f),'utf8'),c);
 c.mergeServerDelta({collections:{grades:[{id:1,version:2,score:1}]}});check(`r${round} old delta cannot rewind`,()=>{assert.equal(c.db.grades[0].version,9);assert.equal(c.db.grades[0].score,20);});
 c.SYNC.queue=[{status:'pending',op:{c:'grades',id:1,t:'upd',data:{score:20}}}];c.mergeServerDelta({full_snapshot:true,collections:{grades:[{id:1,version:10,score:1}]},deleted:[{c:'grades',id:1}]});check(`r${round} real nested offline queue survives full pull/deletion`,()=>assert.equal(c.db.grades[0].score,20));
 c.SYNC.queue=[];c.mergeServerDelta({full_snapshot:true,collections:{grades:[{id:1,version:2,score:2}]}});check(`r${round} full snapshot cannot rewind matching newer row`,()=>assert.equal(c.db.grades[0].version,9));
 c.mergeServerDelta({server_time:'2026-09-24T12:00:00Z',collections:{grades:[{id:1,version:10,score:19}]}});
 const stale=c.mergeServerDelta({server_time:'2026-09-24T11:00:00Z',full_snapshot:true,collections:{grades:[]}});check(`r${round} out-of-order full response rejected`,()=>{assert.equal(stale,false);assert.equal(c.db.grades[0].version,10);});
 const u={t:'upd',c:'classes',id:1,data:{name:'offline',version:1}};c.applyOp(u,false);check(`r${round} structural offline write captures base`,()=>{assert.equal(u.base_version,9);assert.equal(c.db.classes[0].version,10);});
 const del={t:'del',c:'classes',id:1};c.applyOp(del,false);check(`r${round} offline delete captures base before removal`,()=>{assert.equal(del.base_version,10);assert.equal(c.db.classes.length,0);});
 for(const bad of [true,false,'9',0,-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])check(`r${round} malformed version ${String(bad)}`,()=>assert.equal(checkOcc({version:9},{base_version:bad},'row',true).status,400));
}
console.log(JSON.stringify({result:'PASS',checks,rounds:5,level:'UNIT actual client source in VM; not browser persistence/network proof'}));
