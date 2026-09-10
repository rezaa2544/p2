/* ============================ لایه همگام‌سازی آفلاین ============================ */
/*
  هدف: دبیر بدون اینترنت هم بتواند کار کند (حضور و غیاب، نمره، انضباط…).
  تغییرات محلی در «صف ارسال» می‌مانند و به‌محض وصل شدن اینترنت خودکار به سرور می‌روند.

  وضعیت هر عملیات:
    pending  → در صف، هنوز ارسال نشده
    sending  → در حال ارسال
    synced   → سرور تأیید کرده (از صف حذف می‌شود)
    failed   → خطا؛ با backoff دوباره تلاش می‌شود
    conflict → سرور نسخه‌ی جدیدتری دارد؛ نیاز به تصمیم کاربر

  در حالت دمو (بدون سرور) شبیه‌ساز داخلی نقش سرور را بازی می‌کند تا
  رفتار واقعی قابل مشاهده و تست باشد.
*/

const SYNC_QUEUE_KEY = 'sms_syncq_v1';
const SYNC_META_KEY  = 'sms_syncmeta_v1';
const SYNC_DLQ_KEY   = 'sms_syncdlq_v1';   /* P1-10: صفِ مردهٔ ماندگار (پس از ۵ تلاش یا خروج از سقف) */

/* P1-10 (مقیاس ملی): سقف و نگهداشتِ صفِ ارسال.
   - maxOperations: بیشینهٔ قلم‌هایِ صف (تخلیه از قدیمی‌ترینِ ترمینال‌ها؛ pending آخر)
   - maxBytes: سقفِ حجمیِ JSON صف (≈ سهمِ امن از حافظهٔ مرورگر)
   - ageLimitMs: قلم‌هایِ ترمینال (rejected/failed/conflict) قدیمی‌تر از این هرس می‌شوند؛
     دادهٔ کاربر (pending/sending) هرگز با قدمت حذف نمی‌شود
   - maxTries: پس از این تعداد تلاشِ ناموفق، قلم به DLQ می‌رود (دیگر ارسال نمی‌شود)
   - warnRatio/warnResetRatio: آستانهٔ هشدارِ «نزدیک سقف» با هیسترزیس (ضد نوسانِ پیام)
   - dlqMax: سقفِ DLQ (قدیمی‌ترین‌ها دور ریخته می‌شوند؛ شمارش در dlqDropped) */
const SYNC_QUEUE_CAPS = {
  maxOperations : 1000,
  maxBytes      : 5 * 1024 * 1024,
  ageLimitMs    : 30 * 24 * 60 * 60 * 1000,
  maxTries      : 5,
  warnRatio     : 0.8,
  warnResetRatio: 0.7,
  dlqMax        : 200,
};
const SYNC_DLQ_REASON_FA = {
  queue_overflow : 'خروج از سقفِ صف',
  expired        : 'انقضایِ نگهداشت',
  retry_exhausted: 'پایانِ ۵ تلاشِ ناموفق',
};

/* کدهایِ ردِّ پایدارِ سرور — عملیاتِ «مسموم»: دوباره‌ارسال بی‌فایده است.
   (دور ۸۵, P0-2) op به وضعیت rejected می‌رود و از چرخهٔ ارسال خارج
   می‌شود تا صف سالم‌ها را نگیرد؛ کاربر در پنلِ همگام‌سازی می‌بیند
   و می‌تواند حذفش کند. ردِ گذرا (مثل virtual_day یا 401 نشست) این‌جا
   نیست — همان «failed» با backoff می‌ماند. */
const SYNC_DEAD_CODES = {
  field_denied: 1, malformed_op: 1, role_denied: 1, out_of_scope: 1,
  forged_by: 1, user_mismatch: 1, school_mismatch: 1,
  /* R96 — ردِّ پایدارِ دروازهٔ فیلد/مدلِ مجوز */
  unknown_field: 1, unknown_collection: 1, role_escalation: 1, ownership_forge: 1,
  /* R95 (بند ۲.۵): ردِّ پایدارِ نسخه‌ای — دوباره‌ارسال بی‌فایده است
     (conflict_preserved → با مدیر داوری می‌شود؛ stale_base → نسخهٔ
     سرور تازه‌تر است). */
  conflict_preserved: 1, stale_base: 1,
  /* لایهٔ مقدار (validate.js): مقدارِ نامعتبر با تکرار درست نمی‌شود —
     dead-letter (وگرنه تا ابد failed → retry می‌ماند). */
  validation_failed: 1,
  /* دور ۱۰۰ (نقصِ ۱): تک‌عملیاتی که حتی تنها هم ۴۱۳ می‌خورد ذاتاً از
     سقفِ سرور بزرگ‌تر است — تکرار بی‌فایده، dead-letter با پیامِ روشن */
  oversized_op: 1
};

const SYNC = {
  queue      : [],          /* عملیات منتظر ارسال */
  online     : (typeof navigator !== 'undefined') ? navigator.onLine !== false : true,
  syncing    : false,
  lastSync   : null,        /* آخرین همگام‌سازی موفق (ISO) */
  lastError  : null,
  attempts   : 0,
  demoMode   : true,        /* تا وقتی سرور واقعی وصل نشده */
  serverUrl  : '',          /* مثلاً '/api/sync' */
  autoTimer  : null,
  conflicts  : [],
  progress   : null,        /* دور ۱۰۰: پیشرفتِ ارسالِ تکه‌تکه {done,total} */
  dlq        : [],          /* P1-10: صفِ مرده (پس از ۵ تلاش / خروج از سقف) */
  capWarned  : false,       /* P1-10: هشدارِ «نزدیک سقف» داده شده؟ (هیسترزیس) */
  dlqDropped : 0,           /* P1-10: قلم‌هایِ دورریخته‌شده از DLQیِ پر */
};

