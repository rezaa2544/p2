#!/usr/bin/env node
/**
 * پیامِ «فوری / بحرانی» (بند D.3)
 *  R1  اطلاعیهٔ فوری: بالای فهرست + نشان 🚨 + پس‌زمینهٔ قرمز
 *  R2  مدیر می‌تواند فوری منتشر کند (از مسیرِ واقعیِ دکمه)
 *  R3  نقشِ غیرِ ناشر (دبیر) هرگز فوری نمی‌گذارد — حتی با مقدارِ جعلی
 *  R4  ابلاغِ گروهیِ اداره: type='urgent' + بالای صندوقِ اعلان
 *  R5  اولویتِ واقعی در صف (فوری ⟵ اصلاحیه ⟵ بقیه)
 *  R6  ارسالِ بی‌درنگ: فوری منتظرِ autoSend نمی‌ماند (auto=۱)
 *  R7  انصرافِ مدرسه: urgentAutoSend=false ⇒ مانند بقیه تأیید می‌خواهد
 *  R8  پیش‌فرضِ تنظیم روشن است (و فقط در حالتِ پیامکِ روشن اثر دارد)
 *  R9  رابطِ صف: ردیفِ قرمز + چیپ + بنرِ هشدار (فقط وقتی بی‌درنگ است)
 *  R10 مهلتِ اصلاح فقط وقتی کوتاه می‌شود که پیام واقعاً خودکار برود
 *  R11 مدل/طرح: فیلدِ urgent در مدل، مجوزها و شِمای سرور
 *  R12 همهٔ ورودی‌ها esc می‌شوند (XSS در عنوانِ فوری)
 *
 * اجرا:  node tests/urgent2.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const errors = [];
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const consoleErrors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)()
    .on('jsdomError', (e) => consoleErrors.push(e.message))
    .on('error', (m) => consoleErrors.push(String(m))),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ پیامِ فوری / بحرانی (D.3)');

const MGR = W(`db.users.find(u=>u.role==='manager'&&u.school_id===1).id`);
const SID = 1;
const ORIG_CFG = JSON.parse(W(`JSON.stringify(notifySettings(${SID}))`));
const restoreCfg = () => W(`notifySaveSettings(${SID}, ${JSON.stringify({
  enabled: ORIG_CFG.enabled, autoSend: ORIG_CFG.autoSend, urgentAutoSend: ORIG_CFG.urgentAutoSend,
  graceMinutes: ORIG_CFG.graceMinutes, dailyCap: ORIG_CFG.dailyCap
})})`);
const killUrgentQueue = () => W(`db.notify_queue.filter(q=>q.kind==='urgent').map(q=>q.id)`)
  .forEach((id) => W(`remove('notify_queue',${id})`));
const killAnnBy = (title) => W(`db.announcements.filter(a=>a.title===${JSON.stringify(title)}).map(a=>a.id)`)
  .forEach((id) => W(`remove('announcements',${id})`));

/* ── R1 ───────────────────────────────────────────────────────────── */
test('R1 — اطلاعیهٔ فوری بالای فهرست، قرمز و با نشان 🚨 است', () => {
  const T = 'TEST-URG-1';
  killAnnBy(T);
  W(`insert('announcements',{title:${JSON.stringify(T)},body:'متن',audience:'all',school_id:${SID},created_by:${MGR},created_at:todayISO(),urgent:1})`);
  try {
    W(`S.user=byId('users',${MGR});S.persona=null;S.boss=null;S.route='announcements';S.filters={}`);
    const rows = W(`myAnnouncements().slice().sort((a,b)=>(isUrgent(b)?1:0)-(isUrgent(a)?1:0))`);
    assert(rows.length > 1, 'دست‌کم دو اطلاعیه لازم است');
    assert(rows[0].title === T, 'فوری بالای فهرست نیست: ' + rows[0].title);
    const h = W(`viewAnnouncements()`);
    assert(h.indexOf('فوری / بحرانی') > -1, 'نشانِ فوری در صفحه نیست');
    assert(h.indexOf('red-soft') > -1, 'پس‌زمینهٔ قرمز نیست');
    assert(h.indexOf('🚨') > -1, 'آیکونِ هشدار نیست');
  } finally { killAnnBy(T); }
  assert(W(`db.announcements.filter(a=>a.title===${JSON.stringify(T)}).length`) === 0, 'پاک‌سازی انجام نشد');
});

