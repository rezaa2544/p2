'use strict';
const {createConflicts}=require('/home/user/p2/server/conflicts');
const {checkOcc}=require('/home/user/p2/server/occ');
async function resolve(store, winner, db){let result;const api=createConflicts({store,db,sessionFrom:async()=>({id:1,role:'manager',school_id:1}),markDirty(){},audit(){}});await api.apiResolve({}, {setHeader(){},end(s){result={status:this.statusCode,body:JSON.parse(s)}}}, {conflict_id:1,winner});return result;}
(async()=>{
for(let run=1;run<=2;run++){
 let store={grades:[{id:1,school_id:1,score:20,version:9}],sync_conflicts:[{id:1,collection:'grades',record_id:1,school_id:1,status:'open',server_version:2,server_state:{id:1,score:10,version:2},incoming:{data:{score:11,version:1}}}]};
 const before=JSON.parse(JSON.stringify(store));const response=await resolve(store,'incoming');console.log(JSON.stringify({run,case:'A18 stale conflict rewinds newer row',before,response,after:store,breach:store.grades[0].version<9}));
 process.env.NODE_ENV='production';console.log(JSON.stringify({run,case:'A20 missing version bypass in non-grade PATCH helper',grade:checkOcc({version:9},{score:1},'grade',true),other:checkOcc({version:9},{name:'older'},'class'),breach:checkOcc({version:9},{name:'older'},'class')===null}));
 store={grades:[{id:1,school_id:1,score:20,version:2}],sync_conflicts:[{id:1,collection:'grades',record_id:1,school_id:1,status:'open',server_version:2,incoming:{data:{score:11,school_id:2}}}]};
 const errorDB={isPostgres:()=>true,persistOpsBatch:async()=>{throw Error('injected outage')},query:async()=>{throw Error('injected outage')}};
 console.log(JSON.stringify({run,case:'A18 failure falsely resolves and mutates cache',response:await resolve(store,'incoming',errorDB),after:store}));
}
})().catch(e=>{console.error(e);process.exitCode=1});