/* ---------- ذخیره‌سازی صف ---------- */
function loadQueue(){
  try{ SYNC.queue = Store.getJSON(SYNC_QUEUE_KEY, []) || []; }
  catch(e){ SYNC.queue = []; }
  /* W7-1 (موج ۷): احیایِ sendingِ بی‌پاسخ. اگر مرورگر وسطِ ارسال کرش کرده
     (یا تب بسته شده)، قلم‌ها با وضعیتِ sending ذخیره مانده‌اند و syncNow
     فقط pending/failed را برمی‌دارد — بدونِ این احیا، برایِ همیشه می‌ماندند
     و نشانگر هم «همگام»ِ دروغین نشان می‌داد. قلمِ sending هرگز پاسخی نگرفته
     پس pending شدنش امن است؛ اگر رویِ سرور اعمال شده بود، تکراریِ uid با
     duplicate_ignored همگام می‌شود (S2-1). */
  var revived = 0;
  for(var i = 0; i < SYNC.queue.length; i++){
    if(SYNC.queue[i] && SYNC.queue[i].status === 'sending'){ SYNC.queue[i].status = 'pending'; revived++; }
  }
  if(revived) saveQueue();
  try{ SYNC.dlq = Store.getJSON(SYNC_DLQ_KEY, []) || []; }   /* P1-10 */
  catch(e){ SYNC.dlq = []; }
  try{
    const m = Store.getJSON(SYNC_META_KEY, {}) || {};
    SYNC.lastSync = m.lastSync || null;
  }catch(e){}
}
function saveQueue(){
  /* در عملیات انبوه (batchWrites) ذخیره‌سازی به پایان دسته موکول می‌شود؛
     وگرنه هر عملیات کل صف را دوباره JSON.stringify می‌کند و هزینه
     درجه‌دوم می‌شود. پرچم در 03-persistence.js مدیریت می‌شود. */
  if(typeof _BATCH_DEPTH !== 'undefined' && _BATCH_DEPTH > 0){ _BATCH_QUEUE_DIRTY = true; return true; }
  return Store.setJSON(SYNC_QUEUE_KEY, SYNC.queue);   /* P1-10: خروجی false یعنی حافظهٔ مرورگر پر است */
}
function saveSyncMeta(){
  Store.setJSON(SYNC_META_KEY, { lastSync: SYNC.lastSync });
}

/* ---------- P1-10: سقف، نگهداشت و صفِ مرده ---------- */
function saveDlq(){
  Store.setJSON(SYNC_DLQ_KEY, SYNC.dlq);
}
function queueBytes(){
  try{ return JSON.stringify(SYNC.queue).length; }catch(e){ return 0; }
}
/* نسبتِ اشغالِ صف نسبت به سقف (بزرگ‌ترینِ نسبتِ تعدادی و حجمی) */
function queueRatio(){
  return Math.max(
    SYNC.queue.length / SYNC_QUEUE_CAPS.maxOperations,
    queueBytes() / SYNC_QUEUE_CAPS.maxBytes);
}
/* انتقالِ قلم به صفِ مرده (دیگر ارسال نمی‌شود؛ در پنل دیده و حذف می‌شود) */
function moveToDlq(item, reason){
  SYNC.queue = SYNC.queue.filter(function(x){ return x.uid !== item.uid; });
  item.dead_at     = new Date().toISOString();
  item.dead_reason = reason;
  item.status      = 'rejected';
  if(!item.error) item.error = SYNC_DLQ_REASON_FA[reason] || reason;
  SYNC.dlq.push(item);
  while(SYNC.dlq.length > SYNC_QUEUE_CAPS.dlqMax){ SYNC.dlq.shift(); SYNC.dlqDropped++; }
  saveDlq();
}
/* انتخابِ قربانیِ تخلیه: اول rejected، بعد failed، بعد conflict، بعد sending، آخر pending؛
   در هر گروه قدیمی‌ترین. فقط وقتی ۱- می‌دهد که صف خالی باشد. */
function pickEvictIndex(){
  var rank = { rejected: 0, failed: 1, conflict: 2, sending: 3, pending: 4 };
  var best = -1, bestRank = 99, bestTime = Infinity;
  for(var i=0;i<SYNC.queue.length;i++){
    var x = SYNC.queue[i];
    var r = (rank[x.status] !== undefined) ? rank[x.status] : 5;
    var t = Date.parse(x.created_at); if(isNaN(t)) t = Infinity;
    if(r < bestRank || (r === bestRank && t < bestTime)){ bestRank = r; bestTime = t; best = i; }
  }
  return best;
}
/* هرسِ قلم‌هایِ ترمینالِ قدیمی (rejected/failed/conflict). دادهٔ کاربر
   (pending/sending) و قلم‌هایِ بی‌زمان هرگز هرس نمی‌شوند. خروجی: تعدادِ هرس‌شده. */