/* ── R2 / R3 ──────────────────────────────────────────────────────── */
/** انتشار از مسیرِ واقعیِ دکمه (رویدادِ delegated روی document) */
function publishAs(userId, title, urgent) {
  W(`S.user=byId('users',${userId});S.persona=null;S.boss=null;S.route='announcements';S.filters={}`);
  W(`(function(){
     var mk=function(id,v){var e=document.getElementById(id);if(!e){e=document.createElement('input');e.id=id;document.body.appendChild(e);}e.value=v;return e;};
     mk('a_title',${JSON.stringify(title)}); mk('a_body','متنِ آزمونِ فوری');
     mk('a_aud','all'); mk('a_urg','${urgent}');
     window._annEdit=0;
     var b=document.getElementById('__tbtn'); if(!b){b=document.createElement('button');b.id='__tbtn';b.setAttribute('data-act','ann-save');document.body.appendChild(b);}
     b.click();
   })()`);
  return W(`(db.announcements.filter(a=>a.title===${JSON.stringify(title)})[0]||{}).urgent`);
}

test('R2 — مدیر می‌تواند «فوری / بحرانی» منتشر کند (مسیرِ واقعیِ اکشن)', () => {
  const T = 'TEST-URG-2';
  killAnnBy(T);
  try {
    /* پیامک در این آزمون دخالت نکند */
    W(`notifySaveSettings(${SID},{enabled:false})`);
    const u = publishAs(MGR, T, '1');
    assert(u === 1, 'urgent ذخیره نشد: ' + u);
    assert(W(`db.notify_queue.filter(q=>q.kind==='urgent').length`) === 0, 'با پیامکِ خاموش نباید رکوردی ساخته شود');
  } finally { killAnnBy(T); killUrgentQueue(); restoreCfg(); }
});

test('R3 — فقط ناشرِ مجاز فوری می‌گذارد (و بدونِ انتخابگر مقدار صفر است)', () => {
  /* الف) اکشنِ انتشار برای دبیر مجاز نیست (نجات‌دهندهٔ موجود در ACTION_ROLES) */
  assert(W(`canAction('ann-save','teacher')`) === false, 'دبیر نباید بتواند اطلاعیه منتشر کند');
  assert(W(`canAction('ann-save','manager')`) === true, 'مدیر باید بتواند منتشر کند');
  assert(W(`canAction('ann-save','edu_office')`) === true, 'اداره باید بتواند منتشر کند');
  /* ب) انتخابگرِ نوع فقط در فرمِ ناشرِ مجاز ساخته می‌شود */
  const TCH = W(`db.users.find(u=>u.role==='teacher'&&u.school_id===${SID}).id`);
  W(`S.user=byId('users',${TCH});S.persona=null;S.boss=null;annModal()`);
  const mT = W(`document.getElementById('modal').innerHTML`);
  W(`S.user=byId('users',${MGR});S.persona=null;S.boss=null;annModal()`);
  const mM = W(`document.getElementById('modal').innerHTML`);
  W(`closeModal()`);
  assert(mT.indexOf('a_urg') === -1, 'انتخابگرِ «فوری» نباید برای دبیر ساخته شود');
  assert(mM.indexOf('a_urg') > -1, 'انتخابگرِ «فوری» برای مدیر باید ساخته شود');
  /* ج) اگر انتخابگرِ نوع در فرم نباشد، مقدار باید ۰ بماند —
        حتی اگر کسی مقدارِ جعلی در DOM بگذارد. */
  const T = 'TEST-URG-3';
  killAnnBy(T);
  W(`notifySaveSettings(${SID},{enabled:false})`);
  try {
    W(`S.user=byId('users',${MGR});S.persona=null;S.boss=null;S.route='announcements';S.filters={};
       (function(){
         var mk=function(id,v){var e=document.getElementById(id);if(!e){e=document.createElement('input');e.id=id;document.body.appendChild(e);}e.value=v;};
         mk('a_title',${JSON.stringify(T)}); mk('a_body','متنِ آزمون'); mk('a_aud','all');
         /* انتخابگر را از DOM برمی‌داریم (همان وضعیتی که برای نقشِ غیرِ ناشر
            پیش می‌آید: فرم اصلاً آن را نمی‌سازد) */
         var el=document.getElementById('a_urg'); if(el) el.parentNode.removeChild(el);
         window._annEdit=0;
         var b=document.getElementById('__tbtn'); b.click();
       })()`);
    const rec = W(`db.announcements.filter(a=>a.title===${JSON.stringify(T)})[0]`);
    assert(rec, 'اطلاعیه ساخته نشد');
    assert(rec.urgent === 0, 'بدونِ انتخابگر نباید فوری شود: ' + rec.urgent);
  } finally { killAnnBy(T); killUrgentQueue(); restoreCfg(); }
});

