'use strict';
const {chromium}=require('playwright');
module.exports=async function({A,B,reset,req,target,record}){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 for(let round=1;round<=5;round++){
  await reset();const a=await browser.newContext(),b=await browser.newContext();const pa=await a.newPage(),pb=await b.newPage();const errors=[];pb.on('pageerror',e=>errors.push(e.message));
  await pa.goto(A.base+'/lab');await pb.goto(B.base+'/lab');
  await b.setOffline(true);await pb.evaluate(()=>{SYNC.online=false;update('classes',1,{name:'offline-old'});clearTimeout(SYNC.autoTimer)});
  const queued=await pb.evaluate(()=>JSON.parse(localStorage.getItem('sms_syncq_v1')));
  await pa.evaluate(async()=>{update('classes',1,{name:'online-new'});clearTimeout(SYNC.autoTimer);SYNC.online=true;await syncNow();clearTimeout(SYNC.autoTimer)});
  const before=await target('classes');await b.setOffline(false);await pb.evaluate(async()=>{SYNC.online=true;await syncNow();clearTimeout(SYNC.autoTimer)});const after=await target('classes');const finalQueue=await pb.evaluate(()=>JSON.parse(localStorage.getItem('sms_syncq_v1')));
  record(round,'browser','two contexts offline/reconnect actual client queue','base9 retained; A v10 wins; B stale retained rejected',{queued,before,after,finalQueue,errors},queued.length===1&&queued[0].op.base_version===9&&before.name==='online-new'&&after.name==='online-new'&&after.version===10&&finalQueue.length===1&&['rejected','conflict'].includes(finalQueue[0].status)&&errors.length===0);
  await a.close();await b.close();
  await reset();const c=await browser.newContext();const pc=await c.newPage();await pc.goto(A.base+'/lab');await c.setOffline(true);await pc.evaluate(()=>{SYNC.online=false;update('announcements',1,{title:'first'});update('announcements',1,{title:'second'});clearTimeout(SYNC.autoTimer)});const beforeReload=await pc.evaluate(()=>JSON.parse(localStorage.getItem('sms_syncq_v1')));await c.setOffline(false);await pc.reload();const afterReload=await pc.evaluate(()=>JSON.parse(localStorage.getItem('sms_syncq_v1')));await pc.evaluate(async()=>{SYNC.online=true;await syncNow();clearTimeout(SYNC.autoTimer)});const afterBatch=await target('announcements');const remaining=await pc.evaluate(()=>SYNC.queue.length);
  record(round,'browser','offline dependent LWW edits survive reload','same UIDs/bases9,10; final second v11; queue empty',{beforeReload,afterReload,afterBatch,remaining},beforeReload.map(x=>x.op.base_version).join(',')==='9,10'&&JSON.stringify(beforeReload)===JSON.stringify(afterReload)&&afterBatch.title==='second'&&afterBatch.version===11&&remaining===0);await c.close();
  await reset();const d=await browser.newContext();const pd=await d.newPage();await pd.goto(A.base+'/lab');await d.setExtraHTTPHeaders({'x-lab-hold-response':'1'});
  await pd.evaluate(()=>{update('announcements',1,{title:'crash-committed'});clearTimeout(SYNC.autoTimer)});
  const held=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('browser lost-ACK barrier timeout')),10000);function listener(m){if(m.event==='held'){A.off('message',listener);clearTimeout(timer);resolve(m)}}A.on('message',listener)});
  const sending=pd.evaluate(async()=>{SYNC.online=true;await syncNow()}).catch(e=>e.message);const response=await held;const durableSending=await pd.evaluate(()=>JSON.parse(localStorage.getItem('sms_syncq_v1')));
  const session=await d.newCDPSession(pd);const crashed=pd.waitForEvent('crash',{timeout:10000});session.send('Page.crash').catch(()=>{});await crashed;await sending;await pd.close();await d.setExtraHTTPHeaders({});const recovered=await d.newPage();await recovered.goto(A.base+'/lab');const revived=await recovered.evaluate(()=>SYNC.queue.map(x=>({uid:x.uid,status:x.status,base:x.op.base_version})));await recovered.evaluate(async()=>{SYNC.online=true;await syncNow();clearTimeout(SYNC.autoTimer)});const durableTarget=await target('announcements');const queueLength=await recovered.evaluate(()=>SYNC.queue.length);
  record(round,'browser','renderer crash after commit before ACK','sending persisted; revived same UID/base; replay once v10; empty queue',{response,durableSending,revived,durableTarget,queueLength},durableSending[0]?.status==='sending'&&revived[0]?.status==='pending'&&revived[0]?.uid===durableSending[0]?.uid&&revived[0]?.base===9&&durableTarget.title==='crash-committed'&&durableTarget.version===10&&queueLength===0);await d.close();
 }
 }finally{await browser.close()}
};
