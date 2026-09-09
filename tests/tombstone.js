#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   P0-17 — حذف امن: سنگ‌قبر + نسخه + رویداد برون‌مرزی (جای اسپلایسِ خام)
   ۱) حذف → رکورد از مجموعهٔ زنده می‌رود ولی کامل بایگانی می‌شود
   ۲) سنگ‌قبر متادیتا دارد (چه کسی، کِی، کدام مجموعه)
   ۳) نسخهٔ رکورد پیش از بایگانی بالا می‌رود
   ۴) رویدادِ `<col>.deleted` به صندوق برون‌مرزی می‌رود
   ۵) حذفِ دوباره → ۴۰۴ و سنگ‌قبرِ تکراری نمی‌سازد
   ۶) برابریِ چندفیلدی (دانش‌آموز: نقش هم باید بخورد)
   ۷) سقفِ صندوق رعایت می‌شود
   ۸) مسیرهای واقعی: حذفِ کلاس از روی HTTP → ۲۰۰، سپس ۴۰۴ + سنگ‌قبر
   اجرا:  node tests/tombstone.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { createDeleteService } = require(path.join(ROOT, 'server', 'delete-service.js'));
const { createOutbox } = require(path.join(ROOT, 'server', 'outbox.js'));

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

function makeWorld() {
  const store = {
    classes: [{ id: 1, name: 'یکم', school_id: 1, version: 1 }, { id: 2, name: 'دوم', school_id: 1 }],
    users: [
      { id: 10, full_name: 'دانش‌آموز الف', role: 'student', school_id: 1 },
      { id: 11, full_name: 'معلم ب', role: 'teacher', school_id: 1 }
    ],
    attendance: [], grades: []
  };
  let dirty = 0;
  const ops = [];
  const db = { persistOp: async (op) => { ops.push(op); }, isPostgres: () => false };
  const outbox = createOutbox({ store, db: null });
  const deleter = createDeleteService({ store, db, markDirty: () => dirty++, outbox });
  return { store, deleter, outbox, ops, getDirty: () => dirty };
}

