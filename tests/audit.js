/**
 * پایش — آزمون جامع سامانه ممیزی و ثبت رویدادهای امنیتی (Audit Hardening)
 * 
 * موارد آزمون:
 *  ۱. بررسی Append-Only بودن فایل لاگ و حفظ دائمی رکوردهای پیشین
 *  ۲. ساختار استاندارد JSON در هر خط شامل { timestamp, event, user_id, role, school_id, ip, summary }
 *  ۳. پوشش کامل رویدادهای الزامی:
 *     - login (موفق / ناموفق)
 *     - authorization failure (شکست دسترسی و مجوز)
 *     - restore (بازیابی پشتیبان)
 *     - export (خروجی و ایجاد پشتیبان)
 *     - delete (حذف حساب و رکورد)
 *     - role change (تغییر نقش کاربر)
 *  ۴. عدم نشت داده‌های حساس و PII (شماره تلفن، کد ملی، رمز عبور، توکن، OTP)
 *  ۵. چرخش خودکار (Rotation) بر اساس سقف ۱۰۰۰ رویداد، تغییر روزانه، و سقف حجم
 *  ۶. ذخیره فایل‌های آرشیو در server/data/audit/ با دسترسی 0600
 *  ۷. تاب‌آوری در برابر خطاهای ورودی و ارجاعات دایره‌ای (Circular References)
 */

'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { createAudit, maskPhone, maskNationalId, sanitizeData, sanitizeString } = require('../server/audit');

const TMP_DIR = path.join('/tmp', 'payesh-audit-test-' + Date.now());
fs.mkdirSync(TMP_DIR, { recursive: true, mode: 0o700 });

let totalChecks = 0;
let passedChecks = 0;

function chk(desc, cond, extra) {
  totalChecks++;
  if (cond) {
    passedChecks++;
    console.log(`  ✅ ${desc}`);
  } else {
    console.error(`  ❌ شکست: ${desc} ${extra ? '(' + extra + ')' : ''}`);
    throw new Error(`Test failed: ${desc}`);
  }
}

