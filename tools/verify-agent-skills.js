#!/usr/bin/env node
/**
 * tools/verify-agent-skills.js — راستی‌آزمایی جامع فریم‌ورک مهارت‌های هوش مصنوعی (AI Skills)
 * 
 * بررسی وجود و سلامت ۷ مهارت رسمی مهندسی:
 *  ۱. interview-me (addyosmani/agent-skills)
 *  ۲. agent-watchdog (BuilderIO/skills)
 *  ۳. plan-arbiter (BuilderIO/skills)
 *  ۴. systematic-debugging (obra/superpowers)
 *  ۵. verification-before-completion (obra/superpowers)
 *  ۶. frontend-design (anthropics/skills)
 *  ۷. read-the-damn-docs (BuilderIO/skills)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(ROOT_DIR, '.agent', 'skills');

const EXPECTED_SKILLS = [
  {
    name: 'interview-me',
    repo: 'addyosmani/agent-skills',
    purpose: 'استخراج شفاف نیازمندی‌ها قبل از اجرا با پرسش‌های هدفمند'
  },
  {
    name: 'agent-watchdog',
    repo: 'BuilderIO/skills',
    purpose: 'نظارت بر عملکرد ایجنت و جلوگیری از اجرای خطا و شکاف راستی‌آزمایی'
  },
  {
    name: 'plan-arbiter',
    repo: 'BuilderIO/skills',
    purpose: 'مقایسه پلن‌های رقیب، ارزیابی مصالحه‌ها و انتخاب جهت‌گیری اجرایی'
  },
  {
    name: 'systematic-debugging',
    repo: 'obra/superpowers',
    purpose: 'خطایابی گام‌به‌گام ریشه‌ای و مهار دستکاری‌های کورکورانه'
  },
  {
    name: 'verification-before-completion',
    repo: 'obra/superpowers',
    purpose: 'اجبار راستی‌آزمایی عینی با آزمون قبل از اعلام تکمیل کار'
  },
  {
    name: 'frontend-design',
    repo: 'anthropics/skills',
    purpose: 'طراحی رابط کاربری تمایزیافته و فرار از قالب‌های کلیشه‌ای هوش مصنوعی'
  },
  {
    name: 'read-the-damn-docs',
    repo: 'BuilderIO/skills',
    purpose: 'مطالعه مستندات موثق و قراردادهای رسمی قبل از حدس زدن'
  }
];

function verifyAgentSkills() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Payesh AI Skills Framework Verification Suite                   ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  assert(fs.existsSync(SKILLS_DIR), `پوشه مهارت‌ها در مسیر ${SKILLS_DIR} یافت نشد.`);

  let passed = 0;

  for (const skill of EXPECTED_SKILLS) {
    const skillPath = path.join(SKILLS_DIR, skill.name);
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    assert(fs.existsSync(skillPath), `پوشه مهارت "${skill.name}" وجود ندارد: ${skillPath}`);
    assert(fs.existsSync(skillMdPath), `فایل دستورالعمل SKILL.md برای مهارت "${skill.name}" یافت نشد: ${skillMdPath}`);

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    assert(content.length > 500, `محتوای فایل SKILL.md برای "${skill.name}" ناکافی یا ناقص است (${content.length} بایت).`);

    // بررسی وجود بخش‌های راهبردی
    assert(
      content.includes('#') || content.includes('---'),
      `فایل SKILL.md برای "${skill.name}" فاقد ساختار استاندارد Markdown است.`
    );

    console.log(`  ✅ [PASS] ${skill.name} (${skill.repo}) — ${skill.purpose}`);
    passed++;
  }

  // بررسی عدم ارجاع شکسته یا تداخل
  console.log('\n▸ ارزیابی ارتباطات و کشف‌پذیری مهارت‌ها:');
  const discoveredDirs = fs.readdirSync(SKILLS_DIR).filter(d => fs.statSync(path.join(SKILLS_DIR, d)).isDirectory());
  assert.strictEqual(discoveredDirs.length, EXPECTED_SKILLS.length, `تعداد مهارت‌های کشف‌شده (${discoveredDirs.length}) با تعداد مورد انتظار (${EXPECTED_SKILLS.length}) تطابق ندارد.`);
  console.log(`  ✅ هر ۷ مهارت رسمی با موفقیت کشف و راستی‌آزمایی شدند.`);

  console.log('\n───────────────────────────────────────────────────────────────────');
  console.log(`نتیجه: ${passed}/${EXPECTED_SKILLS.length} مهارت رسمی هوش مصنوعی فعال و معتبر هستند ✅`);
  console.log('───────────────────────────────────────────────────────────────────\n');
}

if (require.main === module) {
  try {
    verifyAgentSkills();
    process.exit(0);
  } catch (err) {
    console.error('❌ خطای راستی‌آزمایی مهارت‌های هوش مصنوعی:', err.message);
    process.exit(1);
  }
}

module.exports = { verifyAgentSkills, EXPECTED_SKILLS };