function pruneAgedOps(){
  var cutoff = Date.now() - SYNC_QUEUE_CAPS.ageLimitMs;
  var before = SYNC.queue.length;
  SYNC.queue = SYNC.queue.filter(function(x){
    if(x.status === 'pending' || x.status === 'sending') return true;
    var t = Date.parse(x.created_at);
    if(isNaN(t)) return true;
    return t >= cutoff;
  });
  return before - SYNC.queue.length;
}
/* اعمالِ سقفِ تعدادی و حجمی؛ قلم‌هایِ بیرون‌رانده به DLQ می‌روند. خروجی: تعدادِ منتقل‌شده. */
function enforceQueueCaps(){
  pruneAgedOps();
  var moved = 0, guard = 0, idx;
  while(SYNC.queue.length > SYNC_QUEUE_CAPS.maxOperations && guard++ < 1200){
    idx = pickEvictIndex();
    if(idx < 0) break;
    moveToDlq(SYNC.queue[idx], 'queue_overflow'); moved++;
  }
  guard = 0;
  while(SYNC.queue.length && queueBytes() > SYNC_QUEUE_CAPS.maxBytes && guard++ < 1200){
    idx = pickEvictIndex();
    if(idx < 0) break;
    moveToDlq(SYNC.queue[idx], 'queue_overflow'); moved++;
  }
  if(moved){ saveQueue(); refreshSyncBadge(); }
  return moved;
}
/* ثبتِ یک تلاشِ ناموفق؛ پس از maxTries قلم به DLQ می‌رود. خروجی: 'dead' یا 'failed'. */
function noteOpFailed(item, msg){
  item.tries += 1;
  item.error = msg;
  if(item.tries >= SYNC_QUEUE_CAPS.maxTries){
    moveToDlq(item, 'retry_exhausted');
    return 'dead';
  }
  item.status = 'failed';
  return 'failed';
}
/* هشدارِ «نزدیک سقف» با هیسترزیس: یک‌بار در عبور از warnRatio، ریست زیرِ warnResetRatio */
function checkCapWarning(){
  var r = queueRatio();
  if(r >= SYNC_QUEUE_CAPS.warnRatio && !SYNC.capWarned){
    SYNC.capWarned = true;
    toast('صفِ ارسال نزدیکِ سقف است — آنلاین شوید و همگام کنید تا چیزی از دست نرود', 'warn');
    refreshSyncBadge();
  }else if(r < SYNC_QUEUE_CAPS.warnResetRatio && SYNC.capWarned){
    SYNC.capWarned = false;
    refreshSyncBadge();
  }
}
/* ذخیره‌سازیِ مقاوم در برابرِ پرشدنِ حافظهٔ مرورگر: اول قلم‌هایِ ترمینالِ
   قدیمی حذف می‌شوند (نه دادهٔ کاربر) و یک‌بار دیگر تلاش می‌شود. */
function saveQueueChecked(){
  if(saveQueue()) return true;
  var weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  SYNC.queue = SYNC.queue.filter(function(x){
    if(x.status === 'pending' || x.status === 'sending') return true;
    if(x.status === 'rejected') return false;
    var t = Date.parse(x.created_at);
    return isNaN(t) || t >= weekAgo;
  });
  if(saveQueue()){
    toast('حافظهٔ مرورگر پر بود — مواردِ قدیمیِ ردشده پاک شدند؛ داده‌هایِ شما سالم است', 'warn');
    refreshSyncBadge();
    return true;
  }
  toast('حافظهٔ مرورگر پر است — تغییراتِ جدید ذخیره نشد؛ صف را خلوت کنید', 'err', { sticky: true });
  return false;
}

/* ---------- افزودن عملیات به صف ---------- */
/* هر تغییر داده‌ای که باید به سرور برود از اینجا رد می‌شود */
function enqueueOp(op){
  /* R96 P0-5: کلیدهایِ محلی (idِ ریکوردِ کلاینت + by که در سطحِ op هست)
     جزوِ schema نیستند — دروازهٔ فیلدِ سرور آن‌ها را unknown_field می‌داند.
     نسخهٔ پاک می‌رود (رکوردهایِ دمو دست‌نخورده می‌مانند). */
  if(op && op.data && (op.data.id !== undefined || op.data.by !== undefined)){
    const clean = {};
    for(const k in op.data){
      if(k === 'id' || k === 'by') continue;
      clean[k] = op.data[k];
    }
    op = Object.assign({}, op, { data: clean });
  }
  const item = {
    uid       : 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    op        : op,
    status    : 'pending',
    tries     : 0,
    error     : null,
    created_at: new Date().toISOString(),
    user_id   : (S.user && S.user.id) || null,
    school_id : (S.user && S.user.school_id) || null,
  };
  SYNC.queue.push(item);
  enforceQueueCaps();         /* P1-10: سقفِ تعدادی/حجمی + هرسِ قدمت */
  saveQueueChecked();         /* P1-10: مقاوم در برابرِ پرشدنِ حافظه */
  checkCapWarning();          /* P1-10: هشدارِ «نزدیک سقف» */
  refreshSyncBadge();         /* نشانگر بدون رندر کامل به‌روز شود */
  scheduleSync(400);          /* اگر آنلاین بود، خیلی زود ارسال شود */
  return item;
}

/* ---------- شمارنده‌ها ---------- */
const pendingCount  = () => SYNC.queue.filter(x => x.status === 'pending' || x.status === 'failed').length;
const conflictCount = () => SYNC.queue.filter(x => x.status === 'conflict').length;
const rejectedCount = () => SYNC.queue.filter(x => x.status === 'rejected').length + SYNC.dlq.length;   /* P1-10: مرده‌ها همه‌شان (صف + DLQ) */