/* ── R4 ───────────────────────────────────────────────────────────── */
test('R4 — ابلاغِ گروهیِ اداره: فوری در صندوقِ مدیر بالا و با 🚨 است', () => {
  const OFF = W(`db.offices[0].id`);
  const before = W(`db.notifications.length`);
  const rU = W(`officeBroadcast(byId('offices',${OFF}),'بخشنامهٔ فوری','متن',{urgent:true})`);
  const rN = W(`officeBroadcast(byId('offices',${OFF}),'بخشنامهٔ عادی','متن',{urgent:false})`);
  try {
    assert(rU.urgent === 1 && rN.urgent === 0, 'پرچمِ فوری در نتیجه درست نیست');
    const types = W(`db.notifications.slice(-${rU.sent + rN.sent}).map(n=>n.type)`);
    assert(types.indexOf('urgent') > -1, 'هیچ اعلانِ فعوری ساخته نشد');
    assert(types.indexOf('office') > -1, 'اعلانِ عادی ساخته نشد');
    /* صندوقِ اعلانِ یک مدیرِ محدوده: فوری باید بالاتر از عادی باشد */
    const mid = W(`(function(){var o=byId('offices',${OFF});var m=officeManagers(o)[0];return m?m.id:0;})()`);
    if (mid) {
      W(`S.user=byId('users',${mid});S.persona=null;S.boss=null;S.route='notifications';S.filters={}`);
      const list = W(`myNotifs()`);
      const iU = list.findIndex((n) => n.type === 'urgent');
      const iN = list.findIndex((n) => n.type === 'office');
      assert(iU > -1 && iN > -1, 'هردو نوع باید در صندوق باشد');
      assert(iU < iN, `فوری باید بالاتر از عادی باشد (${iU} در برابر ${iN})`);
      const h = W(`viewNotifications()`);
      assert(h.indexOf('🚨') > -1, 'آیکونِ 🚨 در صندوق نیست');
      assert(h.indexOf('فوری / بحرانی') > -1, 'نشانِ فوری در صندوق نیست');
      assert(W(`NOTIF_ICON.urgent`) === '🚨', 'آیکونِ نوعِ فوری تعریف نشده');
    }
  } finally {
    /* پاک‌سازیِ دقیق: فقط اعلان‌هایی که همین آزمون ساخت */
    const ids = W(`db.notifications.filter(n=>n.title==='بخشنامهٔ فوری'||n.title==='بخشنامهٔ عادی').map(n=>n.id)`);
    ids.forEach((id) => W(`remove('notifications',${id})`));
  }
  assert(W(`db.notifications.length`) === before, 'پاک‌سازیِ اعلان‌ها کامل نبود');
});

