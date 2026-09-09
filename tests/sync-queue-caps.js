/* ─────────────────────────────────────────────────────────────
   sync-queue-caps.js — سقف و نگهداشتِ صفِ ارسال (P1-10، مقیاس ملی)
   ─────────────────────────────────────────────────────────────
   Q0   بوت: صف و DLQ خالی، ثابت‌هایِ سقف سرِ جا
   Q1   سقفِ تعدادی: تخلیه از قدیمی‌ترینِ rejected، بعد failed…، pending آخر
   Q2   سقفِ حجمی: قلمِ غول‌پیکر به DLQ می‌رود، صف زیرِ سقف می‌ماند
   Q3   هرسِ قدمت: ترمینالِ قدیمی می‌رود؛ pending/sending (هرچقدر قدیمی) می‌ماند
   Q4   پایانِ تلاش‌ها: پنجمینِ ناموفق ← DLQ (دیگر ارسال نمی‌شود)
   Q5   هشدارِ «نزدیک سقف» با هیسترزیس (روشن در ۸۰٪، خاموش زیرِ ۷۰٪)
   Q6   سقفِ DLQ: بیشینه ۲۰۰، قدیمی‌ترین دور ریخته + شمارش
   Q7   شمارندهٔ ردشده: صف + DLQ (مرده‌ها همه‌شان)
   Q8   آزمونِ خودتشخیصیِ sync-queue-health + تعمیرِ بی‌خطر
   Q9   پنل: بخشِ «عملیاتِ مرده» با علت و دکمهٔ حذف
   Q10  حذفِ دستیِ DLQ از راهِ sync-del
   ───────────────────────────────────────────────────────────── */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const HTML = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jres = (obj, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => obj, headers: { get: () => null } });