/* ---------- تشخیص آنلاین/آفلاین ---------- */
function setOnline(v){
  const was = SYNC.online;
  SYNC.online = !!v;
  if(!was && SYNC.online){
    toast('اینترنت وصل شد — در حال ارسال تغییرات…', 'ok');
    SYNC.attempts = 0;
    scheduleSync(300);
  }else if(was && !SYNC.online){
    const n = pendingCount();
    toast(n ? `آفلاین شدید — ${fa(n)} تغییر ذخیره شد و بعداً ارسال می‌شود` : 'آفلاین شدید — تغییرات محلی ذخیره می‌شوند', 'warn');
  }
  refreshSyncBadge();
}

/* ---------- زمان‌بندی و backoff ---------- */
function scheduleSync(delay){
  clearTimeout(SYNC.autoTimer);
  SYNC.autoTimer = setTimeout(syncNow, delay || 1000);
}
function backoffDelay(){
  /* ۲ثانیه، ۴، ۸، ۱۶… تا سقف ۵ دقیقه */
  return Math.min(2000 * Math.pow(2, Math.min(SYNC.attempts, 8)), 300000);
}

/* ---------- ارسال به سرور ---------- */
async function syncNow(manual){
  if(SYNC.syncing) return;
  const batch = SYNC.queue.filter(x => x.status === 'pending' || x.status === 'failed');
  if(!batch.length){
    if(manual) toast('همه‌چیز همگام است ✓', 'ok');
    return;
  }
  if(!SYNC.online){
    if(manual) toast('اینترنت در دسترس نیست — تغییرات در صف می‌مانند', 'warn');
    return;
  }

  SYNC.syncing = true;
  SYNC.lastError = null;
  batch.forEach(x => { x.status = 'sending'; });
  saveQueue();
  refreshSyncBadge();

  try{
    const res = await sendChunked(batch);

    /* W7-2 (موج ۷): «آخرین همگام‌سازی موفق» فقط وقتی جلو می‌رود که دست‌کم
       یک قلم واقعاً همگام شده باشد (ok یا duplicate_ignored) — پیش‌تر پس
       از هر اجرا جلو می‌رفت، حتی با صفرِ همگام (تازگیِ دروغین در پنل). */
    let syncedN = 0;
    res.forEach(r => {
      const item = SYNC.queue.find(x => x.uid === r.uid);
      if(!item) return;
      if(r.ok){
        item.status = 'synced'; syncedN++;
      }else if(r.conflict){
        item.status = 'conflict';
        item.error  = r.message || 'تعارض با نسخه سرور';
        item.server = r.server;
      }else if(r.code === 'duplicate_ignored'){
        /* uid قبلاً اعمال شده (ارسال دوباره پس از قطعی) — روی سرور
           همان تغییری هست که ما می‌خواستیم؛ صف را نگیراند. */
        item.status = 'synced';
      }else if(r.code === 'conflict_preserved' || r.code === 'stale_base'){
        /* R95 (بند ۲.۵): ردِّ پایدارِ نسخه‌ای — تگ مناسب + پیامِ روشن:
           تعارض «حفظ» شده و مدیر مدرسه باید داوری کند (conflict)، یا
           نسخهٔ سرور تازه‌تر است (rejected). */
        item.status = (r.code === 'conflict_preserved') ? 'conflict' : 'rejected';
        item.error  = (r.code === 'conflict_preserved')
          ? 'تغییر هم‌زمان روی سرور حفظ شد — مدیر مدرسه باید داوری کند'
          : 'سرور نسخهٔ تازه‌تری از این رکورد دارد — تغییر اعمال نشد';
      }else if(SYNC_DEAD_CODES[r.code]){
        /* ردِّ پایدار — دوباره‌ارسال بی‌فایده است (P0-2) */
        item.status = 'rejected';
        item.error  = r.message || 'رد سرور';
      }else{
        noteOpFailed(item, r.message || 'خطای نامشخص');   /* P1-10: پس از ۵ تلاش ← DLQ */
      }
    });

    /* W7-1 (موج ۷): جارویِ پس‌ازدسته. اگر پاسخِ سرور برایِ بعضی قلم‌ها نتیجه
       نداشت (results ناقص/خالی)، آن‌ها sending می‌ماندند و درونِ همین جلسه
       می‌چسبیدند — حالا failedِ گذرا می‌شوند تا دوباره تلاش شود (پس از ۵ بار:
       DLQِ مرئی، نه چسبندگیِ نامرئی). */
    batch.forEach(x => {
      if(x.status === 'sending') noteOpFailed(x, 'پاسخِ سرور برایِ این تغییر ناقص بود');
    });

    /* موارد موفق (و duplicates) از صف حذف می‌شوند */
    SYNC.queue = SYNC.queue.filter(x => x.status !== 'synced');
    if(syncedN > 0){ SYNC.lastSync = new Date().toISOString(); saveSyncMeta(); }   /* W7-2 */
    saveQueue();

    const okCount   = res.filter(r => r.ok).length;
    const conflictCount = res.filter(r => !r.ok && r.code === 'conflict_preserved').length; /* R95 */
    const deadCount = res.filter(r => !r.ok && (r.code === 'duplicate_ignored' || SYNC_DEAD_CODES[r.code])).length - conflictCount;
    const bad       = res.length - okCount - deadCount - conflictCount; /* فقط خطاهایِ قابلِ تلاشِ دوباره */
    if(okCount){
      const extra = (deadCount ? ` — ${fa(deadCount)} رد شد` : '')
        + (conflictCount ? ` — ${fa(conflictCount)} تعارض` : '')
        + (bad ? ` — ${fa(bad)} ناموفق` : '');
      if(manual || bad || deadCount || conflictCount) toast(`${fa(okCount)} تغییر ارسال شد${extra}`, (bad || deadCount || conflictCount) ? 'warn' : 'ok');
      else toast(`${fa(okCount)} تغییر همگام شد ✓`, 'ok');
    }else if(manual && (conflictCount || deadCount)){
      /* R95: کل دسته رد/تعارض شد (هیچ موردی همگام نشد) — کاربر باید بداند */
      toast(`${fa(conflictCount || deadCount)} تغییر همگام نشد`
        + (conflictCount ? ` — ${fa(conflictCount)} تعارض با نسخهٔ سرور؛ مدیر مدرسه باید داوری کند` : ''),
        'err', { icon: 'warn', sticky: true });
    }else if(manual && bad){
      /* دور ۱۰۰: شکستِ انتقالیِ همه (رفتارِ پیشینِ مسیرِ catch) */
      toast('ارسال ناموفق — دوباره تلاش می‌شود', 'err');
    }

    SYNC.attempts = bad ? SYNC.attempts + 1 : 0;
    if(bad) scheduleSync(backoffDelay());

  }catch(err){
    /* شکست کل دسته — همه failed می‌شوند (پس از ۵ تلاش: DLQ) تا دوباره تلاش شود */
    batch.forEach(x => { if(x.status === 'sending') noteOpFailed(x, err.message); });   /* P1-10 */
    SYNC.lastError = err.message;
    SYNC.attempts += 1;
    saveQueue();
    if(manual) toast('ارسال ناموفق — دوباره تلاش می‌شود', 'err');
    scheduleSync(backoffDelay());
  }finally{
    SYNC.syncing = false;
    SYNC.progress = null; /* دور ۱۰۰: پایانِ نمایشِ پیشرفت */
    refreshSyncBadge();
  }
}