/* ── R5 ───────────────────────────────────────────────────────────── */
test('R5 — اولویتِ صف: فوری ⟵ اصلاحیه ⟵ بقیه (حتی اگر قدیمی‌تر باشد)', () => {
  const old = new Date(Date.now() - 90 * 60000).toISOString();
  const ids = [];
  W(`notifySaveSettings(${SID},{enabled:true,autoSend:false,urgentAutoSend:false})`);
  try {
    const a = W(`insert('notify_queue',{school_id:${SID},kind:'absence',student_id:null,class_id:null,parent_ids:[1],body:'عادی قدیمی',parts:1,status:'pending',source_ref:'pr-a',source_hash:null,created_at:new Date().toISOString(),created_by:${MGR},auto:0})`);
    const b = W(`insert('notify_queue',{school_id:${SID},kind:'absence',student_id:null,class_id:null,parent_ids:[1],body:'اصلاحیه',parts:1,status:'pending',source_ref:'pr-b',source_hash:null,created_at:new Date().toISOString(),created_by:${MGR},auto:0,correction_of:1})`);
    const c = W(`insert('notify_queue',{school_id:${SID},kind:'urgent',student_id:null,class_id:null,parent_ids:[1],body:'فوری قدیمی',parts:1,status:'pending',source_ref:'pr-c',source_hash:null,created_at:${JSON.stringify(old)},created_by:${MGR},auto:0})`);
    ids.push(a.id, b.id, c.id);
    const order = W(`notifyPending(${SID}).map(q=>q.kind+(q.correction_of?':corr':''))`);
    assert(order[0] === 'urgent', 'فوری اولِ صف نیست: ' + order.slice(0, 3).join(' | '));
    assert(order[1] === 'absence:corr', 'اصلاحیه دوم نیست: ' + order.slice(0, 3).join(' | '));
    assert(W(`notifyPriority({kind:'urgent'})`) === 0 &&
           W(`notifyPriority({correction_of:1})`) === 1 &&
           W(`notifyPriority({kind:'absence'})`) === 2, 'ترتیبِ اولویت غلط است');
  } finally {
    ids.forEach((id) => W(`remove('notify_queue',${id})`));
    restoreCfg();
  }
});

/* ── R6 ───────────────────────────────────────────────────────────── */
test('R6 — فوری بی‌درنگ می‌رود: منتظرِ autoSend و مهلت نمی‌ماند', () => {
  W(`notifySaveSettings(${SID},{enabled:true,autoSend:false,urgentAutoSend:true,graceMinutes:20,dailyCap:300})`);
  const ids = [];
  try {
    const ord = W(`insert('notify_queue',{school_id:${SID},kind:'absence',student_id:null,class_id:null,parent_ids:[1],body:'عادی',parts:1,status:'pending',source_ref:'r6-a',source_hash:null,created_at:new Date(Date.now()-60*60000).toISOString(),created_by:${MGR},auto:0})`);
    ids.push(ord.id);
    const r = W(`notifyUrgentToSchool(${SID},'فوری: مدرسه فردا تعطیل است',{source_ref:'r6'})`);
    const rec = W(`byId('notify_queue',${r.id})`);
    ids.push(rec.id);
    assert(r.created === 1, 'رکوردِ فوری ساخته نشد: ' + JSON.stringify(r));
    assert(rec.kind === 'urgent', 'نوع درست نیست');
    assert(rec.auto === 1, 'فوری باید مجوزِ ارسالِ خودکار بگیرد (auto=۱)');
    const due = W(`notifyAutoDue(${SID})`);
    assert(due.indexOf(rec.id) > -1, 'فوری در سررسیدِ خودکار نیست');
    assert(due.indexOf(ord.id) === -1, 'پیامِ عادی با autoSendِ خاموش نباید خودکار برود');
  } finally {
    ids.forEach((id) => W(`remove('notify_queue',${id})`));
    killUrgentQueue(); restoreCfg();
  }
});

