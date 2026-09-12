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
const BGSYNC_TAG     = 'payesh-sync-queue'; /* W8-1: برچسبِ Background Sync — هم‌نام با sw.js */

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
  quotaWarned: false,       /* W8-4: هشدارِ «نزدیکِ سهمیهٔ مرورگر» داده شده؟ (هیسترزیس) */
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
/* Wave 24 (فاز کلاینت): queueBytes در هر رندر (از مسیرِ syncBadge →
   queueRatio) کلِ صف را stringify می‌کرد — با صفِ چندصدتایی داغ‌ترین
   تابعِ کلاینت بود (~۴۴۰ms در پروفایلِ ۲۵ رندر). کش با کلیدِ
   (مرجعِ آرایه + طول + TTL کوتاه):
   - هر حذف/تخلیه، آرایه را با filter نو می‌سازد → مرجع عوض می‌شود →
     بازمحاسبه؛ پس حلقهٔ enforceQueueCaps همیشه مقدارِ تازه می‌بیند.
   - push طول را عوض می‌کند → بازمحاسبه.
   - تغییرِ وضعیتِ درجا (failed→pending) فقط چند بایت جابه‌جا می‌کند؛
     TTL ۲۵۰ms همان را هم به‌سرعت تازه می‌کند (مصرفش فقط نشانگر است). */
var _QB_CACHE = { ref: null, len: -1, at: 0, val: 0 };
function queueBytes(){
  try{
    var q = SYNC.queue, now = Date.now();
    if(_QB_CACHE.ref === q && (now - _QB_CACHE.at) < 250){
      if(_QB_CACHE.len === q.length) return _QB_CACHE.val;
      if(q.length > _QB_CACHE.len){
        /* push فقط انتها اضافه می‌کند (هیچ‌جا درجِ میانی نداریم) —
           فقط قلم‌های تازه شمرده می‌شوند، نه کل صف. ‏(+۱ تقریبِ کامای
           جداکننده؛ برای گیت/هشدارِ سقف بیش‌برآوردِ امن است.) */
        var v2 = _QB_CACHE.val;
        for(var i=_QB_CACHE.len;i<q.length;i++) v2 += JSON.stringify(q[i]).length + 1;
        _QB_CACHE.len = q.length; _QB_CACHE.val = v2;
        return v2;
      }
      /* کوچک‌شدن = filter/حذف — مرجع معمولاً عوض می‌شود؛ محاسبهٔ کامل */
    }
    var v = JSON.stringify(q).length;
    _QB_CACHE.ref = q; _QB_CACHE.len = q.length;
    _QB_CACHE.at = now; _QB_CACHE.val = v;
    return v;
  }catch(e){ return 0; }
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
  checkStorageQuota();        /* W8-4: پایشِ سهمیهٔ ذخیره‌سازیِ مرورگر (async) */
  refreshSyncBadge();         /* نشانگر بدون رندر کامل به‌روز شود */
  bgMirrorQueue();            /* W8-1: آینهٔ IDB برایِ Background Sync */
  bgRegisterSync();           /* W8-1: اگر تب بسته شد، مرورگر خودش بفرستد */
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
        /* W8-2: نسخهٔ سرور (اگر بود) نگه داشته می‌شود تا کاربر بتواند
           دو نسخه را روبه‌رویِ هم ببیند (مودالِ «کدام نسخه برنده شد») */
        if(r.server) item.server = r.server;
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
    /* W7-6 (موج ۷، نشست ۴): backoffِ خودکار باید قلم‌هایِ failedِ باقی‌مانده در
       صف را هم ببیند. پیش‌تر فقط `bad` (که از نتایجِ res حساب می‌شد) شرطِ
       زمان‌بندی بود؛ قلم‌هایی که جارویِ W7-1 (پاسخِ ناقصِ سرور) failed
       می‌کند در res نیستند، پس `bad` صفر می‌ماند، شمارندهٔ attempts ریست
       می‌شد و هیچ تلاشِ خودکاری زمان‌بندی نمی‌شد — قلمِ failed تا یک محرکِ
       بیرونی (آنلاین‌شدن/کلیکِ دستی/opِ تازه) زمین‌گیر می‌ماند. حالا هر
       قلمِ failedِ باقی در صف (قابلِ تلاشِ دوباره؛ قلم‌هایِ DLQ از صف
       جدا شده‌اند) هم زمان‌بندی را فعال می‌کند. */
    const retryable = SYNC.queue.some(x => x.status === 'failed');
    SYNC.attempts = (bad || retryable) ? SYNC.attempts + 1 : 0;
    if(bad || retryable) scheduleSync(backoffDelay());

  }catch(err){
    if(err && err.code === 'sync_backpressure'){
      /* فاز ۴: opها sending ماندند → به pending برمی‌گردند (هیچ‌چیز از دست
         نمی‌رود، شمارندهٔ DLQ هیچ‌چیز نمی‌شمرد چون noteOpFailed صدا نمی‌شود).
         تلاشِ بعدی = حداکثرِ مُهرِ سرور (retry_after_s) و backoffِ نمایی. */
      batch.forEach(x => { if(x.status === 'sending') x.status = 'pending'; });
      SYNC.lastError = 'سرور زیر فشار است — کمی بعد دوباره ارسال می‌شود';
      SYNC.attempts += 1;
      const wait = Math.max((err.retryAfterS || 0) * 1000, backoffDelay());
      saveQueue();
      if(manual) toast('سرور زیر فشار است — کمی بعد دوباره تلاش می‌شود', 'warn');
      scheduleSync(wait);
      return;
    }
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
    bgMirrorQueue();      /* W8-1: آینهٔ IDB با نتیجهٔ این دور تازه شود */
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
      /* فاز ۴: 429/backpressure به‌کل دسته برمی‌گردد — تکه‌تکه‌کردن بی‌فایده
         است (سقفِ نرخ روی مجموعِ opهاست، نه اندازهٔ تکه)؛ خطا عیناً به
         syncNow می‌رود تا opها pending بمانند و با retry_afterِ سرور دوباره
         بیایند. */
      if(err && err.code === 'sync_backpressure') throw err;
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
    /* فاز ۴ (backpressure): 429 = سرور زیرِ فشار — گذرا و با مُهرِ زمانیِ
       سرور؛ نه dead-letter، نه شمارشِ به‌عنوانِ خطای op. کل دسته دست‌نخورده
       در صف می‌ماند و syncNow با retry_afterِ سرور زمان‌بندی می‌شود. */
    if(raw.status === 429 || code === 'sync_backpressure'){
      const ra = Math.max(0, Number(raw.body && raw.body.retry_after_s) || 0);
      const e = new Error('سرور زیر فشار است (429)');
      e.code = 'sync_backpressure';
      e.retryAfterS = ra;
      throw e;
    }
    /* 400/403 = ردِّ پایدارِ کل دسته → هر op به‌صورتِ ردِ پایدار
       برمی‌گردد تا dead-letter آن را از صفِ ارسال جدا کند */
    return batch.map(x => ({ uid: x.uid, ok: false, code: code, message: (raw.body && raw.body.message) || 'رد سرور' }));
  }

  /* حالت دمو: تأخیر شبکه را شبیه‌سازی می‌کند */
  await new Promise(r => setTimeout(r, 500 + Math.random() * 700));
  if(!SYNC.online) throw new Error('اتصال قطع شد');
  return batch.map(x => ({ uid: x.uid, ok: true }));
}