/* ---------- ارسال واقعی یا شبیه‌سازی ----------
   🔴 TODO پیش از اتصال به سرور — احراز هویت و دادهٔ حساس
   محموله شامل کد ملی و تلفن است. پیش از فعال شدن این مسیر:
   ۱. فقط روی HTTPS با گواهی معتبر (TLS 1.2 به بالا)
   ۲. ژتون نشست در کوکی HttpOnly + Secure + SameSite=Lax
      — نه در سرآیند و نه در حافظهٔ مرورگر، تا XSS نتواند بدزددش
   ۳. سرور باید op.by را با کاربر احراز هویت‌شدهٔ ژتون بسنجد و اگر
      نخواند کل دسته را رد کند — فیلد by از مرورگر می‌آید و ادعاست
   ۴. uid تکراری دوباره اعمال نشود (ارسال دوباره پس از قطعی)
   ⚠️ کد ملی هرگز در نشانی درخواست نیاید، فقط در بدنهٔ POST — نشانی
   در گزارش سرور و حافظهٔ نهان میانی می‌ماند.
   📄 docs/SERVER_SECURITY_CONTRACT.md بندهای ۲ تا ۴ */
/* ---------- ارسالِ تکه‌تکه + تقسیمِ بازگشتیِ ۴۱۳ (دور ۱۰۰، نقصِ ۱) ----------
   سرور بیش از ۵۰۰ op در یک درخواست را 413 می‌کند (batch_too_large) و
   بدنهٔ بیش از ۱MB را هم 413 می‌کند (body_too_large). ارسالِ یک‌جایِ
   صفِ بزرگ ⇒ حلقهٔ ابدیِ «۴۱۳ ← failed ← تلاشِ دوباره». راه‌حل:
   ۱) تکه‌هایِ ۲۰۰تایی (حاشیهٔ امن زیرِ سقفِ ۵۰۰). ۲) اگر تکه‌ای ۴۱۳
   خورد، نصفش کن و دوباره (بازگشتی تا ۱). ۳) تک‌opای که باز ۴۱۳ خورد
   ذاتاً از سقف بزرگ‌تر است ⇒ dead-letter ‏(oversized_op) با پیامِ روشن. */
const SYNC_CHUNK = 200;
const SYNC_413_CODES = { batch_too_large: 1, body_too_large: 1, http_413: 1 };

/* ارسالِ تکه‌تکهٔ یک دسته با تقسیمِ بازگشتیِ ۴۱۳.
   خروجی: یک نتیجه برایِ هر قلمِ batch (به‌ترتیبِ پایان).
   - برایِ ۴۱۳ هرگز throw نمی‌کند (تکه می‌شود یا dead-letter).
   - خطایِ انتقالی (قطعیِ شبکه و…): نتیجهٔ مصنوعیِ failed برایِ قلم‌هایِ
     ارسال‌نشده — رفتارِ امروزِ مسیرِ catch، ولی نتیجهٔ تکه‌هایِ موفق
     از دست نمی‌رود. */