/* ── R7 ───────────────────────────────────────────────────────────── */
test('R7 — با urgentAutoSend=false، فوری هم تأییدِ دستی می‌خواهد', () => {
  W(`notifySaveSettings(${SID},{enabled:true,autoSend:false,urgentAutoSend:false,graceMinutes:20})`);
  const ids = [];
  try {
    const r = W(`notifyUrgentToSchool(${SID},'فوری دوم',{source_ref:'r7'})`);
    assert(r.created === 1, 'رکورد ساخته نشد');
    const rec = W(`byId('notify_queue',${r.id})`);
    ids.push(rec.id);
    assert(rec.auto === 0, 'با انصرافِ مدرسه نباید auto بگیرد');
    assert(W(`notifyAutoDue(${SID})`).indexOf(rec.id) === -1, 'نباید بی‌درنگ برود');
    const cfg = W(`notifySettings(${SID})`);
    assert(notifyWindow(cfg, rec) === 20, 'مهلت باید همان مهلتِ همیشگی باشد');
    function notifyWindow(c, q) { return W(`notifyUrgentWindow(${JSON.stringify(c)},{kind:'urgent'})`); }
    assert(W(`notifyUrgentAutoOn(${JSON.stringify(cfg)})`) === false, 'urgentAutoOn باید false باشد');
  } finally {
    ids.forEach((id) => W(`remove('notify_queue',${id})`));
    killUrgentQueue(); restoreCfg();
  }
});

/* ── R8 ───────────────────────────────────────────────────────────── */
test('R8 — پیش‌فرض: روشن، ولی فقط وقتی پیامکِ مدرسه روشن است', () => {
  assert(W(`NOTIFY_DEFAULTS.urgentAutoSend`) === true, 'پیش‌فرضِ تنظیم باید روشن باشد');
  assert(W(`NOTIFY_DEFAULTS.kinds.urgent`) === true, 'نوعِ فوری باید در پیش‌فرضِ انواع باشد');
  const cfg = W(`notifySettings(999999)`);   /* مدرسه‌ای بی‌تنظیمات */
  assert(cfg.urgentAutoSend === true, 'پیش‌فرض برای مدرسهٔ بی‌تنظیمات باید روشن باشد');
  assert(W(`notifyUrgentAutoOn({enabled:false,urgentAutoSend:true})`) === false,
    'با پیامکِ خاموش، ارسالِ بی‌درنگ نباید فعال باشد');
  assert(W(`notifyUrgentToSchool(999999,'متنِ کافی برای آزمون',{source_ref:'r8'}).reason`) === 'disabled',
    'مدرسهٔ خاموش نباید پیامی بسازد');
});

/* ── R9 ───────────────────────────────────────────────────────────── */
test('R9 — رابطِ صف: ردیفِ قرمز + چیپ + بنر (بنر فقط در حالتِ بی‌درنگ)', () => {
  W(`notifySaveSettings(${SID},{enabled:true,autoSend:false,urgentAutoSend:true})`);
  W(`S.user=byId('users',${MGR});S.persona=null;S.boss=null;S.route='notifyqueue';S.filters={}`);
  const r = W(`notifyUrgentToSchool(${SID},'فوری برای رابط',{source_ref:'r9'})`);
  const rec = W(`byId('notify_queue',${r.id})`);
  try {
    const on = W(`viewNotifyQueue()`);
    assert(on.indexOf('red-soft') > -1, 'ردیف/بنرِ قرمز در صف نیست');
    assert(/فوری \/ بحرانی/.test(on), 'چیپِ فوری در صف نیست');
    assert(on.indexOf('بدون تأییدِ شما') > -1, 'بنرِ «بدون تأیید» در حالتِ بی‌درنگ باید باشد');
    assert(on.indexOf('🚨') > -1, 'نشانِ فوری در ردیف نیست');
    W(`notifySaveSettings(${SID},{urgentAutoSend:false})`);
    const off = W(`viewNotifyQueue()`);
    assert(off.indexOf('بدون تأییدِ شما') === -1, 'با انصراف، بنر نباید باشد');
    assert(off.indexOf('red-soft') > -1, 'ردیفِ قرمز باید بماند');
  } finally {
    W(`remove('notify_queue',${rec.id})`);
    killUrgentQueue(); restoreCfg();
  }
});

