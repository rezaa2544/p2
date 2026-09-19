/* ─────────────────────────────────────────────────────────────
   backup-snap.js — سازگاریِ پشتیبان با اسنپ‌شات (دور ۱۰۰، نقصِ ۵)
   ─────────────────────────────────────────────────────────────
   ریشهٔ نقص: پس از فشرده‌سازیِ دفترچه (اسنپ‌شات + دم)، buildBackup همان
   دفترچه را با نسخهٔ ۲ صادر می‌کرد ولی validateBackup اسنپ‌شات (t:'snap'،
   بی c) را «ناقص» می‌دانست ⇒ پشتیبانِ پس‌از-فشرده‌سازی بازیابی‌ناپذیر
   بود؛ و restoreBackup هم اسنپ‌شات را نادیده می‌گرفت (applyOpِ خام).
   رفع: فرمتِ v3 + پذیرشِ t:'snap' در اعتبارسنجی + بازپخش با applyLogِ
   بوت (اسنپ‌شات + دم + پرشِ __a) + رداکشنِ رمز در اسنپ‌شات.

   S1 فشرده‌سازیِ واقعی ← نسخهٔ ۳ + validate سبز (متنِ نقص)
   S2 رفت‌وبرگشت: رکوردِ درونِ اسنپ‌شات (با حذفِ opاش از دم — اثباتِ
      مسیرِ اسنپ‌شات) + رکوردِ دم، پس از serialize/بازیابی برمی‌گردند
   S3 امنیت: رمزِ متن‌ساده در فایلِ v3 نیست (نه در op، نه در اسنپ‌شات)
   S4 سازگاریِ عقب‌رو: فایلِ دستیِ v2 (بی‌اسنپ‌شات) همچنان بازیابی می‌شود
   S5 منفی‌ها: نسخهٔ آینده/اسنپ‌شاتِ ناقص/مجموعهٔ ناشناخته/بی‌ops رد می‌شوند
   ───────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n▸ P2-5 — پشتیبان/اسنپ‌شات (jsdom)');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(2000);

  /* ── فیکسچر + رکوردِ پیش‌از-اسنپ‌شات ── */
  W(`S.user=db.users.find(u=>u.role==='manager'&&u.school_id);S.persona=null;S.boss=null;SYNC.online=false;`);
  const sid = W('S.user.school_id');
  const secret = 'snapsec' + Date.now();
  W(`insert('visitors',{school_id:${sid},name:'مهمان پیش‌اسنپ‌شات',purpose:'تست',in_at:'',out_at:'',registered_by:1,created_at:''});`);
  const secUid = W(`insert('users',{school_id:${sid},role:'student',full_name:'کاربر رمزی اسنپ‌شات',
    username:'snapu${Date.now()}',password:'${secret}',national_id:'',phone:'',active:1}).id`);

  /* ── تحریکِ فشرده‌سازیِ واقعی (مسیرِ شمارشی؛ _DB_BYTES موقتاً کوچک تا
       نگهبانِ برآورد بگذرد — خودِ فشرده‌سازی دوبارهٔ واقعی‌اش می‌کند) ── */
  W(`COMPACT_KEEP=20;COMPACT_OPS=10;COMPACT_BYTES=100000000;_DB_BYTES=1000;_COMPACT_REJECT_BYTES=0;`);
  W(`insert('visitors',{school_id:${sid},name:'محرک فشرده‌سازی',purpose:'',in_at:'',out_at:'',registered_by:1,created_at:''});`);
  W(`COMPACT_KEEP=500;COMPACT_OPS=30000;COMPACT_BYTES=3145728;`);
  chk('S1a فشرده‌سازی رخ داد (log[0] اسنپ‌شات است)', W(`log[0]&&log[0].t==='snap'`));
  const v3 = JSON.parse(W(`JSON.stringify({v:buildBackup().version,ok:validateBackup(buildBackup()).ok})`));
  chk('S1b نسخهٔ پشتیبان ۳ است', v3.v === 3, 'v=' + v3.v);
  chk('S1c پشتیبانِ دارایِ اسنپ‌شات معتبر است (متنِ نقص)', v3.ok === true);

  /* ── S3 (پیش از دم — کاربرِ رمزی درونِ اسنپ‌شات است) ── */
  const blob = String(W(`JSON.stringify(buildBackup())`));
  chk('S3a رمزِ متن‌ساده در فایلِ v3 نیست', blob.indexOf(secret) === -1);
  chk('S3b اسنپ‌شات رمز را [redacted] کرده',
    blob.indexOf('[redacted]') >= 0 && W(`buildBackup().ops[0].db.users.some(function(u){return u.password==='${secret}';})`) === false);

  /* ── S2: رکوردِ دم + رفت‌وبرگشت ── */
  W(`insert('visitors',{school_id:${sid},name:'مهمان دم',purpose:'تست',in_at:'',out_at:'',registered_by:1,created_at:''});`);
  const fileObj = JSON.parse(W(`JSON.stringify((function(){
    var b=buildBackup();
    /* شبیه‌سازیِ واقعیتِ پس‌از-فشرده‌سازی: opِ رکوردِ A از دم حذف می‌شود —
       پس A فقط از مسیرِ اسنپ‌شات می‌تواند برگردد (اثباتِ مسیر). */
    b.ops=b.ops.filter(function(o){return !(o&&o.data&&o.data.name==='مهمان پیش‌اسنپ‌شات');});
    return b;
  })())`));
  const wire = JSON.stringify(fileObj);
  const restored = W(`JSON.stringify(restoreBackup(JSON.parse(${JSON.stringify(wire)})))`);
  chk('S2a بازیابی موفق', JSON.parse(restored).ok === true, restored.slice(0, 200));
  chk('S2b رکوردِ درونِ اسنپ‌شات برگشت (فقط از مسیرِ اسنپ‌شات)',
    W(`db.visitors.some(function(v){return v.name==='مهمان پیش‌اسنپ‌شات';})`) === true);
  chk('S2c رکوردِ دم برگشت',
    W(`db.visitors.some(function(v){return v.name==='مهمان دم';})`) === true);
  chk('S2d شمارنده‌هایِ حجم تازه‌اند (بازپخش با applyLog)',
    W(`_LOG_BYTES===JSON.stringify(log).length`) === true);
  chk('S3c پس از بازیابی، کاربر هست و رمزش رداکت‌شده است',
    W(`(function(){var u=db.users.filter(function(x){return x.id===${secUid};})[0];
      return !!u&&u.password==='[redacted]';})()`) === true);

  /* ── S4: سازگاریِ عقب‌رو (v2 دستی) ── */
  const v2file = JSON.stringify({ format: 'payesh-backup', version: 2,
    ops: [{ t: 'ins', c: 'visitors',
      data: { id: 777001, school_id: sid, name: 'v2-legacy', purpose: '', in_at: '', out_at: '',
        registered_by: 1, created_at: '' } }] });
  chk('S4a فایلِ v2 معتبر است', W(`validateBackup(${v2file}).ok`) === true);
  const r4 = W(`JSON.stringify(restoreBackup(${v2file}))`);
  chk('S4b فایلِ v2 بازیابی می‌شود', JSON.parse(r4).ok === true, r4.slice(0, 160));
  chk('S4c رکوردِ v2 برگشت',
    W(`db.visitors.some(function(v){return v.name==='v2-legacy';})`) === true);

  /* ── S5: منفی‌ها ── */
  chk('S5a نسخهٔ آینده (۴) رد می‌شود',
    W(`validateBackup({format:'payesh-backup',version:4,ops:[]}).ok`) === false);
  chk('S5b اسنپ‌شاتِ بی‌db رد می‌شود',
    W(`validateBackup({format:'payesh-backup',version:3,ops:[{t:'snap'}]}).ok`) === false);
  chk('S5c مجموعهٔ ناشناخته رد می‌شود',
    W(`validateBackup({format:'payesh-backup',version:3,ops:[{t:'ins',c:'جعلی',data:{}}]}).ok`) === false);
  chk('S5d بی‌ops رد می‌شود',
    W(`validateBackup({format:'payesh-backup',version:3}).ok`) === false);
  chk('S5e ورودیِ پوچ رد می‌شود', W(`validateBackup(null).ok`) === false);

  dom.window.close();
  console.log('\nbackup-snap: ' + okc + '/' + (okc + failc) + (failc ? ' — شکست: ' + fails.join(' | ') : '  ✅'));
  process.exit(failc ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
