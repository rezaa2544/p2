/* ============================ persistence (mutation log) ============================ */
const LOG_KEY='sms_log_v1', SESSION_KEY='sms_session_v1', BOSS_KEY='sms_boss_v1', PERSONA_KEY='sms_persona_v1';
let log=[];
/* هنگام بازپخش لاگ یا تولید داده نمونه، صف همگام‌سازی نباید پر شود */
let SYNC_MUTED=false;
function loadLog(){try{log=JSON.parse(localStorage.getItem(LOG_KEY)||'[]');}catch(e){log=[];}}
function saveLog(){try{localStorage.setItem(LOG_KEY,JSON.stringify(log));}catch(e){}}
function applyLog(){SYNC_MUTED=true;log.forEach(e=>applyOp(e,false));SYNC_MUTED=false;}
function applyOp(op,record=true){
  const arr=db[op.c];
  if(op.t==='ins'){ if(!arr.some(x=>x.id===op.data.id)) arr.push(op.data); ids[op.c]=Math.max(ids[op.c]||0,op.data.id); }
  else if(op.t==='upd'){ const it=arr.find(x=>x.id===op.id); if(it)Object.assign(it,op.data); }
  else if(op.t==='del'){ const i=arr.findIndex(x=>x.id===op.id); if(i>-1)arr.splice(i,1); }
  if(record){
    log.push(op);saveLog();
    /* هر تغییر واقعی کاربر وارد صف همگام‌سازی با سرور می‌شود */
    if(typeof enqueueOp==='function' && !SYNC_MUTED) enqueueOp(op);
  }
}
const insert=(c,o)=>{o.id=nextId(c);applyOp({t:'ins',c,data:o});return o;};
const update=(c,id,patch)=>applyOp({t:'upd',c,id,data:patch});
const remove=(c,id)=>applyOp({t:'del',c,id});
function resetAll(){
  localStorage.removeItem(LOG_KEY);
  localStorage.removeItem(SYNC_QUEUE_KEY);
  localStorage.removeItem(SYNC_META_KEY);
  location.reload();
}