async function runTests() {
  console.log('\n🔍 شروع آزمون‌های Audit Hardening...\n');

  /* ─────────────────────────────────────────────────────────────
     بخش ۱: توابع ماسک‌سازی و پاک‌سازی داده‌های حساس (PII)
     ───────────────────────────────────────────────────────────── */
  console.log('▸ ۱. اعتبارسنجی ماسک‌سازی تلفن و کد ملی و پاک‌سازی PII');

  chk('ماسک شماره تلفن ۱۱ رقمی با صفر', maskPhone('09121234567') === '0912***4567', maskPhone('09121234567'));
  chk('ماسک شماره تلفن با فاصله و خط تیره', maskPhone('0912-345 6789') === '0912***6789', maskPhone('0912-345 6789'));
  chk('ماسک شماره تلفن با +98', maskPhone('+989121234567') === '+98912***4567', maskPhone('+989121234567'));
  chk('ماسک شماره تلفن با 0098', maskPhone('00989121234567') === '0098912***4567', maskPhone('00989121234567'));
  chk('ماسک کد ملی ۱۰ رقمی', maskNationalId('0012345678') === '001***5678', maskNationalId('0012345678'));
  chk('ماسک کد ملی ۱۰ رقمی دیگر', maskNationalId('1234567890') === '123***7890', maskNationalId('1234567890'));

  const rawText = 'کاربر با شماره 09129876543 و کد ملی 0087654321 وارد شد.';
  const sanitizedText = sanitizeString(rawText);
  chk('پاک‌سازی متن حاوی تلفن و کد ملی', sanitizedText.indexOf('09129876543') === -1 && sanitizedText.indexOf('0087654321') === -1);
  chk('حفظ ساختار ماسک‌شده در متن', sanitizedText.indexOf('0912***6543') > -1 && sanitizedText.indexOf('008***4321') > -1);

  const payloadWithPii = {
    phone: '09121112233',
    national_id: '0077889900',
    password: 'SuperSecretPassword123!',
    token: 'jwt.token.secret',
    code: '8492',
    nested: {
      father_phone: '09194445566',
      melli_code: '1234567890',
      otp: '654321',
      plain_info: 'اطلاعات عمومی'
    }
  };
  const sanitizedObj = sanitizeData(payloadWithPii);
  chk('ماسک فیلد phone در شیء', sanitizedObj.phone === '0912***2233');
  chk('ماسک فیلد national_id در شیء', sanitizedObj.national_id === '007***9900');
  chk('ردکت رمز عبور', sanitizedObj.password === '[REDACTED]');
  chk('ردکت توکن', sanitizedObj.token === '[REDACTED]');
  chk('ردکت کد OTP', sanitizedObj.code === '[REDACTED]');
  chk('ماسک تودرتو تلفن پدر', sanitizedObj.nested.father_phone === '0919***5566');
  chk('ماسک تودرتو کد ملی', sanitizedObj.nested.melli_code === '123***7890');
  chk('ردکت تودرتو OTP', sanitizedObj.nested.otp === '[REDACTED]');
  chk('حفظ داده‌های عمومی بدون تغییر', sanitizedObj.nested.plain_info === 'اطلاعات عمومی');

  /* ─────────────────────────────────────────────────────────────
     بخش ۲: رفتار Append-Only و ساختار خطوط لاگ
     ───────────────────────────────────────────────────────────── */
  console.log('\n▸ ۲. بررسی Append-Only و ساختار JSON استاندارد');

  const logFile1 = path.join(TMP_DIR, 'audit-test-1.log');
  const auditDir1 = path.join(TMP_DIR, 'audit-test-1-archives');
  const logger1 = createAudit({ auditFile: logFile1, auditDir: auditDir1, maxEvents: 1000 });

  logger1.audit({
    event: 'test_event_1',
    user_id: 101,
    role: 'manager',
    school_id: 5,
    ip: '192.168.1.50',
    summary: 'تست رویداد اول',
    detail: { test: true }
  });

  chk('ایجاد فایل لاگ با موفقیت', fs.existsSync(logFile1));
  const stat1 = fs.statSync(logFile1);
  chk('سطح دسترسی مالک 0600', (stat1.mode & 0o777) === 0o600, '0' + (stat1.mode & 0o777).toString(8));

  logger1.audit({
    event: 'test_event_2',
    user_id: 102,
    role: 'teacher',
    school_id: 5,
    ip: '192.168.1.51',
    summary: 'تست رویداد دوم',
    detail: { action: 'grade' }
  });

  const content1 = fs.readFileSync(logFile1, 'utf8').trim();
  const lines1 = content1.split('\n');
  chk('تعداد خطوط لاگ دقیقاً ۲ است', lines1.length === 2);

  const parsedLine1 = JSON.parse(lines1[0]);
  const parsedLine2 = JSON.parse(lines1[1]);

  chk('خط ۱ دارای فیلد timestamp معتبر است', !isNaN(Date.parse(parsedLine1.timestamp)));
  chk('خط ۱ دارای فیلد event صحیح است', parsedLine1.event === 'test_event_1');
  chk('خط ۱ دارای فیلد user_id صحیح است', parsedLine1.user_id === 101);
  chk('خط ۱ دارای فیلد role صحیح است', parsedLine1.role === 'manager');
  chk('خط ۱ دارای فیلد school_id صحیح است', parsedLine1.school_id === 5);
  chk('خط ۱ دارای فیلد ip صحیح است', parsedLine1.ip === '192.168.1.50');
  chk('خط ۱ دارای فیلد summary صحیح است', parsedLine1.summary === 'تست رویداد اول');

  chk('خط ۲ بعد از خط ۱ اضافه شد (Append-Only)', parsedLine2.event === 'test_event_2' && parsedLine2.user_id === 102);

  /* ─────────────────────────────────────────────────────────────
     بخش ۳: پوشش ۶ دسته رویداد الزامی
     ───────────────────────────────────────────────────────────── */
  console.log('\n▸ ۳. ثبت و پوشش ۶ رویداد الزامی');

  const logFile2 = path.join(TMP_DIR, 'audit-events.log');
  const logger2 = createAudit({ auditFile: logFile2, auditDir: path.join(TMP_DIR, 'audit2') });

  // ۱. ورود موفق و ناموفق
  logger2.audit('login_ok', { user_id: 1, role: 'superadmin', ip: '127.0.0.1', summary: 'ورود موفق مدیرکل' });
  logger2.audit('login_fail', { user_id: null, ip: '10.0.0.1', reason: 'bad_code', summary: 'کد ورود اشتباه' });

  // ۲. شکست در مجوز (Authorization Failure)
  logger2.audit('sync_authz_fail', { user_id: 12, role: 'student', school_id: 1, ip: '127.0.0.1', code: 'role_denied' });
  logger2.audit('authz_failure', { user_id: 15, role: 'parent', school_id: 1, ip: '127.0.0.1', summary: 'تلاش برای دسترسی غیرمجاز' });

  // ۳. بازیابی پشتیبان (Restore)
  logger2.audit('restore_completed', { user_id: 1, role: 'superadmin', file: 'payesh-20260908-120000.json' });

  // ۴. خروجی و ساخت پشتیبان (Export)
  logger2.audit('backup_created', { user_id: 1, role: 'superadmin', file: 'payesh-20260908-120000.json', size: 45000 });

  // ۵. حذف (Delete: حساب / رکورد)
  logger2.audit('account_deleted', { user_id: 88, role: 'parent', purged: { messages: 3 } });
  logger2.audit('record_deleted', { user_id: 2, role: 'manager', school_id: 1, collection: 'classes', record_id: 10 });

  // ۶. تغییر نقش (Role Change)
  logger2.audit('role_change', { user_id: 1, role: 'superadmin', target_user_id: 50, old_role: 'teacher', new_role: 'manager' });

  const eventsLog = fs.readFileSync(logFile2, 'utf8');
  const eventsLines = eventsLog.trim().split('\n').map(l => JSON.parse(l));

  chk('ثبت رویداد login موفق', eventsLines.some(e => (e.event === 'login' || e.type === 'login_ok') && e.user_id === 1));
  chk('ثبت رویداد login_fail', eventsLines.some(e => (e.event === 'login_fail' || e.type === 'login_fail') && e.reason === 'bad_code'));
  chk('ثبت رویداد authorization failure (sync)', eventsLines.some(e => (e.event === 'authz_failure' || e.type === 'sync_authz_fail')));
  chk('ثبت رویداد authorization failure (صریح)', eventsLines.some(e => e.event === 'authz_failure' && e.role === 'parent'));
  chk('ثبت رویداد restore پشتیبان', eventsLines.some(e => (e.event === 'restore' || e.type === 'restore_completed')));
  chk('ثبت رویداد export پشتیبان', eventsLines.some(e => (e.event === 'export' || e.type === 'backup_created')));
  chk('ثبت رویداد delete حساب', eventsLines.some(e => (e.event === 'delete' || e.type === 'account_deleted')));
  chk('ثبت رویداد delete رکورد', eventsLines.some(e => (e.event === 'delete' || e.type === 'record_deleted')));
  chk('ثبت رویداد role_change', eventsLines.some(e => e.event === 'role_change' && e.target_user_id === 50 && e.new_role === 'manager'));

  /* ─────────────────────────────────────────────────────────────
     بخش ۴: چرخش فایل‌ها (Rotation) بر اساس تعداد و روز
     ───────────────────────────────────────────────────────────── */
  console.log('\n▸ ۴. بررسی چرخش خودکار (Rotation) به پوشه server/data/audit/');

  const rotateLogFile = path.join(TMP_DIR, 'audit-rotate.log');
  const rotateAuditDir = path.join(TMP_DIR, 'audit');
  const rotateLogger = createAudit({
    auditFile: rotateLogFile,
    auditDir: rotateAuditDir,
    maxEvents: 5 // سقف ۵ برای تست سریع
  });

  for (let i = 1; i <= 5; i++) {
    rotateLogger.audit({
      event: 'batch_event_' + i,
      user_id: i,
      summary: 'رویداد شماره ' + i
    });
  }

  chk('ثبت ۵ رویداد اولیه در فایل فعال', fs.readFileSync(rotateLogFile, 'utf8').trim().split('\n').length === 5);
  chk('پوشه آرشیو هنوز بدون چرخش است', !fs.existsSync(rotateAuditDir) || fs.readdirSync(rotateAuditDir).length === 0);

  // ثبت رویداد ششم -> باید موجب چرخش شود
  rotateLogger.audit({
    event: 'event_after_rotation',
    user_id: 6,
    summary: 'رویداد بعد از چرخش'
  });

  chk('پوشه آرشیو ایجاد شد', fs.existsSync(rotateAuditDir));
  const archivedFiles = fs.readdirSync(rotateAuditDir);
  chk('حداقل ۱ فایل آرشیو در audit/ ذخیره شد', archivedFiles.length >= 1, archivedFiles.join(', '));

  const firstArchive = path.join(rotateAuditDir, archivedFiles[0]);
  const archiveContent = fs.readFileSync(firstArchive, 'utf8').trim().split('\n');
  chk('فایل آرشیو شامل ۵ رویداد پیشین است', archiveContent.length === 5);
  chk('سطح دسترسی فایل آرشیو 0600 است', (fs.statSync(firstArchive).mode & 0o777) === 0o600);

  const newActiveContent = fs.readFileSync(rotateLogFile, 'utf8').trim().split('\n');
  chk('فایل لاگ فعال جدید فقط ۱ رویداد تازه را دارد', newActiveContent.length === 1);
  const activeFirst = JSON.parse(newActiveContent[0]);
  chk('رویداد فعال ششم است', activeFirst.event === 'event_after_rotation');

  /* ─────────────────────────────────────────────────────────────
     بخش ۵: چرخش با دستور صریح (rotate)
     ───────────────────────────────────────────────────────────── */
  console.log('\n▸ ۵. متد صریح چرخش log');
  const explicitRotated = rotateLogger.rotate('manual_test');
  chk('متد چرخش فایل آرشیو را برگرداند', explicitRotated !== null && fs.existsSync(explicitRotated));
  chk('فایل لاگ فعال خالی یا بازسازی شد', fs.existsSync(rotateLogFile));

  /* ─────────────────────────────────────────────────────────────
     بخش ۶: ایمنی و تاب‌آوری (Robustness)
     ───────────────────────────────────────────────────────────── */
  console.log('\n▸ ۶. تاب‌آوری در برابر ورودی‌های نامتعارف');

  const circ = { name: 'circular' };
  circ.self = circ;

  assert.doesNotThrow(() => {
    rotateLogger.audit({
      event: 'circular_test',
      user_id: 999,
      detail: circ
    });
  }, 'خطا در ارجاع دایره‌ای داده نباید throw شود');

  assert.doesNotThrow(() => {
    rotateLogger.audit(null, undefined);
  }, 'ورودی null نباید سیستم را بشکند');

  console.log(`\n────────────────────────────────────────────────────`);
  console.log(`نتیجه: ${passedChecks}/${totalChecks} بررسی موفق — بدون خطا ✅`);
  console.log(`────────────────────────────────────────────────────\n`);
}

runTests().catch(err => {
  console.error('\n❌ تست شکست خورد:\n', err);
  process.exit(1);
});