(async () => {
  console.log('\n▸ P1-10 — سقف و نگهداشتِ صفِ ارسال (jsdom)');

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.fetch = function (url) {
        const p = String(url).split('?')[0];
        if (p === '/api/health') return Promise.resolve(jres({ ok: true }));
        if (p === '/api/auth/me') return Promise.resolve(jres({ ok: false, code: 'no_session' }, 401));
        return Promise.resolve(jres({}, 404));
      };
    }
  });
  const W = (c) => dom.window.eval(c);
  await sleep(1700);

  /* آفلاینِ اجباری: ارسالِ خودکارِ زمان‌بندی‌شده نباید قلم‌هایِ بذری را ببلعد */
  W(`S.user = { id: 5, role: 'manager', school_id: 1, username: 'm' };
     SYNC.online = false;`);
  const reset = () => W(`SYNC.queue=[];SYNC.dlq=[];SYNC.dlqDropped=0;SYNC.capWarned=false;
    saveQueue();saveDlq();refreshSyncBadge();0;`);
  /* قلم‌سازِ بذری (مستقیم در صف؛ دور از enqueueOp تا enforce جداگانه آزمون شود) */
  const seed = (n, status, ageDays, tag) => W(`(function(){
    var out=[];
    for(var i=0;i<${n};i++){
      var it={ uid:'seed_${tag}_'+i, op:{t:'upd',c:'grades',id:i,data:{score:10}},
        status:'${status}', tries:0, error:null,
        created_at:new Date(Date.now()-(${ageDays})*864e5).toISOString(),
        user_id:5, school_id:1 };
      SYNC.queue.push(it); out.push(it.uid);
    }
    return out;
  })()`);

  /* ── Q0: بوت ── */
  chk('Q0a صف پس از بوت خالی است', W('SYNC.queue.length') === 0, 'len=' + W('SYNC.queue.length'));
  chk('Q0b DLQ پس از بوت خالی است', W('SYNC.dlq.length') === 0);
  chk('Q0c ثابت‌هایِ سقف', W(`SYNC_QUEUE_CAPS.maxOperations===1000 && SYNC_QUEUE_CAPS.maxBytes===5242880
    && SYNC_QUEUE_CAPS.maxTries===5 && SYNC_QUEUE_CAPS.warnRatio===0.8
    && SYNC_QUEUE_CAPS.warnResetRatio===0.7 && SYNC_QUEUE_CAPS.dlqMax===200`));
  chk('Q0d پرچمِ هشدار پایین است', W('SYNC.capWarned') === false);

  /* ── Q1: سقفِ تعدادی + ترتیبِ تخلیه ── */
  reset();
  const r3 = seed(3, 'rejected', 2, 'q1r');
  seed(2, 'failed', 2, 'q1f');
  seed(995, 'pending', 1, 'q1p');
  const q1new = W(`enqueueOp({t:'ins',c:'visitors',data:{school_id:1,name:'cap-new'},by:5}).uid`);
  chk('Q1a طولِ صف ۱۰۰۰ می‌ماند', W('SYNC.queue.length') === 1000, 'len=' + W('SYNC.queue.length'));
  chk('Q1b قلمِ تازه در صف است', W(`SYNC.queue.some(function(x){return x.uid==='${q1new}';})`));
  chk('Q1c قدیمی‌ترینِ rejected به DLQ رفت', W(`!SYNC.queue.some(function(x){return x.uid==='${r3[0]}';})
    && SYNC.dlq.some(function(x){return x.uid==='${r3[0]}' && x.dead_reason==='queue_overflow';})`));
  chk('Q1d بقیهٔ rejected/failed سرِ جا هستند',
    W(`SYNC.queue.filter(function(x){return x.status==='rejected';}).length`) === 2
    && W(`SYNC.queue.filter(function(x){return x.status==='failed';}).length`) === 2);
  chk('Q1e هیچ pendingای تخلیه نشد', W(`SYNC.queue.filter(function(x){return x.status==='pending';}).length`) === 996);

  /* ── Q2: سقفِ حجمی ── */
  reset();
  W(`(function(){
    SYNC.queue.push({ uid:'huge_1', op:{t:'upd',c:'grades',id:1,data:{score:10,note:'${'x'.repeat(100)}'.repeat(60000)}},
      status:'pending', tries:0, error:null, created_at:new Date().toISOString(), user_id:5, school_id:1 });
    for(var i=0;i<5;i++) SYNC.queue.push({ uid:'tiny_'+i, op:{t:'upd',c:'grades',id:i,data:{score:9}},
      status:'pending', tries:0, error:null, created_at:new Date().toISOString(), user_id:5, school_id:1 });
  })();`);
  const q2new = W(`enqueueOp({t:'upd',c:'grades',id:99,data:{score:8},by:5}).uid`);
  chk('Q2a صف زیرِ سقفِ حجمی است', W('queueBytes()') <= W('SYNC_QUEUE_CAPS.maxBytes'), 'bytes=' + W('queueBytes()'));
  chk('Q2b قلمِ غول‌پیکر به DLQ رفت', W(`SYNC.dlq.some(function(x){return x.uid==='huge_1';})`));
  chk('Q2c قلمِ تازه سالم ماند', W(`SYNC.queue.some(function(x){return x.uid==='${q2new}';})`));

  /* ── Q3: هرسِ قدمت ── */
  reset();
  seed(1, 'rejected', 40, 'q3ro');
  seed(1, 'failed', 40, 'q3fo');
  seed(1, 'conflict', 40, 'q3co');
  seed(1, 'pending', 40, 'q3po');
  seed(1, 'sending', 40, 'q3so');
  seed(1, 'rejected', 1, 'q3rf');
  W(`SYNC.queue.push({ uid:'nodate_1', op:{t:'upd',c:'grades',id:7,data:{score:5}},
    status:'failed', tries:1, error:'x', created_at:null, user_id:5, school_id:1 });`);
  const pruned = W('pruneAgedOps()');
  chk('Q3a سه قلمِ ترمینالِ قدیمی هرس شد', pruned === 3, 'pruned=' + pruned);
  chk('Q3b ترمینالِ تازه و بی‌زمان ماندند',
    W(`SYNC.queue.some(function(x){return x.uid==='seed_q3rf_0';})`)
    && W(`SYNC.queue.some(function(x){return x.uid==='nodate_1';})`));
  chk('Q3c دادهٔ کاربر (pending/sendingِ قدیمی) هرگز هرس نمی‌شود',
    W(`SYNC.queue.some(function(x){return x.uid==='seed_q3po_0';})`)
    && W(`SYNC.queue.some(function(x){return x.uid==='seed_q3so_0';})`));

  /* ── Q4: پایانِ تلاش‌ها ── */
  reset();
  W(`SYNC.queue.push({ uid:'try_4', op:{t:'upd',c:'grades',id:3,data:{score:10}},
    status:'failed', tries:4, error:'boom', created_at:new Date().toISOString(), user_id:5, school_id:1 });`);
  const r4 = W(`noteOpFailed(SYNC.queue[0], 'boom5')`);
  chk('Q4a پنجمینِ ناموفق ← dead', r4 === 'dead', 'r=' + r4);
  chk('Q4b قلم از صف رفت و به DLQ رسید با علت و خطا',
    W('SYNC.queue.length') === 0 && W(`(function(){ var x=SYNC.dlq[0];
      return x && x.uid==='try_4' && x.status==='rejected' && x.tries===5
        && x.dead_reason==='retry_exhausted' && x.error==='boom5'; })()`));
  W(`SYNC.queue.push({ uid:'try_0', op:{t:'upd',c:'grades',id:4,data:{score:11}},
    status:'failed', tries:0, error:null, created_at:new Date().toISOString(), user_id:5, school_id:1 });`);
  const r4b = W(`noteOpFailed(SYNC.queue[0], 'e1')`);
  chk('Q4c تلاشِ اول ← failed و ماندن در صف', r4b === 'failed'
    && W(`SYNC.queue.some(function(x){return x.uid==='try_0' && x.status==='failed' && x.tries===1;})`));

  /* ── Q5: هشدار با هیسترزیس ── */
  reset();
  seed(850, 'pending', 1, 'q5a');
  W(`enqueueOp({t:'upd',c:'grades',id:50,data:{score:7},by:5})`);
  chk('Q5a در ۸۰٪ پرچم بالا رفت', W('SYNC.capWarned') === true);
  chk('Q5b نشانگر ⚠️ دارد', String(W('syncBadge()')).indexOf('⚠️') >= 0);
  reset();
  seed(100, 'pending', 1, 'q5b');
  W(`SYNC.capWarned=true; enqueueOp({t:'upd',c:'grades',id:51,data:{score:7},by:5})`);
  chk('Q5c زیرِ ۷۰٪ پرچم ریست شد', W('SYNC.capWarned') === false);
  chk('Q5d نشانگر تمیز است', String(W('syncBadge()')).indexOf('⚠️') < 0);

  /* ── Q6: سقفِ DLQ ── */
  reset();
  W(`(function(){
    for(var i=0;i<250;i++){
      SYNC.queue.push({ uid:'dlq_'+i, op:{t:'upd',c:'grades',id:i,data:{score:1}},
        status:'failed', tries:5, error:'e', created_at:new Date().toISOString(), user_id:5, school_id:1 });
      moveToDlq(SYNC.queue[SYNC.queue.length-1], 'retry_exhausted');
    }
  })();`);
  chk('Q6a طولِ DLQ حداکثر ۲۰۰', W('SYNC.dlq.length') === 200, 'len=' + W('SYNC.dlq.length'));
  chk('Q6b شمارندهٔ دورریخته ۵۰', W('SYNC.dlqDropped') === 50, 'dropped=' + W('SYNC.dlqDropped'));
  chk('Q6c قدیمی‌ترین دور ریخته شد', W(`!SYNC.dlq.some(function(x){return x.uid==='dlq_0';})
    && SYNC.dlq.some(function(x){return x.uid==='dlq_249';})`));

  /* ── Q7: شمارندهٔ ردشده ── */
  reset();
  seed(2, 'rejected', 1, 'q7r');
  W(`(function(){
    for(var i=0;i<3;i++) moveToDlq({ uid:'q7d_'+i, op:{t:'upd',c:'grades',id:i,data:{}},
      status:'failed', tries:5, error:'e', created_at:new Date().toISOString() }, 'retry_exhausted');
  })();`);
  chk('Q7 شمارنده = صف(۲) + مرده(۳)', W('rejectedCount()') === 5, 'rej=' + W('rejectedCount()'));

  /* ── Q8: خودتشخیصی ── */
  reset();
  const diagId = `DIAG_CHECKS.filter(function(c){return c.id==='sync-queue-health';})[0]`;
  chk('Q8a آزمونِ سلامت ثبت شده (engine)', W(`${diagId} && ${diagId}.cat==='engine'`));
  chk('Q8b در حالتِ خالی ok است', W(`${diagId}.check().ok`) === true);
  seed(850, 'pending', 1, 'q8a');
  const d8 = JSON.parse(W(`JSON.stringify(${diagId}.check())`));
  chk('Q8c نزدیکِ سقف ← هشدار با پیامِ روشن', d8.ok === false && /سقف/.test(d8.msg || ''), JSON.stringify(d8));
  const f8 = W(`${diagId}.fix()`);
  chk('Q8d تعمیر بی‌خطر: دادهٔ کاربر دست نمی‌خورد', typeof f8 === 'string'
    && W('SYNC.queue.length') === 850, 'fix=' + f8);
  reset();
  seed(10, 'rejected', 40, 'q8r');
  W(`${diagId}.fix()`);
  chk('Q8e تعمیر: ترمینالِ قدیمی هرس شد', W('SYNC.queue.length') === 0, 'len=' + W('SYNC.queue.length'));
  reset();
  W(`(function(){ for(var i=0;i<60;i++) SYNC.dlq.push({ uid:'old_'+i, op:{t:'upd',c:'grades',id:1,data:{}},
    status:'rejected', tries:5, error:'e', created_at:new Date().toISOString(),
    dead_at:new Date().toISOString(), dead_reason:'retry_exhausted' }); })();`);
  const d8b = JSON.parse(W(`JSON.stringify(${diagId}.check())`));
  chk('Q8f انباشتِ DLQ ← هشدار', d8b.ok === false && /مرده/.test(d8b.msg || ''), JSON.stringify(d8b));

  /* ── Q9/Q10: پنل و حذفِ DLQ ── */
  reset();
  W(`moveToDlq({ uid:'panel_1', op:{t:'upd',c:'grades',id:9,data:{score:2}},
    status:'failed', tries:5, error:'سرور ناپایدار', created_at:new Date().toISOString() }, 'retry_exhausted');`);
  W('syncPanelModal();0;');
  const html = dom.window.document.body.innerHTML;
  chk('Q9a پنل بخشِ «عملیاتِ مرده» دارد', html.indexOf('عملیاتِ مرده') >= 0);
  chk('Q9b علتِ فارسی + خطا نمایش داده می‌شود',
    html.indexOf('پایانِ ۵ تلاشِ ناموفق') >= 0 && html.indexOf('سرور ناپایدار') >= 0);
  chk('Q9c دکمهٔ حذف با uid درست', html.indexOf('data-uid="panel_1"') >= 0);
  W(`SYNC_ACTIONS['sync-del']({dataset:{uid:'panel_1'}});`);
  chk('Q10 حذفِ دستیِ DLQ از راهِ sync-del', W('SYNC.dlq.length') === 0 && W('SYNC.queue.length') === 0);

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