async function main() {
  console.log('▸ P0-17 — حذف امن با سنگ‌قبر');

  // ۱ تا ۵) رفتار پایهٔ سرویس
  {
    const w = makeWorld();
    const actor = { id: 99 };
    const r = await w.deleter.softDelete('classes', { id: 1 }, {
      actor, audit: () => {}
    });
    chk('حذف موفق است', r.ok === true && r.status === 200);
    chk('رکورد از مجموعهٔ زنده رفته', !(w.store.classes || []).some(c => c.id === 1));
    const tomb = (w.store.tombstones || [])[0];
    chk('سنگ‌قبرِ کامل ثبت شده', !!(tomb && tomb.record && tomb.record.id === 1 && tomb.record.name === 'یکم'));
    chk('متادیتای حذف دارد', !!(tomb && tomb.collection === 'classes' && tomb.deleted_by === 99 && tomb.deleted_at));
    chk('نسخه پیش از بایگانی بالا رفته', tomb && tomb.record.version === 2, 'version=' + (tomb && tomb.record.version));
    const evt = (w.store.outbox || [])[0];
    chk('رویداد برون‌مرزی نشسته', !!(evt && evt.type === 'classes.deleted' && evt.record_id === 1 && evt.actor_id === 99 && evt.version === 2));
    chk('عملیات حذف به پستگرس رفته', w.ops.length === 1 && w.ops[0].t === 'del' && w.ops[0].id === 1);
    chk('فروشگاه کثیف شده', w.getDirty() === 1);

    const again = await w.deleter.softDelete('classes', { id: 1 }, { actor, audit: () => {} });
    chk('حذف دوباره → ۴۰۴', again.ok === false && again.status === 404);
    chk('سنگ‌قبر تکراری نساخته', w.store.tombstones.length === 1);
    chk('رویداد تکراری نساخته', w.store.outbox.length === 1);
  }

  // ۶) برابری چندفیلدی — حذف کاربر فقط وقتی نقش دانش‌آموز است
  {
    const w = makeWorld();
    const actor = { id: 99 };
    const asStudent = await w.deleter.softDelete('users', { id: 11, role: 'student' }, { actor, audit: () => {} });
    chk('معلم با فیلتر دانش‌آموز حذف نمی‌شود', asStudent.ok === false && asStudent.status === 404);
    chk('معلم هنوز زنده است', w.store.users.some(u => u.id === 11));
    const real = await w.deleter.softDelete('users', { id: 10, role: 'student' }, { actor, audit: () => {} });
    chk('دانش‌آموز با فیلتر درست حذف می‌شود', real.ok === true);
    chk('سنگ‌قبرِ کاربر ثبت شده', w.store.tombstones.some(t => t.collection === 'users' && t.record.id === 10));
  }

  // ۷) سقف صندوق
  {
    const w = makeWorld();
    for (let i = 0; i < 1005; i++) await w.outbox.append({ type: 't', collection: 'classes', record_id: i });
    chk('صندوق در سقف می‌ماند', w.store.outbox.length === w.outbox.cap, 'len=' + w.store.outbox.length);
    chk('قدیمی‌ها سر خورده‌اند', w.store.outbox[0].record_id === 5, 'first=' + w.store.outbox[0].record_id);
  }

  // ۸) مسیر واقعی HTTP: حذف کلاس → ۲۰۰، سپس ۴۰۴ + سنگ‌قبر (فروشگاهِ ایزولهٔ موقت)
  {
    const { spawn } = require('child_process');
    const http = require('http');
    const fs = require('fs');
    const os = require('os');
    const PORT = 8964;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-tomb-'));
    const tmpStore = path.join(tmpDir, 's.json');
    fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), tmpStore);
    const env = Object.assign({}, process.env, {
      PORT: String(PORT), HOST: '127.0.0.1',
      PAYESH_STORE: tmpStore,
      PAYESH_AUDIT: path.join(tmpDir, 'a.log'),
      PAYESH_KEY: path.join(tmpDir, 'k.key'),
      PAYESH_DEMO_CODE: '1'
    });
    delete env.NODE_ENV; delete env.REDIS_URL;
    const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', d => (log += d)); child.stderr.on('data', d => (log += d));
    const req = (method, p, body, cookie) => new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
        headers: Object.assign({ 'content-type': 'application/json' }, data ? { 'content-length': Buffer.byteLength(data) } : {}, cookie ? { cookie } : {}) },
        (res) => { let b = ''; res.on('data', d => (b += d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b })); });
      r.on('error', reject); if (data) r.write(data); r.end();
    });
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let up = false;
    for (let i = 0; i < 60; i++) { try { await req('GET', '/api/health'); up = true; break; } catch (e) { await sleep(200); } }
    if (!up) {
      chk('سرور تست بالا آمد', false, log.slice(0, 300));
    } else {
      chk('سرور تست بالا آمد', true);
      /* ورود با حساب سوپرادمینِ دمو: ارسال کد (بازپس‌دهی در حالت تست) سپس ورود */
      const PHONE = '09999838444', NID = '9993235245';
      const sc = await req('POST', '/api/auth/send-code', { phone: PHONE });
      let code = null; try { code = JSON.parse(sc.body).demo_code; } catch (e) {}
      let cookie = null;
      if (code) {
        const lg = await req('POST', '/api/auth/login', { phone: PHONE, code, national_id: NID });
        if (lg.status === 200) cookie = (lg.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
      }
      if (!cookie) {
        chk('نشست سوپرادمین گرفته شد', false, 'send=' + sc.status + ' code=' + code);
      } else {
        chk('نشست سوپرادمین گرفته شد', true);
        const mk = await req('POST', '/api/v1/classes', { name: 'کلاس حذفی', grade: 10, school_id: 1 }, cookie);
        let cls = null; try { cls = JSON.parse(mk.body).data; } catch (e) {}
        if (mk.status !== 201 || !cls) {
          chk('کلاس تستی ساخته شد', false, mk.status + ' ' + mk.body.slice(0, 200));
        } else {
          chk('کلاس تستی ساخته شد', true);
          const clsId = cls.id;
          const d1 = await req('DELETE', '/api/v1/classes/' + clsId, null, cookie);
          chk('حذف از مسیر واقعی ۲۰۰ است', d1.status === 200, d1.status + ' ' + d1.body.slice(0, 200));
          const d2 = await req('GET', '/api/v1/classes/' + clsId, null, cookie);
          chk('بعد از حذف ۴۰۴ است', d2.status === 404, 'got=' + d2.status);
          const d3 = await req('DELETE', '/api/v1/classes/' + clsId, null, cookie);
          chk('حذف دوباره ۴۰۴ است', d3.status === 404, 'got=' + d3.status);
        }
      }
    }
    /* خروج آرام → اسنپ‌شاتِ پایانی نوشته می‌شود */
    child.kill('SIGTERM');
    await new Promise(r => child.on('exit', r));
    await sleep(100);
    /* تأیید سنگ‌قبر و رویداد در اسنپ‌شاتِ فروشگاهِ ایزوله */
    let snap = null;
    try { snap = JSON.parse(fs.readFileSync(tmpStore, 'utf8')); } catch (e) {}
    const tombOk = !!(snap && Array.isArray(snap.tombstones) && snap.tombstones.some(t => t.collection === 'classes' && t.record && t.record.name === 'کلاس حذفی'));
    const outboxOk = !!(snap && Array.isArray(snap.outbox) && snap.outbox.some(e => e.type === 'classes.deleted'));
    chk('سنگ‌قبر در اسنپ‌شات ذخیره شده', tombOk);
    chk('رویداد حذف در اسنپ‌شات ذخیره شده', outboxOk);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\ntombstone (P0-17): ${pass}/${pass + fail} ${fail === 0 ? 'موفق' : 'شکست'}  ${fail === 0 ? '—  بدون خطا ✅' : ''}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('خطای غیرمنتظره:', e); process.exit(1); });