async function sendChunked(batch){
  const out = [];
  const pend = [];
  for(let i=0;i<batch.length;i+=SYNC_CHUNK) pend.push(batch.slice(i,i+SYNC_CHUNK));
  const total = batch.length;
  while(pend.length){
    const chunk = pend.shift();
    SYNC.progress = { done: out.length, total: total };
    refreshSyncBadge();
    let res;
    try{
      res = await sendBatch(chunk);
    }catch(err){
      if(is413Error(err) && chunk.length > 1){ splitPush(pend, chunk); continue; }
      if(is413Error(err)){ out.push(oversizedResult(chunk[0])); continue; }
      /* خطایِ انتقالی: این تکه + همهٔ تکه‌هایِ مانده ⇒ failed */
      const rest = [chunk].concat(pend.splice(0));
      rest.forEach(function(c){ c.forEach(function(x){
        out.push({ uid:x.uid, ok:false, code:'send_failed', message:String((err&&err.message)||err) });
      });});
      break;
    }
    if(is413Results(res) && chunk.length > 1){ splitPush(pend, chunk); continue; }
    if(is413Results(res)){ out.push(oversizedResult(chunk[0])); continue; }
    for(let k=0;k<res.length;k++) out.push(res[k]);
  }
  SYNC.progress = { done: out.length, total: total };
  refreshSyncBadge();
  return out;
}
/* نصف‌کردنِ تکهٔ ۴۱۳خورده — اولِ صف (عمق‌اول: ترتیبِ opها حفظ می‌شود) */
function splitPush(pend, chunk){
  const half = Math.ceil(chunk.length/2);
  pend.unshift(chunk.slice(0,half), chunk.slice(half));
}
/* ردِّ سطحِ دسته (نه سطحِ op): همهٔ نتایج ۴۱۳ — sendBatch برایِ ۴۱۳
   به‌ازایِ هر op یک {ok:false, code:413...} می‌سازد */
function is413Results(res){
  return !!(res && res.length && res.every(function(r){ return r && !r.ok && SYNC_413_CODES[r.code]; }));
}
/* دفاعِ عمقی: ۴۱۳ای که به‌جایِ نتیجه، throw شده باشد (پراکسی و…) */
function is413Error(err){
  const m = String((err&&err.message)||err||'');
  return /413|too[_ -]?large|payload/i.test(m);
}
function oversizedResult(item){
  return { uid:item.uid, ok:false, code:'oversized_op',
    message:'حجم این تغییر از سقفِ سرور بیشتر است و همگام نشد — رکوردِ محلی سالم است' };
}

async function sendBatch(batch){
  if(!SYNC.demoMode && SYNC.serverUrl){
    /* ارسال از راه لایهٔ داده انجام می‌شود، نه fetch مستقیم — تا روز
       اتصال به سرور واقعی، سرآیند احراز هویت و مدیریت خطا یک‌جا در
       Api.request تعریف شود و اینجا دست نخورد.
       raw:true (P0-2): ردِ کل دسته (400/403) بدنهٔ معناداری دارد؛
       بدون raw، Api.request می‌انداخت و کل دسته برای همیشه در چرخهٔ
       «failed → retry» می‌ماند. */
    const raw = await Api.request(SYNC.serverUrl, {
      method: 'POST',
      body  : { ops: batch.map(x => ({ uid: x.uid, ...x.op })) },
      raw   : true
    });
    if(raw.status < 300){
      return (raw.body && raw.body.results) || [];
    }
    if(raw.status >= 500) throw new Error('خطای سرور ' + raw.status + ' در ' + SYNC.serverUrl);
    const code = (raw.body && raw.body.code) || 'http_' + raw.status;
    /* 401 = نشستِ ناکام — گذرا؛ بعد از ورودِ دوباره دوباره تلاش می‌شود */
    if(raw.status === 401 || code === 'no_session') throw new Error('نشست سرور معتبر نیست (401)');
    /* 400/403 = ردِّ پایدارِ کل دسته → هر op به‌صورتِ ردِ پایدار
       برمی‌گردد تا dead-letter آن را از صفِ ارسال جدا کند */
    return batch.map(x => ({ uid: x.uid, ok: false, code: code, message: (raw.body && raw.body.message) || 'رد سرور' }));
  }

  /* حالت دمو: تأخیر شبکه را شبیه‌سازی می‌کند */
  await new Promise(r => setTimeout(r, 500 + Math.random() * 700));
  if(!SYNC.online) throw new Error('اتصال قطع شد');
  return batch.map(x => ({ uid: x.uid, ok: true }));
}

/* ---------- نشانگر وضعیت در نوار بالا ---------- */
function syncBadge(){
  const n  = pendingCount();
  const cf = conflictCount();
  const rd = rejectedCount();
  const nearCap = queueRatio() >= SYNC_QUEUE_CAPS.warnRatio;   /* P1-10 */

  if(!SYNC.online){
    return `<button class="sync-chip off" data-act="sync-panel" title="آفلاین — تغییرات ذخیره می‌شوند${nearCap?' — ⚠️ صف نزدیک سقف است':''}">
      <span class="dot"></span><span>آفلاین</span>${n ? `<span class="badge b-amber sm">${fa(n)}</span>` : ''}${nearCap?'<span class="badge b-red sm">⚠️</span>':''}</button>`;
  }
  if(SYNC.syncing){
    /* دور ۱۰۰ (نقصِ ۱): نمایشِ پیشرفتِ ارسالِ تکه‌تکه */
    const pg = (SYNC.progress && SYNC.progress.total)
      ? `<span class="badge b-blue sm">${fa(SYNC.progress.done)}/${fa(SYNC.progress.total)}</span>` : '';
    return `<button class="sync-chip busy" data-act="sync-panel" title="در حال همگام‌سازی">
      <span class="spin"></span><span>همگام‌سازی…</span>${pg}</button>`;
  }
  if(cf || rd){
    const lab = (cf && rd) ? 'تعارض و رد' : (cf ? 'تعارض' : 'رد شده');
    return `<button class="sync-chip warn" data-act="sync-panel" title="نیاز به بررسی">
      <span class="dot"></span><span>${lab}</span>${cf ? `<span class="badge b-red sm">${fa(cf)}</span>` : ''}${rd ? `<span class="badge b-red sm">${fa(rd)}</span>` : ''}</button>`;
  }
  if(n){
    return `<button class="sync-chip pend" data-act="sync-panel" title="${escAttr(fa(n))} تغییر در صف ارسال${nearCap?' — ⚠️ نزدیک سقف':''}">
      <span class="dot"></span><span>در صف</span><span class="badge b-amber sm">${fa(n)}</span>${nearCap?'<span class="badge b-red sm">⚠️</span>':''}</button>`;
  }
  return `<button class="sync-chip ok" data-act="sync-panel" title="همه‌چیز همگام است">
    <span class="dot"></span><span>همگام</span></button>`;
}