/* ---------- W8-3: تفکیکِ صف و زمانِ نسبی برایِ نشانگرِ آفلاین ---------- */
/* شمارشِ صفِ در انتظار به تفکیکِ نوعِ عملیات: {ins, upd, del, total} */
function queueBreakdown(){
  var b = { ins: 0, upd: 0, del: 0, total: 0 };
  SYNC.queue.forEach(function(x){
    if(x.status !== 'pending' && x.status !== 'failed') return;
    var t = (x.op && x.op.t) || '';
    if(b[t] !== undefined) b[t]++;
    b.total++;
  });
  return b;
}
/* زمانِ نسبیِ خوانا: «۳ دقیقه پیش»، «همین حالا»، «۲ ساعت پیش» */
function syncRelTime(iso){
  if(!iso) return null;
  var t = Date.parse(iso);
  if(isNaN(t)) return null;
  var s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if(s < 60)      return 'همین حالا';
  if(s < 3600)    return fa(Math.floor(s / 60)) + ' دقیقه پیش';
  if(s < 86400)   return fa(Math.floor(s / 3600)) + ' ساعت پیش';
  return fa(Math.floor(s / 86400)) + ' روز پیش';
}
/* تخمینِ زمانِ همگام‌سازیِ صف: هر تکهٔ ۲۰۰تایی ≈ یک رفت‌وبرگشت (~۱.۵ ثانیه
   در دمو/شبکهٔ معمول). تخمین است، نه قول — فقط برایِ حسِ انتظارِ کاربر. */
function estimateSyncSeconds(){
  var n = pendingCount();
  if(!n) return 0;
  var chunks = Math.ceil(n / SYNC_CHUNK);
  return Math.max(2, Math.round(chunks * 1.5));
}
function estimateSyncFa(){
  var s = estimateSyncSeconds();
  if(!s) return null;
  if(s < 60) return 'حدود ' + fa(s) + ' ثانیه';
  return 'حدود ' + fa(Math.ceil(s / 60)) + ' دقیقه';
}
/* خلاصهٔ تفکیکِ صف به فارسی: «۵ ثبت، ۲ حذف» */
function queueBreakdownFa(){
  var b = queueBreakdown();
  var parts = [];
  if(b.ins) parts.push(fa(b.ins) + ' ثبت');
  if(b.upd) parts.push(fa(b.upd) + ' ویرایش');
  if(b.del) parts.push(fa(b.del) + ' حذف');
  return parts.join('، ');
}

