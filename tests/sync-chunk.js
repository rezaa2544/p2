/* ─────────────────────────────────────────────────────────────
   sync-chunk.js — تکه‌تکه‌شدنِ صف + تقسیمِ بازگشتیِ ۴۱۳ (دور ۱۰۰، نقصِ ۱)
   ─────────────────────────────────────────────────────────────
   ریشهٔ نقص: صفِ ۵۰۱تایی یک‌جا POST می‌شد؛ سرور (سقفِ ۵۰۰ op در
   قرارداد §3.3 + سقفِ ۱MB بدنه) ۴۱۳ می‌داد و همهٔ opها failed ←
   تلاشِ دوباره ← ۴۱۳ … تا ابد. رفع (27-sync.js): تکه‌هایِ ۲۰۰تایی +
   نصف‌کردنِ بازگشتیِ تکهٔ ۴۱۳خورده + dead-letter برایِ تک‌opِ
   ذاتاً بزرگ (oversized_op) + نمایشِ پیشرفت در بج.

   C0  حالتِ سروری + صفِ خالی پس از بوت (پیش‌شرط)
   C1  ۵۰۱ op ← سه POST ‏(۲۰۰/۲۰۰/۱۰۱) و همه synced (متنِ نقص)
   C2  سرورِ cap=100 ← تقسیمِ بازگشتی، هیچ POSTای >۱۰۰ نیست
   C3  ۴۱۳ِ همیشگی ← dead-letter ‏(oversized_op) با پیامِ روشن، بدونِ حلقه
   C4  بجِ «همگام‌سازی» حینِ ارسال، پیشرفتِ x/y را نشان می‌دهد
   C5  قطعیِ وسطِ راه: تکهٔ موفق نگه داشته می‌شود، بقیه failed و با
       تلاشِ دوباره می‌روند (هیچ‌چیز نه گم می‌شود نه گیر می‌کند)
   C6  صفِ کوچک ← تک‌POST (رفتارِ عادی عوض نشده)
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
  console.log('\n▸ P0-1 — chunking صف + تقسیمِ ۴۱۳ (jsdom)');

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.__posts = [];      /* اندازهٔ هر POSTِ کامل‌شدهٔ /api/sync */
      w.__attempts = 0;    /* همهٔ تلاش‌ها (حتیِ ناتمام) */
      w.__mode = 'ok';
      w.__failAt = -1;
      w.fetch = function (url, o) {
        const p = String(url).split('?')[0];
        if (p === '/api/health') return Promise.resolve(jres({ ok: true }));
        if (p === '/api/auth/me') return Promise.resolve(jres({ ok: false, code: 'no_session' }, 401));
        if (p === '/api/sync') {
          let body = null;
          try { body = o && o.body ? JSON.parse(o.body) : null; } catch (e) {}
          const ops = (body && body.ops) || [];
          w.__attempts += 1;
          const mode = w.__mode;
          if (mode === 'throwOnce' && w.__attempts === w.__failAt)
            return Promise.reject(new Error('قطعی شبکه (شبیه‌سازی)'));
          w.__posts.push(ops.length);
          const err413 = () => Promise.resolve(jres({ ok: false, code: 'batch_too_large' }, 413));
          if (mode === 'cap100' && ops.length > 100) return err413();
          if (mode === 'always413') return err413();
          const okRes = { results: ops.map(op => ({ uid: op.uid, ok: true })) };
          if (mode === 'slow') return sleep(400).then(() => jres(okRes, 200));
          return Promise.resolve(jres(okRes, 200));
        }
        return Promise.resolve(jres({}, 404));
      };
    }
  });
  const W = (c) => dom.window.eval(c);
  await sleep(1700);

  chk('C0 حالتِ سروری', W('DATA_MODE') === 'server' && W('SYNC.demoMode') === false && W('SYNC.serverUrl') === '/api/sync');
  chk('C0b صف پس از بوت خالی است', W('SYNC.queue.length') === 0, 'len=' + W('SYNC.queue.length'));

  W(`S.user = { id: 5, role: 'manager', school_id: 1, username: 'm' };
     SYNC.online = false;`);

  const posts = () => JSON.parse(W('JSON.stringify(window.__posts)'));
  const attempts = () => W('window.__attempts');
  const resetPosts = () => W('window.__posts=[];window.__attempts=0;');
  const setMode = (m) => W(`window.__mode='${m}';`);
  const fill = (n, tag) => JSON.parse(W(`JSON.stringify((function(){
    var u=[];
    for(var i=0;i<${n};i++){ u.push(enqueueOp({t:'ins',c:'visitors',data:{school_id:1,name:'${tag}-'+i},by:5}).uid); }
    return u;
  })())`));
  const gone = (uids) => uids.every(uid =>
    W(`(function(){ return !SYNC.queue.some(function(x){ return x.uid==='${uid}'; }); })()`));
  const statusOf = (uid) => W(`(function(){ var x=SYNC.queue.find(function(y){ return y.uid==='${uid}'; }); return x?x.status:'gone'; })()`);
  async function runSync() {
    W(`SYNC.online=true;window.__sc=false;syncNow(true).then(function(){window.__sc=true;},function(){window.__sc='err';});`);
    for (let i = 0; i < 200 && W('window.__sc') !== true; i++) await sleep(100);
    return W('window.__sc') === true;
  }

  /* ── C1: متنِ نقص — ۵۰۱ op در سه تکه ── */
  setMode('ok'); resetPosts();
  const u1 = fill(501, 'c1');
  chk('C1a سیکل تمام شد', await runSync());
  chk('C1b سه POST ‏(۲۰۰/۲۰۰/۱۰۱)', JSON.stringify(posts()) === '[200,200,101]', JSON.stringify(posts()));
  chk('C1c هر ۵۰۱ op از صف رفت (synced)', gone(u1) && W('pendingCount()') === 0);

  /* ── C2: تقسیمِ بازگشتی زیرِ سقفِ سرور ── */
  setMode('cap100'); resetPosts();
  const u2 = fill(250, 'c2');
  chk('C2a سیکل تمام شد', await runSync());
  const p2 = posts();
  chk('C2b ترتیبِ عمق‌اول: ‏[۲۰۰،۱۰۰،۱۰۰،۵۰]', JSON.stringify(p2) === '[200,100,100,50]', JSON.stringify(p2));
  chk('C2c پس از ۴۱۳، همهٔ تلاش‌هایِ دوباره ≤۱۰۰', p2.slice(1).every(n => n <= 100), JSON.stringify(p2));
  chk('C2d همه synced (بدونِ حلقهٔ ۴۱۳)', gone(u2) && W('pendingCount()') === 0);

  /* ── C3: ۴۱۳ِ همیشگی ← dead-letter، نه حلقه ── */
  setMode('always413'); resetPosts();
  const u3 = fill(3, 'c3');
  chk('C3a سیکل تمام شد', await runSync());
  chk('C3b تقسیم تا تک‌op: ‏[۳،۲،۱،۱،۱]', JSON.stringify(posts()) === '[3,2,1,1,1]', JSON.stringify(posts()));
  chk('C3c هر ۳ rejected (نه failedِ ابدی)', u3.every(u => statusOf(u) === 'rejected'),
    u3.map(statusOf).join(','));
  const e3 = W(`(function(){ var x=SYNC.queue.find(function(y){ return y.uid==='${u3[0]}'; }); return x?(x.error||''):''; })()`);
  chk('C3d پیامِ روشنِ سقفِ سرور', typeof e3 === 'string' && e3.indexOf('سقفِ سرور') >= 0, e3);
  chk('C3e شمارندهٔ ردشده = ۳', W('rejectedCount()') === 3);
  W(`SYNC.queue=[];saveQueue();`); /* پاک‌سازی برایِ بخش‌هایِ بعد */

  /* ── C4: پیشرفتِ حینِ ارسال ── */
  setMode('slow'); resetPosts();
  const u4 = fill(450, 'c4');
  W(`SYNC.online=true;window.__sc=false;syncNow(true).then(function(){window.__sc=true;},function(){window.__sc='err';});`);
  await sleep(500); /* میانهٔ پرواز: هر POST دست‌کم ۴۰۰ms طول می‌کشد */
  const midSync = W('SYNC.syncing');
  const midBadge = String(W('syncBadge()'));
  chk('C4a حینِ ارسال، بج پیشرفتِ x/۴۵۰ را نشان می‌دهد',
    midSync === true && midBadge.indexOf('۴۵۰') >= 0,
    'syncing=' + midSync + ' badge~' + midBadge.replace(/\s+/g, ' ').slice(0, 90));
  for (let i = 0; i < 200 && W('window.__sc') !== true; i++) await sleep(100);
  chk('C4b سیکل تمام شد', W('window.__sc') === true);
  chk('C4c پیشرفت پس از پایان پاک شد', W('SYNC.progress') === null);
  chk('C4d همه synced', gone(u4));

  /* ── C5: قطعیِ وسطِ راه ── */
  setMode('throwOnce'); W('window.__failAt=2;'); resetPosts();
  const u5 = fill(450, 'c5');
  chk('C5a سیکل تمام شد', await runSync());
  chk('C5b فقط POSTِ اول کامل شد', JSON.stringify(posts()) === '[200]' && attempts() === 2,
    'posts=' + JSON.stringify(posts()) + ' attempts=' + attempts());
  chk('C5c ۲۰۰ تایِ اول synced', gone(u5.slice(0, 200)));
  const rest5 = u5.slice(200);
  chk('C5d ۲۵۰ تایِ بقیه failed (نه گم، نه گیرکرده)',
    rest5.every(u => statusOf(u) === 'failed') &&
    !W(`SYNC.queue.some(function(x){ return x.status==='sending'; })`));
  chk('C5e تلاشِ دوباره زمان‌بندی شد', W('SYNC.attempts') >= 1);
  setMode('ok'); resetPosts();
  chk('C5f تلاشِ دوباره همه را برد', await runSync() && gone(u5));
  chk('C5g تلاشِ دوباره در دو تکه (۲۰۰/۵۰)', JSON.stringify(posts()) === '[200,50]', JSON.stringify(posts()));

  /* ── C6: صفِ کوچک ← تک‌POST ── */
  setMode('ok'); resetPosts();
  const u6 = fill(5, 'c6');
  chk('C6a سیکل تمام شد', await runSync());
  chk('C6b تک‌POSTِ ۵تایی', JSON.stringify(posts()) === '[5]', JSON.stringify(posts()));
  chk('C6c همه synced', gone(u6) && W('SYNC.queue.length') === 0);

  dom.window.close();
  console.log('\nsync-chunk: ' + okc + '/' + (okc + failc) + (failc ? ' — شکست: ' + fails.join(' | ') : '  ✅'));
  process.exit(failc ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