/* فقط نشانگر را به‌روز می‌کند — بدون رندر مجدد کل صفحه */
function refreshSyncBadge(){
  const el = document.querySelector('.sync-chip');
  if(!el) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = syncBadge();
  const fresh = tmp.firstElementChild;
  if(fresh) el.replaceWith(fresh);
}

/* ---------- پنجره جزئیات همگام‌سازی ---------- */
function syncPanelModal(){
  const q  = SYNC.queue;
  const n  = pendingCount();
  const cf = conflictCount();
  const rd = rejectedCount();
  const nearCap = queueRatio() >= SYNC_QUEUE_CAPS.warnRatio;   /* P1-10 */

  const label = {
    ins: 'ثبت جدید', upd: 'ویرایش', del: 'حذف',
  };
  const collFa = {
    attendance:'حضور و غیاب', grades:'نمرات', discipline:'انضباط', users:'کاربران',
    schools:'مدارس', classes:'کلاس‌ها', subjects:'دروس', leaves:'مرخصی',
    announcements:'اطلاعیه‌ها', messages:'پیام‌ها', installments:'اقساط',
    transactions:'تراکنش‌ها', exams:'امتحانات', schedule:'برنامه هفتگی',
  };

  const statusFa = {
    pending :['در صف','b-amber'], sending:['در حال ارسال','b-blue'],
    failed  :['ناموفق','b-red'],  conflict:['تعارض','b-red'],
    rejected:['رد شده','b-red'],
  };

  const body = `
    <div class="row" style="gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <span class="badge ${SYNC.online?'b-green':'b-gray'}">${SYNC.online?'🌐 آنلاین':'📴 آفلاین'}</span>
      ${n ?`<span class="badge b-amber">${fa(n)} تغییر در صف</span>`:'<span class="badge b-green">همه‌چیز همگام است</span>'}
      ${cf?`<span class="badge b-red">${fa(cf)} تعارض</span>`:''}
      ${rd?`<span class="badge b-red" title="عملیات‌هایی که سرور آن‌ها را به‌صورتِ پایدار رد کرده است — دوباره ارسال نمی‌شوند">${fa(rd)} رد شده</span>`:''}
      ${nearCap?'<span class="badge b-red">⚠️ نزدیکِ سقفِ صف</span>':''}
      <div class="spacer"></div>
      <span class="small muted">آخرین همگام‌سازی: ${SYNC.lastSync?jalaliDateTime(SYNC.lastSync):'—'}</span>
    </div>

    ${!SYNC.online?`<div class="sync-note" style="margin-bottom:10px">
      بدون اینترنت هم می‌توانید کار کنید. همه‌ی تغییرات روی همین دستگاه ذخیره می‌شوند و
      به‌محض وصل شدن اینترنت، خودکار به سرور ارسال می‌گردند.</div>`:''}

    ${q.length?`<div class="table-wrap vscroll" style="max-height:320px;overflow:auto"><table>
      <thead><tr><th>عملیات</th><th>بخش</th><th>زمان</th><th>وضعیت</th></tr></thead><tbody>
      ${q.slice().reverse().map(x=>{
        const st=statusFa[x.status]||['—','b-gray'];
        return `<tr>
          <td><b>${label[x.op.t]||x.op.t}</b></td>
          <td>${esc(collFa[x.op.c]||x.op.c)}</td>
          <td class="small muted">${jalaliDateTime(x.created_at)}</td>
          <td><span class="badge ${st[1]}">${st[0]}</span>
            ${x.error?`<div class="small muted">${esc(x.error)}</div>`:''}
            ${x.tries>1?`<div class="small muted">${fa(x.tries)} تلاش</div>`:''}
            ${x.status==='rejected'?`<div style="margin-top:6px"><button class="btn ghost sm" data-act="sync-del" data-uid="${escAttr(x.uid)}" title="این عملیات دوباره ارسال نمی‌شود؛ اگر مطمئنید لازم نیست، حذفش کنید">حذف از صف</button></div>`:''}
          </td>
        </tr>`;}).join('')}
      </tbody></table></div>`
    :`<div class="empty" style="padding:24px"><span class="emoji">✅</span>
       <h4>صف ارسال خالی است</h4><div class="small">همه‌ی تغییرات با سرور همگام شده‌اند.</div></div>`}

    ${SYNC.dlq.length?`<div class="table-wrap vscroll" style="max-height:160px;overflow:auto;margin-top:10px"><table>
      <thead><tr><th>عملیاتِ مرده (دیگر ارسال نمی‌شود)</th><th>علت</th><th></th></tr></thead><tbody>
      ${SYNC.dlq.slice().reverse().slice(0,50).map(x=>{const xo=x.op||{};
        return `<tr>
          <td><b>${label[xo.t]||xo.t||'—'}</b> — ${esc(collFa[xo.c]||xo.c||'—')}
            <div class="small muted">${jalaliDateTime(x.dead_at)}${x.tries>1?` — ${fa(x.tries)} تلاش`:''}</div>
            ${x.error?`<div class="small muted">${esc(x.error)}</div>`:''}</td>
          <td class="small">${esc(SYNC_DLQ_REASON_FA[x.dead_reason]||x.dead_reason||'—')}</td>
          <td style="white-space:nowrap"><button class="btn ghost sm" data-act="sync-retry" data-uid="${escAttr(x.uid)}" title="برگرداندن به صفِ ارسال با شمارشِ تازه (برایِ دفنِ گذرا: قطعی یا سقف)">تلاش دوباره</button>
            <button class="btn ghost sm" data-act="sync-del" data-uid="${escAttr(x.uid)}">حذف</button></td>
        </tr>`;}).join('')}
      </tbody></table></div>
      ${SYNC.dlqDropped?`<div class="small muted" style="margin-top:6px">⚠️ ${fa(SYNC.dlqDropped)} موردِ قدیمیِ صفِ مرده به‌خاطرِ سقف دور ریخته شد.</div>`:''}`:''}

    <div class="small muted" style="margin-top:12px">
      ${SYNC.demoMode?'⚙️ حالت دمو: سرور واقعی متصل نیست و ارسال شبیه‌سازی می‌شود.':''}
    </div>`;

  openModal(`<div class="card-head"><h3>وضعیت همگام‌سازی</h3>
      <button class="icon-btn" data-act="modal-close">✕</button></div>
    <div class="card-body">${body}</div>
    <div class="card-head" style="border-bottom:none;border-top:1px solid var(--border)">
      ${SYNC.demoMode?`<button class="btn ghost sm" data-act="sync-toggle-net">${SYNC.online?'📴 شبیه‌سازی قطع اینترنت':'🌐 شبیه‌سازی وصل شدن'}</button>`:''}
      <div class="spacer"></div>
      ${n?`<button class="btn" data-act="sync-run">🔄 ارسال همه</button>`:''}
      <button class="btn ghost" data-act="modal-close">بستن</button>
    </div>`);
}