/* ── R10 ──────────────────────────────────────────────────────────── */
test('R10 — مهلتِ اصلاح فقط وقتی کوتاه می‌شود که پیام خودکار برود', () => {
  W(`notifySaveSettings(${SID},{enabled:true,autoSend:false,urgentAutoSend:true,graceMinutes:20})`);
  const fiveAgo = new Date(Date.now() - 5 * 60000).toISOString();
  const mk = () => W(`insert('notify_queue',{school_id:${SID},kind:'urgent',student_id:null,class_id:null,parent_ids:[1],body:'فوری',parts:1,status:'pending',source_ref:'r10',source_hash:null,created_at:${JSON.stringify(fiveAgo)},created_by:${MGR},auto:0})`);
  try {
    const a = mk();
    /* بی‌درنگ روشن ⇒ مهلت ۲ دقیقه ⇒ رکوردِ ۵ دقیقه‌ای دیگر قابلِ لغو نیست */
    assert(W(`notifyCancelIfFresh('urgent','r10',${MGR})`) === 0, 'با مهلتِ ۲ دقیقه نباید لغو شود');
    assert(W(`byId('notify_queue',${a.id}).status`) === 'pending', 'وضعیت نباید تغییر کند');
    W(`remove('notify_queue',${a.id})`);
    /* انصراف ⇒ مهلت ۲۰ دقیقه ⇒ همان رکوردِ ۵ دقیقه‌ای لغو می‌شود */
    W(`notifySaveSettings(${SID},{urgentAutoSend:false})`);
    const b = mk();
    assert(W(`notifyCancelIfFresh('urgent','r10',${MGR})`) === 1, 'با مهلتِ همیشگی باید لغو شود');
    assert(W(`byId('notify_queue',${b.id}).status`) === 'cancelled', 'وضعیت باید cancelled شود');
    W(`remove('notify_queue',${b.id})`);
  } finally { killUrgentQueue(); restoreCfg(); }
});

/* ── R11 ──────────────────────────────────────────────────────────── */
test('R11 — فیلدِ urgent در مدل، جدولِ مجوزها و شِمای سرور هست', () => {
  const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz/model.json'), 'utf8'));
  assert(model.collections.announcements.fields.indexOf('urgent') > -1, 'urgent در مدل نیست');
  const perms = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz/write-perms.json'), 'utf8'));
  assert((perms.fields.announcements || []).indexOf('urgent') > -1, 'urgent در جدولِ تولیدشدهٔ سرور نیست');
  assert((perms.ops.announcements.ins || []).indexOf('teacher') === -1, 'دبیر نباید حقِ نوشتنِ اطلاعیه داشته باشد');
  const sql = fs.readFileSync(path.join(ROOT, 'server/schema.sql'), 'utf8');
  const tbl = sql.split('CREATE TABLE IF NOT EXISTS announcements (')[1].split(');')[0];
  assert(/"urgent"/.test(tbl), 'ستونِ urgent در شِمای سرور نیست');
  assert(W(`(typeof isUrgent==='function')&&(typeof notifyQueueCmp==='function')&&(typeof notifyUrgentToSchool==='function')`), 'توابعِ ماژول در دسترس نیستند');
});

/* ── R12 ──────────────────────────────────────────────────────────── */
test('R12 — عنوانِ فوری escape می‌شود (XSS)', () => {
  const T = '<img src=x onerror="window.__x=1">';
  killAnnBy(T);
  W(`insert('announcements',{title:${JSON.stringify(T)},body:'متن',audience:'all',school_id:${SID},created_by:${MGR},created_at:todayISO(),urgent:1})`);
  try {
    W(`S.user=byId('users',${MGR});S.persona=null;S.boss=null;S.route='announcements';S.filters={}`);
    const h = W(`viewAnnouncements()`);
    assert(!/<img/i.test(h), 'تگِ خام در خروجی ماند');
    assert(h.indexOf('&lt;img') > -1, 'خروجی باید escape‌شده باشد');
  } finally { killAnnBy(T); }
  assert(W(`db.announcements.filter(a=>a.title===${JSON.stringify(T)}).length`) === 0, 'پاک‌سازی انجام نشد');
});

await __seq;

console.log(`\nبررسی — ${pass + fail} مورد: ✅ ${pass} · ❌ ${fail}` + (fail ? '' : '  —  بدون خطا ✅'));
if (errors.length) console.log('خطاها:\n' + errors.join('\n'));
if (consoleErrors.length) {
  console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
}
dom.window.close();
process.exit(fail ? 1 : 0);
}