/* ---------- نشانگر وضعیت در نوار بالا ---------- */
function syncBadge(){
  const n  = pendingCount();
  const cf = conflictCount();
  const rd = rejectedCount();
  const nearCap = queueRatio() >= SYNC_QUEUE_CAPS.warnRatio;   /* P1-10 */

  if(!SYNC.online){
    /* W8-3: tooltip با تفکیکِ صف + آخرین همگام‌سازی + تخمین */
    const bk = queueBreakdownFa();
    const rel = syncRelTime(SYNC.lastSync);
    const est = estimateSyncFa();
    const tip = 'آفلاین — تغییرات ذخیره می‌شوند'
      + (bk ? ' — در صف: ' + bk : '')
      + (rel ? ' — آخرین همگام‌سازی: ' + rel : '')
      + (est ? ' — ارسال پس از اتصال: ' + est : '')
      + (nearCap ? ' — ⚠️ صف نزدیک سقف است' : '');
    return `<button class="sync-chip off" data-act="sync-panel" title="${escAttr(tip)}">
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

  /* W8-3: تفکیکِ صف + زمانِ نسبی + تخمینِ ارسال */
  const bk  = queueBreakdownFa();
  const rel = syncRelTime(SYNC.lastSync);
  const est = estimateSyncFa();

  const body = `
    <div class="row" style="gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <span class="badge ${SYNC.online?'b-green':'b-gray'}">${SYNC.online?'🌐 آنلاین':'📴 آفلاین'}</span>
      ${n ?`<span class="badge b-amber" title="${escAttr(bk)}">${fa(n)} تغییر در صف${bk?` (${bk})`:''}</span>`:'<span class="badge b-green">همه‌چیز همگام است</span>'}
      ${cf?`<span class="badge b-red">${fa(cf)} تعارض</span>`:''}
      ${rd?`<span class="badge b-red" title="عملیات‌هایی که سرور آن‌ها را به‌صورتِ پایدار رد کرده است — دوباره ارسال نمی‌شوند">${fa(rd)} رد شده</span>`:''}
      ${nearCap?'<span class="badge b-red">⚠️ نزدیکِ سقفِ صف</span>':''}
      <div class="spacer"></div>
      <span class="small muted" title="${escAttr(SYNC.lastSync?jalaliDateTime(SYNC.lastSync):'')}">آخرین همگام‌سازی: ${rel||(SYNC.lastSync?jalaliDateTime(SYNC.lastSync):'—')}</span>
    </div>
    ${n&&est?`<div class="small muted" style="margin-bottom:10px">⏱️ زمانِ تخمینیِ ارسال${SYNC.online?'':' پس از اتصال'}: ${est}</div>`:''}

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
            ${(x.status==='conflict'||x.status==='rejected')?`<div style="margin-top:6px">
              <button class="btn ghost sm" data-act="sync-conflict-view" data-uid="${escAttr(x.uid)}" title="نسخهٔ شما و نسخهٔ سرور روبه‌رویِ هم — ببینید کدام برنده شد">⚖️ مقایسهٔ دو نسخه</button>
              ${x.status==='rejected'?`<button class="btn ghost sm" data-act="sync-del" data-uid="${escAttr(x.uid)}" title="این عملیات دوباره ارسال نمی‌شود؛ اگر مطمئنید لازم نیست، حذفش کنید">حذف از صف</button>`:''}</div>`:''}
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
      <button class="icon-btn" data-act="modal-close" aria-label="بستن">✕</button></div>
    <div class="card-body">${body}</div>
    <div class="card-head" style="border-bottom:none;border-top:1px solid var(--border)">
      ${SYNC.demoMode?`<button class="btn ghost sm" data-act="sync-toggle-net">${SYNC.online?'📴 شبیه‌سازی قطع اینترنت':'🌐 شبیه‌سازی وصل شدن'}</button>`:''}
      <button class="btn ghost sm" data-act="sync-quota" title="مصرفِ حافظهٔ مرورگر و پاک‌سازیِ انتخابی">🗄️ حافظه</button>
      <div class="spacer"></div>
      ${n?`<button class="btn" data-act="sync-run">🔄 ارسال همه</button>`:''}
      <button class="btn ghost" data-act="modal-close">بستن</button>
    </div>`);
}

/* ---------- W8-4: مدیریتِ سهمیهٔ ذخیره‌سازی (Storage Quota) ----------
   اگر IndexedDB/حافظهٔ مرورگر به سهمیه نزدیک شود، نوشتن‌هایِ بعدی
   ساکت شکست می‌خورند و دادهٔ آفلاینِ کاربر از دست می‌رود. این بخش:
   ۱) با navigator.storage.estimate سهمیه را می‌پاید (هیسترزیس مثلِ
      هشدارِ سقفِ صف تا پیام نوسان نکند)،
   ۲) هشدارِ روشن به کاربر می‌دهد،
   ۳) مودالِ «پاک‌سازیِ انتخابی» می‌گشاید: صفِ مرده، قلم‌هایِ ترمینالِ
      کهنه — دادهٔ ارسال‌نشدهٔ کاربر (pending/sending) هرگز گزینه نیست. */
var STORAGE_QUOTA_WARN  = 0.85;   /* آستانهٔ هشدار: ۸۵٪ سهمیه */
var STORAGE_QUOTA_RESET = 0.70;   /* هیسترزیس: ریستِ هشدار زیرِ ۷۰٪ */

/* تخمینِ سهمیه — promise؛ در نبودِ API «ناشناخته» برمی‌گردد (بی‌هشدار) */
function storageQuotaEstimate(){
  return new Promise(function(resolve){
    try{
      if(typeof navigator !== 'undefined' && navigator.storage &&
         typeof navigator.storage.estimate === 'function'){
        navigator.storage.estimate().then(function(est){
          var usage = est.usage || 0, quota = est.quota || 0;
          resolve({ usage: usage, quota: quota,
            ratio: quota > 0 ? usage / quota : 0, known: quota > 0 });
        }).catch(function(){ resolve({ usage:0, quota:0, ratio:0, known:false }); });
        return;
      }
    }catch(e){}
    resolve({ usage:0, quota:0, ratio:0, known:false });
  });
}
/* پایشِ سهمیه — پس از هر enqueue صدا می‌شود؛ async و بی‌هزینه برایِ مسیرِ نوشتن */
function checkStorageQuota(){
  storageQuotaEstimate().then(function(est){
    if(!est.known) return;
    if(est.ratio >= STORAGE_QUOTA_WARN && !SYNC.quotaWarned){
      SYNC.quotaWarned = true;
      toast('حافظهٔ مرورگر نزدیکِ سهمیه است (' + fa(Math.round(est.ratio * 100)) + '٪) — از پنلِ همگام‌سازی پاک‌سازی کنید تا داده‌ای از دست نرود', 'warn');
    }else if(est.ratio < STORAGE_QUOTA_RESET && SYNC.quotaWarned){
      SYNC.quotaWarned = false;
    }
  });
}
/* برچسبِ خوانایِ بایت — مستقل از ماژولِ کلاسِ مجازی */
function quotaSizeFa(bytes){
  if(bytes == null || isNaN(bytes)) return '—';
  var mb = bytes / 1048576;
  if(mb >= 1024) return fa(Math.round(mb / 102.4) / 10) + ' گیگابایت';
  if(mb >= 1)    return fa(Math.round(mb * 10) / 10) + ' مگابایت';
  var kb = bytes / 1024;
  if(kb >= 1)    return fa(Math.round(kb)) + ' کیلوبایت';
  return fa(Math.round(bytes)) + ' بایت';
}
/* پاک‌سازیِ انتخابی ۱: کلِ صفِ مرده (DLQ) — سرور این‌ها را رد کرده یا دفن شده‌اند */
function quotaClearDlq(){
  var n = SYNC.dlq.length;
  SYNC.dlq = [];
  SYNC.dlqDropped = 0;
  saveDlq();
  refreshSyncBadge();
  return n;
}
/* پاک‌سازیِ انتخابی ۲: قلم‌هایِ ترمینالِ کهنه‌تر از ۷ روز (rejected/failed/conflict).
   دادهٔ ارسال‌نشدهٔ کاربر (pending/sending) هرگز حذف نمی‌شود. */
function quotaPruneTerminal(){
  var weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  var before = SYNC.queue.length;
  SYNC.queue = SYNC.queue.filter(function(x){
    if(x.status === 'pending' || x.status === 'sending') return true;
    var t = Date.parse(x.created_at);
    return isNaN(t) || t >= weekAgo;
  });
  var n = before - SYNC.queue.length;
  if(n){ saveQueue(); bgMirrorQueue(); refreshSyncBadge(); }
  return n;
}
/* مودالِ سهمیه: نمودارِ مصرف + گزینه‌هایِ پاک‌سازیِ انتخابی */
function storageQuotaModal(){
  storageQuotaEstimate().then(function(est){
    var pct = est.known ? Math.min(100, Math.round(est.ratio * 100)) : null;
    var barColor = pct == null ? 'var(--border)' : (pct >= 85 ? 'var(--red)' : (pct >= 70 ? '#d97706' : 'var(--green)'));
    var dlqN = SYNC.dlq.length;
    var termOld = SYNC.queue.filter(function(x){
      if(x.status === 'pending' || x.status === 'sending') return false;
      var t = Date.parse(x.created_at);
      return !isNaN(t) && t < Date.now() - 7 * 24 * 60 * 60 * 1000;
    }).length;
    openModal(`<div class="card-head"><h3>🗄️ حافظهٔ ذخیره‌سازیِ مرورگر</h3>
        <button class="icon-btn" data-act="modal-close" aria-label="بستن">✕</button></div>
      <div class="card-body">
        ${est.known ? `
          <div class="row" style="margin-bottom:6px"><span class="small muted">مصرف: <b>${quotaSizeFa(est.usage)}</b> از ${quotaSizeFa(est.quota)}</span><div class="spacer"></div><b>${fa(pct)}٪</b></div>
          <div style="background:var(--surface-2);border-radius:999px;height:10px;overflow:hidden;margin-bottom:12px">
            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:999px"></div>
          </div>
          ${pct >= 85 ? '<div class="sync-note" style="margin-bottom:10px">⚠️ حافظه نزدیکِ سهمیه است — اگر پر شود، تغییراتِ آفلاینِ تازه ذخیره نمی‌شوند. موارد زیر را پاک‌سازی کنید.</div>' : ''}`
        : '<div class="muted small" style="margin-bottom:10px">مرورگرِ شما اندازهٔ سهمیه را گزارش نمی‌کند — پاک‌سازیِ انتخابی همچنان در دسترس است.</div>'}
        <div style="background:var(--surface-2);border-radius:10px;padding:10px;margin-bottom:8px">
          <div class="row" style="align-items:center">
            <div><b>صفِ مرده (DLQ)</b><div class="small muted">عملیات‌هایی که سرور رد کرده یا از سقف بیرون رفته‌اند — دیگر ارسال نمی‌شوند</div></div>
            <div class="spacer"></div>
            <span class="badge ${dlqN?'b-amber':'b-gray'}">${fa(dlqN)} قلم</span>
            ${dlqN?`<button class="btn ghost sm" data-act="sync-quota-clear-dlq">🧹 پاک‌سازی</button>`:''}
          </div>
        </div>
        <div style="background:var(--surface-2);border-radius:10px;padding:10px">
          <div class="row" style="align-items:center">
            <div><b>قلم‌هایِ پایان‌یافتهٔ کهنه</b><div class="small muted">ردشده/ناموفق/تعارضِ کهنه‌تر از ۷ روز — دادهٔ ارسال‌نشدهٔ شما دست نمی‌خورد</div></div>
            <div class="spacer"></div>
            <span class="badge ${termOld?'b-amber':'b-gray'}">${fa(termOld)} قلم</span>
            ${termOld?`<button class="btn ghost sm" data-act="sync-quota-prune">🧹 هرس</button>`:''}
          </div>
        </div>
        <div class="small muted" style="margin-top:10px">🛡️ تغییراتِ در صفِ ارسال (pending) هرگز پاک نمی‌شوند.</div>
      </div>
      <div class="card-head" style="border-bottom:none;border-top:1px solid var(--border)">
        <div class="spacer"></div>
        <button class="btn ghost" data-act="sync-panel">بازگشت به صف</button>
        <button class="btn" data-act="modal-close">بستن</button>
      </div>`);
  });
}

/* ---------- W8-2: مودالِ داوریِ تعارض — «نسخهٔ شما رد شد» ----------
   وقتی دو دستگاه هم‌زمان یک رکورد را عوض کنند، سرور تغییرِ دیرهنگام را
   conflict_preserved / stale_base می‌کند. کاربر باید ببیند کدام نسخه
   برنده شد: این مودال نسخهٔ محلیِ او و نسخهٔ سرور را روبه‌رویِ هم،
   فیلدبه‌فیلد و با برجسته‌سازیِ تفاوت‌ها نشان می‌دهد. */
var SYNC_CONFLICT_FIELD_FA = {
  student_id:'دانش‌آموز', subject_id:'درس', class_id:'کلاس', score:'نمره',
  status:'وضعیت', kind:'نوع', points:'امتیاز', reason:'توضیح', title:'عنوان',
  body:'متن', day:'روز', date:'تاریخ', term:'نوبت', period:'زنگ', amount:'مبلغ'
};
function syncConflictFieldFa(k){ return SYNC_CONFLICT_FIELD_FA[k] || k; }
function syncConflictCell(v){
  if(v === undefined || v === null || v === '') return '—';
  if(typeof v === 'number') return fa(v);
  return esc(String(v));
}
/* ردیف‌هایِ مقایسه: اجتماعِ کلیدهایِ دو نسخه؛ تفاوت‌ها برجسته می‌شوند.
   فیلدهایِ سیستمی (نسخه/زمان/مالکیت) در مقایسه نمی‌آیند. */
function syncConflictRows(localData, serverData){
  var skip = { id:1, version:1, base_version:1, created_at:1, updated_at:1, by:1, at:1, school_id:1, uid:1 };
  var keys = [], seen = {};
  [localData || {}, serverData || {}].forEach(function(d){
    Object.keys(d).forEach(function(k){ if(!skip[k] && !seen[k]){ seen[k] = 1; keys.push(k); } });
  });
  if(!keys.length) return '<div class="muted small">فیلدی برایِ مقایسه نیست</div>';
  return `<table style="width:100%"><thead><tr><th>فیلد</th><th>📱 نسخهٔ شما (رد شد)</th><th>🖥️ نسخهٔ سرور (برنده)</th></tr></thead><tbody>`
    + keys.map(function(k){
        var lv = (localData || {})[k], sv = (serverData || {})[k];
        var diff = JSON.stringify(lv) !== JSON.stringify(sv);
        return `<tr${diff ? ' style="background:var(--surface-2)"' : ''}>
          <td class="small">${esc(syncConflictFieldFa(k))}</td>
          <td>${diff ? '<b>' : ''}${syncConflictCell(lv)}${diff ? '</b>' : ''}</td>
          <td>${diff ? '<b>' : ''}${syncConflictCell(sv)}${diff ? '</b>' : ''}</td>
        </tr>`;
      }).join('')
    + '</tbody></table>';
}
function syncConflictModal(uid){
  var item = SYNC.queue.find(function(x){ return x.uid === uid; })
          || SYNC.dlq.find(function(x){ return x.uid === uid; });
  if(!item) return;
  var op = item.op || {};
  var collFa = {
    attendance:'حضور و غیاب', grades:'نمرات', discipline:'انضباط', users:'کاربران',
    schools:'مدارس', classes:'کلاس‌ها', subjects:'دروس', leaves:'مرخصی',
    announcements:'اطلاعیه‌ها', messages:'پیام‌ها', installments:'اقساط',
    transactions:'تراکنش‌ها', exams:'امتحانات', schedule:'برنامه هفتگی',
  };
  var isConflict = item.status === 'conflict';
  var hasServer = !!item.server;
  openModal(`<div class="card-head"><h3>${isConflict ? '⚖️ تعارضِ همگام‌سازی' : '⛔ نسخهٔ شما رد شد'}</h3>
      <button class="icon-btn" data-act="modal-close" aria-label="بستن">✕</button></div>
    <div class="card-body">
      <div class="sync-note" style="margin-bottom:10px">
        ${isConflict
          ? 'دستگاهِ دیگری هم‌زمان همین رکورد را تغییر داده و سرور آن نسخه را حفظ کرده است — تغییرِ شما اعمال نشد و مدیر مدرسه باید داوری کند.'
          : 'سرور نسخهٔ تازه‌تری از این رکورد داشت؛ تغییرِ شما اعمال نشد و نسخهٔ سرور برنده است. اگر تغییرتان هنوز لازم است، آن را رویِ نسخهٔ تازه دوباره ثبت کنید.'}
      </div>
      <div class="row" style="gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <span class="badge b-blue">${esc(collFa[op.c] || op.c || 'رکورد')}</span>
        <span class="badge ${isConflict ? 'b-red' : 'b-gray'}">${isConflict ? 'در انتظارِ داوریِ مدیر' : 'ردِ نسخه‌ای'}</span>
        <span class="muted small">ثبتِ محلی: ${jalaliDateTime(item.created_at)}</span>
      </div>
      ${hasServer
        ? `<div class="table-wrap">${syncConflictRows(op.data, item.server)}</div>`
        : `<div style="background:var(--surface-2);border-radius:10px;padding:10px">
             <div class="muted small" style="margin-bottom:4px">📱 تغییری که همگام نشد</div>
             ${syncConflictRows(op.data, null)}
           </div>
           <div class="muted small" style="margin-top:6px">نسخهٔ سرور در دسترسِ این دستگاه نیست — پس از اتصال، فهرستِ تعارض‌ها را مدیر مدرسه می‌بیند.</div>`}
      ${item.error ? `<div class="muted small" style="margin-top:8px">${esc(item.error)}</div>` : ''}
    </div>
    <div class="card-head" style="border-bottom:none;border-top:1px solid var(--border)">
      <div class="spacer"></div>
      <button class="btn ghost sm" data-act="sync-del" data-uid="${escAttr(item.uid)}" title="این تغییر دیگر ارسال نمی‌شود؛ حذفش فقط صف را خلوت می‌کند">حذف از صف</button>
      <button class="btn ghost" data-act="sync-panel">بازگشت به صف</button>
      <button class="btn" data-act="modal-close">فهمیدم</button>
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
  /* W8-2: مودالِ مقایسهٔ نسخهٔ محلی و نسخهٔ سرور برایِ قلمِ conflict/rejected */
  'sync-conflict-view'(el){
    const uid = (el && el.dataset) ? el.dataset.uid : null;
    if(uid) syncConflictModal(uid);
  },
  /* W8-4: مودالِ سهمیهٔ ذخیره‌سازی و پاک‌سازیِ انتخابی */
  'sync-quota'(){ storageQuotaModal(); },
  'sync-quota-clear-dlq'(){
    const n = quotaClearDlq();
    toast(n ? fa(n) + ' قلمِ صفِ مرده پاک شد' : 'صفِ مرده خالی بود', 'ok');
    checkStorageQuota();
    storageQuotaModal();
  },
  'sync-quota-prune'(){
    const n = quotaPruneTerminal();
    toast(n ? fa(n) + ' قلمِ پایان‌یافتهٔ کهنه هرس شد' : 'قلمِ کهنه‌ای نبود', 'ok');
    checkStorageQuota();
    storageQuotaModal();
  },
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

/* ---------- W8-1: Background Sync (تخلیهٔ صف با تبِ بسته) ----------
   SW به حافظهٔ محلیِ صفحه (Store) دسترسی ندارد؛ صفِ ارسال (pending/failed) در
   IndexedDB (payesh_offline_v2 → sync_queue) «آینه» می‌شود تا رویدادِ
   sync مرورگر بتواند بدونِ تبِ باز آن را بفرستد (sw.js → bgFlushQueue).
   آینه debounce می‌شود تا هر enqueue یک گذرِ کاملِ IDB نسازد. */
var _bgMirrorTimer = null;
function bgSyncSupported(){
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof window !== 'undefined' && 'SyncManager' in window;
}
function bgMirrorQueue(){
  if(typeof offlineStorage === 'undefined' || !offlineStorage.isSupported()) return;
  clearTimeout(_bgMirrorTimer);
  _bgMirrorTimer = setTimeout(function(){
    var want = SYNC.queue.filter(function(x){ return x.status === 'pending' || x.status === 'failed'; });
    offlineStorage.getQueue().then(function(have){
      var wantU = {}; want.forEach(function(x){ wantU[x.uid] = x; });
      var ops = [];
      /* قلم‌هایی که دیگر در صفِ زنده نیستند (synced/rejected/حذف‌شده) از آینه پاک شوند */
      have.forEach(function(h){ if(!wantU[h.uid]) ops.push(offlineStorage.removeFromQueue(h.uid)); });
      /* قلم‌هایِ زنده نوشته/تازه شوند (put ایدمپوتنت است) */
      want.forEach(function(x){
        ops.push(offlineStorage.addToQueue({
          uid: x.uid, op: x.op, status: x.status, attempts: x.tries || 0, created_at: x.created_at
        }));
      });
      return Promise.all(ops);
    }).catch(function(){ /* آینهٔ ناموفق مانعِ کارِ صفِ اصلی نمی‌شود */ });
  }, 400);
}
/* ثبتِ برچسبِ sync — مرورگر پس از برگشتِ اتصال، SW را حتی با تبِ بسته می‌راند */
function bgRegisterSync(){
  if(!bgSyncSupported()) return;
  try{
    navigator.serviceWorker.ready.then(function(reg){
      if(reg && reg.sync && typeof reg.sync.register === 'function')
        return reg.sync.register(BGSYNC_TAG);
    }).catch(function(){ /* ثبت‌نشدنِ sync خطایِ کاربر نیست — مسیرِ عادیِ تب باز کار می‌کند */ });
  }catch(e){}
}
/* پیامِ SW پس از تخلیهٔ پس‌زمینه: صفِ محلی با نتیجهٔ SW آشتی داده می‌شود */
function bgApplyResult(msg){
  var syncedU = {}, rejU = {};
  (msg.synced || []).forEach(function(u){ syncedU[u] = 1; });
  (msg.rejected || []).forEach(function(u){ rejU[u] = 1; });
  var changed = 0;
  SYNC.queue = SYNC.queue.filter(function(x){
    if(syncedU[x.uid]){ changed++; return false; }
    return true;
  });
  SYNC.queue.forEach(function(x){
    if(rejU[x.uid] && x.status !== 'rejected'){
      x.status = 'rejected';
      if(!x.error) x.error = 'در همگام‌سازیِ پس‌زمینه رد شد';
      changed++;
    }
  });
  if(changed){
    if(msg.synced && msg.synced.length){ SYNC.lastSync = new Date().toISOString(); saveSyncMeta(); }
    saveQueue(); bgMirrorQueue(); refreshSyncBadge();
    if(msg.synced && msg.synced.length) toast(fa(msg.synced.length) + ' تغییر در پس‌زمینه همگام شد ✓', 'ok');
    if(msg.rejected && msg.rejected.length) toast(fa(msg.rejected.length) + ' تغییر در پس‌زمینه رد شد — پنلِ همگام‌سازی را ببینید', 'warn');
  }
}
function bgListen(){
  if(typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try{
    navigator.serviceWorker.addEventListener('message', function(e){
      if(e && e.data && e.data.type === 'payesh-bgsync-done') bgApplyResult(e.data);
    });
  }catch(e){}
}

/* ---------- W8-5: Pull-to-Refresh (کشیدن برایِ همگام‌سازی) ----------
   رویِ موبایل، کشیدنِ صفحه به پایین از بالایِ اسکرول باید همگام‌سازی
   کند (ارسالِ صف + در حالتِ سروری، کشیدنِ دلتا). شنونده‌ها رویِ document
   واگذار شده‌اند پس در «همهٔ viewها» کار می‌کند — .content هر روت را
   در بر می‌گیرد و پس از هر render هم زنده می‌ماند.
   ضدِ دوبار-اجرا: تا پایانِ refreshِ جاری (busy) کشیدنِ تازه بی‌اثر است. */
var PTR = {
  startY   : 0,        /* نقطهٔ شروعِ لمس */
  pulling  : false,    /* آیا کشیدنِ معتبر شروع شده؟ (فقط از scrollTop=0) */
  dist     : 0,        /* فاصلهٔ کشیده‌شده (px، میرا) */
  busy     : false,    /* در حالِ refresh — کشیدنِ تازه نمی‌پذیرد (ضدِ double-trigger) */
  threshold: 70,       /* آستانهٔ رهاسازی برایِ trigger */
};
function ptrContainer(){
  return document.querySelector('.content');
}
function ptrIndicator(){
  var el = document.getElementById('ptr-indicator');
  if(!el){
    el = document.createElement('div');
    el.id = 'ptr-indicator';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
}
function ptrRender(){
  var el = ptrIndicator();
  if(PTR.busy){
    el.className = 'ptr-busy';
    el.textContent = '⏳ در حال همگام‌سازی…';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    return;
  }
  if(!PTR.pulling || PTR.dist <= 0){
    el.className = '';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-46px)';
    return;
  }
  var ready = PTR.dist >= PTR.threshold;
  el.className = ready ? 'ptr-ready' : '';
  el.textContent = ready ? '↻ رها کنید تا همگام شود' : '↓ برایِ همگام‌سازی بکشید';
  el.style.opacity = String(Math.min(1, PTR.dist / PTR.threshold));
  el.style.transform = 'translateY(' + Math.min(0, PTR.dist - 46) + 'px)';
}
function ptrTouchStart(e){
  if(PTR.busy) return;                            /* ضدِ double-trigger */
  var c = ptrContainer();
  if(!c || !e.touches || e.touches.length !== 1) return;
  if(!c.contains(e.target) && e.target !== c) return;
  if(c.scrollTop > 0) return;                     /* فقط از بالایِ لیست */
  if(document.querySelector('.modal-back')) return; /* نه وسطِ مودال */
  PTR.startY = e.touches[0].clientY;
  PTR.pulling = true;
  PTR.dist = 0;
}
function ptrTouchMove(e){
  if(!PTR.pulling || PTR.busy || !e.touches || !e.touches.length) return;
  var dy = e.touches[0].clientY - PTR.startY;
  if(dy <= 0){ PTR.dist = 0; ptrRender(); return; }
  PTR.dist = Math.min(140, dy * 0.55);            /* مقاومتِ کشسانی */
  ptrRender();
}
function ptrTouchEnd(){
  if(!PTR.pulling || PTR.busy){ PTR.pulling = false; return; }
  var fire = PTR.dist >= PTR.threshold;
  PTR.pulling = false;
  PTR.dist = 0;
  if(fire) ptrTrigger();
  else ptrRender();
}
/* اجرایِ refresh: ارسالِ صف + (حالتِ سروری) کشیدنِ دلتایِ سرور.
   busy تا پایان true می‌ماند — کشیدنِ دوباره وسطِ کار هیچ‌کاره است. */
function ptrTrigger(){
  if(PTR.busy) return;                            /* ضدِ double-trigger */
  PTR.busy = true;
  ptrRender();
  var jobs = [];
  try{ jobs.push(Promise.resolve(syncNow(true))); }catch(e){}
  try{
    if(typeof pullFromServer === 'function' && typeof isServerMode === 'function' && isServerMode())
      jobs.push(Promise.resolve(pullFromServer()).catch(function(){}));
  }catch(e){}
  return Promise.all(jobs).catch(function(){}).then(function(){
    /* حداقل نیم‌ثانیه نشان بده تا پرش نکند؛ بعد آزاد کن */
    return new Promise(function(r){ setTimeout(r, 500); });
  }).then(function(){
    PTR.busy = false;
    ptrRender();
    refreshSyncBadge();
  });
}
function initPullToRefresh(){
  if(typeof document === 'undefined') return;
  /* passive: شنونده‌ها اسکرول را نمی‌گیرند — فقط می‌خوانند */
  document.addEventListener('touchstart', ptrTouchStart, { passive: true });
  document.addEventListener('touchmove',  ptrTouchMove,  { passive: true });
  document.addEventListener('touchend',   ptrTouchEnd,   { passive: true });
  document.addEventListener('touchcancel', ptrTouchEnd,  { passive: true });
}

/* ---------- راه‌اندازی ---------- */
function initSync(){
  loadQueue();
  if(pruneAgedOps()) saveQueue();   /* P1-10: هرسِ قلم‌هایِ ترمینالِ قدیمیِ جلسه‌هایِ پیش */
  if(typeof window !== 'undefined'){
    window.addEventListener('online',  () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
  }
  bgListen();                        /* W8-1: نتیجهٔ همگام‌سازیِ پس‌زمینه را بشنود */
  bgMirrorQueue();                   /* W8-1: بقایایِ جلسهٔ قبل هم آینه شوند */
  initPullToRefresh();               /* W8-5: کشیدن برایِ همگام‌سازی (همهٔ viewها) */
  /* اگر چیزی از جلسه‌ی قبل در صف مانده، تلاش کن بفرستی */
  if(pendingCount() && SYNC.online) scheduleSync(1500);
}
