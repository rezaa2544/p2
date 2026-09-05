#!/usr/bin/env node
/**
 * پنتست — پایش · فرض: نسخهٔ سروری در حال کار است
 *
 * هر سناریو یک exploit یا یک نگهبان است (سبک: «بدون exploit کارکردن،
 * یافته نداریم»). دو دستهٔ یافته:
 *   kind=client  → باید در همین ریپو سبز باشد؛ قرمز = باگ واقعیِ سمت کاربر
 *   kind=server  → بلوک‌کننده‌های شناخته‌شدهٔ پیش‌از-سرور (TODO_BEFORE_PRODUCTION)
 *                  که exploit آن‌ها همین‌جا زنده است؛ تا کار سروری انجام
 *                  نشود قرمز می‌مانند و خروجی را نمی‌شکنند.
 *
 * اجرا: node tests/security.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — پنتست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const consoleErrors = [];
const mkDom = (beforeParse) => {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => consoleErrors.push(e.message));
  vc.on('error', (m) => consoleErrors.push(String(m)));
  return new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: vc, beforeParse,
  });
};

const dom = mkDom();
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const sec = async (kind, section, name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ kind, section, name, ok: true, detail: '', ms: Date.now() - t0 }); }
  catch (e) { results.push({ kind, section, name, ok: false, detail: String(e.message || e), ms: Date.now() - t0 }); }
};
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const clk = (act, attrs = {}) => W(
  `(function(){var el=document.createElement('button');el.setAttribute('data-act',${JSON.stringify(act)});` +
  Object.entries(attrs).map(([k, v]) => `el.setAttribute('data-${k}',${JSON.stringify(v)});`).join('') +
  `document.body.appendChild(el);el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.remove();})()`
);
const SENTINEL = 'xsscan' + Date.now();
/* مهاجم: آیا سنترنِئل به‌عنوان گرهٔ HTML parse شده جایی در سند هست؟ */
const sentinelAlive = () => W(`!!document.getElementById('${SENTINEL}')`);
const PAYLOAD = `<img id=${SENTINEL} src=x>`;
/* پاک‌سازی: همهٔ گره‌های سنترنِئل (در صورتی که سندی نشت کرده باشد) */
const wipeSentinel = () => W(`var n=document.getElementById('${SENTINEL}');if(n)n.remove();`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  await sleep(300);

  console.log('\n▸ الف — سطح بیرونی (شبکه/دستگاه اشتراکی)');

  await sec('client', 'بیرونی', 'فرم ورود پیش‌فرضِ حساب مدیریتی ندارد (prefill)', () => {
    const lu = W(`document.getElementById('lu').value`);
    const lp = W(`document.getElementById('lp').value`);
    assert(lu === '' && lp === '',
      '🔴 ورودی ورود پیش‌فرض پر است: lu=' + JSON.stringify(lu) + ' — یک کلیک = ورود با حساب پرریسک‌ترین کاربر');
  });

  /* ورود واقعی تا پوستهٔ اپ (و #main) وجود داشته باشد؛ بعد از آن همهٔ
     renderRoute واقعاً در DOM می‌نشینند و آزمون‌های XSS صوری نمی‌شوند. */
  W(`document.getElementById('lu').value='superadmin';document.getElementById('lp').value='123456'`);
  clk('login');
  assert(W('S.user && S.user.role') === 'superadmin', 'ورود اولیه برای بقیهٔ سناریوها انجام نشد');
  assert(W(`!!document.querySelector('.content')`), 'پوستهٔ اپ بعد از ورود رندر نشد');
  W('S.user=null;render();');

  await sec('server', 'بیرونی', 'auto-login: بازنشانی نشست از localStorage بدون رمز (دستگاه اشتراکی)', async () => {
    /* exploit واقعی: کاربر قبلی (teacher1_1) روی رایانهٔ اشتراکی وارد شده و
       رفته است؛ مهاجم صفحه را باز می‌کند. نشست باید نیازمند رمز باشد. */
    const d2 = mkDom((w) => { try { w.localStorage.setItem('sms_session_v1', 'teacher1_1'); } catch (e) { } });
    await sleep(500);
    const leaked = d2.window.eval('S.user && S.user.username ? S.user.username : null');
    d2.window.close();
    assert(leaked === null,
      '🔴 با وجود sms_session_v1=teacher1_1 در localStorage، صفحه بدون رمز وارد نشست شد: ' + leaked +
      ' (تصمیم UX/محصولی + قرارداد سرور بند ۱.۲ — کوکی HttpOnly)');
  });

  await sec('server', 'بیرونی', 'جعل هویت: ست مستقیم S.user بدون احراز (کنسول مرورگر)', () => {
    W('S.user=null;');
    const h = W(`(function(){S.user=db.users.find(u=>u.role==='superadmin');S.route='dashboard';return renderRoute();})()`);
    const isAdminUi = typeof h === 'string' && h.length > 100;
    assert(isAdminUi === false,
      '🔴 با ست S.user از کنسول، بدون هیچ احرازی، خروجی پنل سوپرادمین رندر شد (بلوک‌کنندهٔ شناخته‌شدهٔ ۱.۲ — احراز باید سمت سرور باشد)');
    W('S.user=null;');
  });

  await sec('server', 'بیرونی', 'باندل خروجی حاوی اعتبارنامه‌های دمو (کد ملی/رمز) است', () => {
    const n = html.split("password:'123456'").length - 1;
    const nid = /national_id:'9\d{9}'/.test(html);
    const nRuntime = W(`db.users.filter(u=>u.password==='123456').length`);
    assert(n === 0 && nid === false,
      `🔴 باندل index.html خودش ${n} رمز متن‌ساده سفت‌درج دارد و در اجرای دمو ${nRuntime} کاربر با همان رمز ۱۲۳۴۵۶ ساخته می‌شود + کد ملی — هر بازدیدکننده با یک GET کل اعتبارنامه‌ها را می‌گیرد (در نسخهٔ سروری، دادهٔ دمو نباید در باندل باشد)`);
  });

  await sec('server', 'بیرونی', 'برون‌فهمی ورود: ۲۵ تلاش ناموفق پشت‌سرهم بدون تأخیر/قفل', () => {
    W('S.user=null;render();'); // صفحهٔ ورود
    const t0 = Date.now();
    for (let i = 0; i < 25; i++) {
      W(`document.getElementById('lu').value='superadmin';document.getElementById('lp').value='wrong-${i}'`);
      clk('login');
      const one = Date.now() - t0;
      if (one > 300) { /* تأخیر تصاعدی فعال شده */ break; }
    }
    const dt = Date.now() - t0;
    W(`document.getElementById('lu').value='superadmin';document.getElementById('lp').value='123456'`);
    clk('login');
    const canLogin = W('S.user && S.user.role === "superadmin"');
    assert(dt > 1500 || !canLogin,
      `🔴 ۲۵ تلاش ناموفق در ${dt}ms بدون هیچ تأخیر تصاعدی یا قفل — حدس رمز رایگان است (قرارداد بند ۲.۲ — سمت سرور)`);
    /* نکته: ورود موفقِ آخر همین‌جا پوستهٔ اپ را می‌سازد و بقیهٔ سناریوها
       با نشست زندهٔ سوپرادمین ادامه می‌دهند (bootstrap). */
    assert(W(`!!document.querySelector('.content')`), 'پوستهٔ اپ بعد از ورود نهایی رندر نشد');
  });

  console.log('\n▸ ب — XSS ذخیره‌شده (black-box): تزریق از فرم‌های واقعی، اسکن کل سند');

  /* B1 — عنوان اطلاعیه */
  await sec('client', 'XSS', 'عنوان اطلاعیه: payload parse نمی‌شود', () => {
    W(`S.user=db.users.find(u=>u.username==='manager1');S.persona=null;S.boss=null;S.route='announcements';S.filters={};`);
    W('annModal(null)');
    W(`document.getElementById('a_title').value=${JSON.stringify(PAYLOAD + ' اطلاعیه')}`);
    W(`document.getElementById('a_body').value='متن آزمایشی'`);
    clk('ann-save');
    const h1 = W('render()');
    /* نگهبان صوری‌نبودی: payload (فرار‌شده) واقعاً باید در DOM باشد —
       وگرنه این آزمون چیزی نمی‌سنجد (دام آزمون، بند ۵.۳۱) */
    const mainHtml = W(`document.querySelector('.content').innerHTML`);
    assert(mainHtml.indexOf('id=' + SENTINEL) > -1, 'خروجی در DOM نشست؟ آزمون صوری است (نمای اطلاعیه payload را نشان نمی‌دهد)');
    const asOther = W(`(function(){S.user=db.users.find(u=>u.username==='teacher1_1');S.filters={};S.route='announcements';var h=render();S.user=db.users.find(u=>u.username==='manager1');return h;})()`);
    assert(sentinelAlive() === false, '🔴 payload در عنوان اطلاعیه به‌عنوان HTML اجرا/parse شد (نمای ایجادکننده)');
    /* پاک‌سازی */
    W(`(function(){var a=db.announcements.find(x=>String(x.title||'').indexOf('${SENTINEL}')>-1);if(a)remove('announcements',a.id);})()`);
    wipeSentinel();
  });

  /* B2 — متن اطلاعیه */
  await sec('client', 'XSS', 'متن اطلاعیه: payload parse نمی‌شود', () => {
    W(`S.user=db.users.find(u=>u.username==='manager1');S.persona=null;S.boss=null;S.route='announcements';S.filters={};`);
    W('annModal(null)');
    W(`document.getElementById('a_title').value='آزمون متن'`);
    W(`document.getElementById('a_body').value=${JSON.stringify(PAYLOAD)}`);
    clk('ann-save');
    W('render()');
    assert(sentinelAlive() === false, '🔴 payload در متن اطلاعیه parse شد');
    W(`(function(){var a=db.announcements.find(x=>String(x.body||'').indexOf('${SENTINEL}')>-1);if(a)remove('announcements',a.id);})()`);
    wipeSentinel();
  });

  /* B3 — پیام چت */
  await sec('client', 'XSS', 'پیام چت: payload parse نمی‌شود', () => {
    W(`S.user=db.users.find(u=>u.username==='teacher1_1');S.persona=null;S.boss=null;`);
    const r = JSON.parse(W(`(()=>{
      var st=db.users.find(u=>u.role==='student'&&u.school_id===S.user.school_id);
      return JSON.stringify({partner:st?st.id:null});})()`));
    assert(r.partner, 'مخاطب چت پیدا نشد');
    W(`S.route='chat';S.filters={chat:${r.partner}};`);
    W('render()');
    /* جعبهٔ چت فقط وقتی روت چت فعال است رندر می‌شود */
    const hasBox = W(`!!document.getElementById('chat_body')`);
    assert(hasBox, 'جعبهٔ چت رندر نشد (ایدیوم تغییر کرده)');
    W(`document.getElementById('chat_body').value=${JSON.stringify(PAYLOAD)}`);
    clk('chat-send', { id: r.partner });
    W('render()');
    assert(sentinelAlive() === false, '🔴 payload در پیام چت parse شد');
    W(`(function(){var m=db.messages.filter(x=>String(x.body).indexOf('${SENTINEL}')>-1);m.forEach(x=>remove('messages',x.id));})()`);
    wipeSentinel();
  });

  /* B4 — نام دانش‌آموز (خروجی: فهرست کاربران + پرونده + اعلان چت) */
  await sec('client', 'XSS', 'نام کاربر (full_name): payload در هیچ نمای کاربر parse نمی‌شود', () => {
    W(`S.user=db.users.find(u=>u.username==='superadmin');S.persona=null;S.boss=null;S.route='users';S.filters={};`);
    W('userModal(null)');
    W(`document.getElementById('u_name').value=${JSON.stringify(PAYLOAD)}`);
    W(`document.getElementById('u_user').value='xsstest${Date.now()}'`);
    W(`document.getElementById('u_role').value='student'`);
    clk('user-save');
    const uid = W(`db.users[db.users.length-1].id`);
    W(`S.route='users';S.filters={q:'xsstest'};render();`);
    const inUsers = sentinelAlive();
    W(`S.route='record';S.filters={student:${uid}};render();`);
    const inRecord = sentinelAlive();
    assert(inUsers === false && inRecord === false,
      '🔴 payload در نام کاربر parse شد (users=' + inUsers + ', record=' + inRecord + ')');
    W(`remove('users',${uid});`);
    wipeSentinel();
  });

  /* B5 — یادداشت مشاور در رسیدگی ارجاع */
  await sec('client', 'XSS', 'یادداشت مشاور (ch_note): payload parse نمی‌شود', () => {
    const r = JSON.parse(W(`(()=>{
      var sid=db.schools[0].id;
      var ref=db.counselor_refs.find(x=>x.school_id===sid&&x.status==='open');
      var cou=db.users.find(u=>u.role==='counselor'&&u.school_id===sid);
      return JSON.stringify({ref:ref?ref.id:null,cou:cou?cou.username:null});})()`));
    if (!r.ref) {
      /* ارجاع باز نبود؛ یک ارجاع آزمایشی می‌سازیم و پاک می‌کنیم */
      W(`(function(){var sid=db.schools[0].id;var f=patternFlagged(sid,30)[0];var m=db.users.find(u=>u.role==='manager'&&u.school_id===sid);S.user=m;var rec=insert('counselor_refs',{school_id:sid,student_id:f.user.id,breach_key:'late',reason:'test',pattern:{},referred_by:m.id,status:'open',created_at:new Date().toISOString()});window._tmpref=rec.id;})()`);
      r.ref = W('window._tmpref');
    }
    W(`S.user=db.users.find(u=>u.username===${JSON.stringify(r.cou)});S.persona=null;S.boss=null;S.route='cqueue';S.filters={};render();`);
    const hasNote = W(`!!document.getElementById('ch_note_${r.ref}')`);
    assert(hasNote, 'جعبهٔ یادداشت مشاور رندر نشد (ایدیوم تغییر کرده)');
    W(`document.getElementById('ch_note_${r.ref}').value=${JSON.stringify(PAYLOAD)}`);
    clk('counselor-handle', { r: r.ref });
    W('render()');
    assert(sentinelAlive() === false, '🔴 payload در یادداشت مشاور parse شد');
    if (W('window._tmpref') === r.ref) W(`remove('counselor_refs',${r.ref});`);
    wipeSentinel();
  });

  /* B6 — نام کلاس (بازگشتی از شبیه‌سازی) */
  await sec('client', 'XSS', 'نام کلاس: payload parse نمی‌شود (regression)', () => {
    W(`S.user=db.users.find(u=>u.username==='manager1');S.persona=null;S.boss=null;S.route='classes';S.filters={};`);
    W('classModal(null)');
    W(`document.getElementById('c_name').value=${JSON.stringify(PAYLOAD)}`);
    W(`document.getElementById('c_grade').value='ششم'`);
    W(`(function(){var el=document.getElementById('c_mode');el.value='class';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    clk('class-save');
    const cid = W('db.classes[db.classes.length-1].id');
    W('render()');
    assert(sentinelAlive() === false, '🔴 payload در نام کلاس parse شد');
    W(`applyOp({c:'classes',t:'del',id:${cid}})`);
    wipeSentinel();
  });

  /* B7 — جعبهٔ تأیید حذف (askConfirm) */
  await sec('client', 'XSS', 'جعبهٔ تأیید حذف با عنوان payload: parse نمی‌شود', () => {
    W(`S.user=db.users.find(u=>u.username==='manager1');S.persona=null;S.boss=null;`);
    W(`(function(){var a=add('announcements',{school_id:db.schools[0].id,title:${JSON.stringify(PAYLOAD)},body:'x',audience:'all',created_by:S.user.id});window._ann=a.id;})()`);
    clk('ann-del', { id: W('window._ann') });
    const h = W(`document.getElementById('modal').innerHTML`);
    assert(sentinelAlive() === false, '🔴 payload در جعبهٔ تأیید parse شد');
    W('closeModal()');
    W(`remove('announcements',window._ann);`);
    wipeSentinel();
  });

  console.log('\n▸ ج — نشت داده از کانال‌های خروجی');

  await sec('client', 'نشت', 'فایل پشتیبان خروجی: رمز کاربرِ ساخته‌شده در فایل نمی‌ماند', () => {
    W(`S.user=db.users.find(u=>u.username==='superadmin');S.persona=null;S.boss=null;`);
    const secret = 'sec' + Date.now();
    W('userModal(null)');
    W(`document.getElementById('u_name').value='کاربر آزمایشی'`);
    W(`document.getElementById('u_user').value='sectest${Date.now()}'`);
    W(`document.getElementById('u_role').value='student'`);
    W(`document.getElementById('u_pass').value=${JSON.stringify(secret)}`);
    clk('user-save');
    const uid = W('db.users[db.users.length-1].id');
    const backup = JSON.parse(W(`JSON.stringify(buildBackup())`));
    const blob = JSON.stringify(backup);
    assert(blob.indexOf(secret) === -1,
      '🔴 فایل پشتیبان (قابل دانلود) حاوی رمز متن‌سادهٔ کاربرِ تازه‌ساخته است — هرکس فایل را داشته باشد، وارد حساب می‌شود');
    W(`remove('users',${uid});`);
  });

  await sec('client', 'نشت', 'پشتیبان: فقط دفترچهٔ عملیات، نه کل پایگاه (طراحی مصوب)', () => {
    const backup = JSON.parse(W('JSON.stringify(buildBackup())'));
    assert(backup.format === 'payesh-backup' && Array.isArray(backup.ops), 'ساختار پشتیبان تغییر کرده');
    assert(backup.users === undefined || backup.users === 0, 'پشتیبان دیگر کل DB را حمل می‌کند!');
  });

  /* ── نتیجه ── */
  const client = results.filter(r => r.kind === 'client');
  const server = results.filter(r => r.kind === 'server');
  const cOk = client.filter(r => r.ok).length;
  const sOk = server.filter(r => r.ok).length;

  console.log('\n' + '─'.repeat(62));
  for (const r of results) {
    console.log(`  ${r.ok ? '✅' : '❌'} [${r.kind}] [${r.section}] ${r.name}${r.ok ? '' : '\n     ' + r.detail}`);
  }
  console.log('─'.repeat(62));
  console.log(`  سمت کاربر (باید سبز): ${cOk}/${client.length}`);
  console.log(`  بلوک‌کننده‌های سروری (exploit زنده، تا کار سروری قرمز): ${sOk}/${server.length}`);
  console.log('──────────────────────────────────────────────────────────');
  console.log(cOk === client.length
    ? `پنتست: همهٔ نگهبان‌های سمت کاربر سبز ✅ — ${server.length - sOk} بلوک‌کنندهٔ سروری مستند با exploit`
    : `پنتست: ${client.length - cOk} باگ واقعیِ سمت کاربر 🔴 + ${server.length - sOk} بلوک‌کنندهٔ سروری`);
  if (consoleErrors.length) {
    console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
    consoleErrors.slice(0, 8).forEach(e => console.log('   ' + String(e).slice(0, 160)));
  }
  process.exit(cOk === client.length ? 0 : 1);
}