/* تاریخ و ساعت شمسی خوانا — توجه: fa() فقط برای عدد است، نه رشته */
function jalaliDateTime(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '—';
  const time = faD(String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'));
  return isoToJalali(d.toISOString()) + ' — ' + time;
}

/* ---------- اکشن‌ها ---------- */
const SYNC_ACTIONS = {
  'sync-panel'(){ syncPanelModal(); },
  'sync-run'(){ closeModal(); syncNow(true); },
  'sync-toggle-net'(){ closeModal(); setOnline(!SYNC.online); },
  /* حذفِ دستیِ عملیاتِ «رد شده» (dead-letter) از صف.
     (SYNC_ACTIONS برخلافِ A با (el, id) فراخوانی می‌شود.) */
  /* W7-3 (موج ۷): تلاشِ دوبارهٔ قلمِ مرده. DLQ فقط «حذف» داشت و قلمِ دفنِ
     گذرا (قطعیِ مکرر/سقفِ صف — داده‌ای که سرور هرگز ندیده) هیچ مسیرِ
     بازگشتی نداشت. حالا با شمارشِ تازه به صف برمی‌گردد و در چرخهٔ عادی
     ارسال می‌شود؛ سقف‌ها دوباره اعمال می‌شوند و دوبار-کلیک ورودیِ تکراری
     نمی‌سازد. */
  'sync-retry'(el){
    const uid = (el && el.dataset) ? el.dataset.uid : null;
    if(!uid) return;
    const idx = SYNC.dlq.findIndex(x => x.uid === uid);
    if(idx < 0) return;
    const item = SYNC.dlq[idx];
    SYNC.dlq.splice(idx, 1);
    if(!SYNC.queue.some(x => x.uid === uid)){
      item.status = 'pending';
      item.tries = 0;
      item.error = null;
      delete item.dead_at;
      delete item.dead_reason;
      SYNC.queue.push(item);
      enforceQueueCaps();
    }
    saveQueueChecked(); saveDlq();
    checkCapWarning(); refreshSyncBadge();
    toast('عملیات به صفِ ارسال برگشت', 'ok');
    scheduleSync(400);
    syncPanelModal();
  },
  'sync-del'(el){
    const uid = (el && el.dataset) ? el.dataset.uid : null;
    if(!uid) return;
    const before = SYNC.queue.length + SYNC.dlq.length;
    SYNC.queue = SYNC.queue.filter(x => x.uid !== uid);
    SYNC.dlq   = SYNC.dlq.filter(x => x.uid !== uid);   /* P1-10: حذف از صفِ مرده هم */
    if(SYNC.queue.length + SYNC.dlq.length === before) return;
    saveQueue(); saveDlq();
    refreshSyncBadge();
    toast('عملیاتِ ردشده از صف حذف شد', 'ok');
    syncPanelModal();
  },
};

/* ---------- راه‌اندازی ---------- */
function initSync(){
  loadQueue();
  if(pruneAgedOps()) saveQueue();   /* P1-10: هرسِ قلم‌هایِ ترمینالِ قدیمیِ جلسه‌هایِ پیش */
  if(typeof window !== 'undefined'){
    window.addEventListener('online',  () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
  }
  /* اگر چیزی از جلسه‌ی قبل در صف مانده، تلاش کن بفرستی */
  if(pendingCount() && SYNC.online) scheduleSync(1500);
}
