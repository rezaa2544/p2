#!/usr/bin/env node
/**
 * نمونهٔ دوسطحی اداره‌ها برای دستهٔ D (پیش‌نویسِ چت ۱ برای چت ۲ — تصمیم نهایی با چت ۲).
 *
 * - کاملاً مستقل: چیزی را نمی‌خواند، به هیچ‌جا سیم‌کشی نشده، فقط JSON نمونه چاپ می‌کند.
 * - فرض‌های پیش‌نویس (قابل تغییر توسط چت ۲): پرچم `is_head` برای تمایز رئیس از کارشناس؛
 *   قاعدهٔ سازگاری سطح/جغرافیا از `docs/D_OFFICE_LEVEL_ANALYSIS.md` §۵.
 * - نام‌ها/کدها ساختگی‌اند (الگوی دمو: 0999 و 999).
 *
 * اجرا:  node tools/seed-office-data.js
 */
const sample = {
  _draft: 'D-category two-level office sample — Chat1 proposal for Chat2 (2026-09-08). NOT wired anywhere.',
  provinces: [
    { id: 901, name: 'استان نمونه', code: 'P901' },
  ],
  counties: [
    { id: 9011, province_id: 901, name: 'شهرستان نمونه', code: 'C9011' },
  ],
  districts: [
    { id: 90111, province_id: 901, county_id: 9011, name: 'ناحیه ۱ نمونه', kind: 'district' },
    { id: 90112, province_id: 901, county_id: 9011, name: 'ناحیه ۲ نمونه', kind: 'district' },
  ],
  offices: [
    { id: 901, name: 'اداره کل استان نمونه', level: 'province', province_id: 901, county_id: null, district_id: null, active: 1 },
    { id: 9011, name: 'اداره شهرستان نمونه', level: 'county', province_id: 901, county_id: 9011, district_id: null, active: 1 },
    { id: 90111, name: 'اداره ناحیه ۱ نمونه', level: 'district', province_id: 901, county_id: 9011, district_id: 90111, active: 1 },
    { id: 90112, name: 'اداره ناحیه ۲ نمونه', level: 'district', province_id: 901, county_id: 9011, district_id: 90112, active: 1 },
  ],
  users: [
    { username: 'head_province901', role: 'edu_office', office_id: 901, is_head: 1, full_name: 'رئیس اداره کل استان نمونه' },
    { username: 'expert_province901', role: 'edu_office', office_id: 901, is_head: 0, full_name: 'کارشناس اداره کل استان نمونه' },
    { username: 'head_district90111', role: 'edu_office', office_id: 90111, is_head: 1, full_name: 'رئیس اداره ناحیه ۱ نمونه' },
    { username: 'expert_district90111', role: 'edu_office', office_id: 90111, is_head: 0, full_name: 'کارشناس اداره ناحیه ۱ نمونه' },
  ],
  schools_link: 'هر مدرسهٔ نمونه: province_id=901، county_id=9011، و district_id یکی از 90111/90112',
};

/* خودسنجی سبک: سازگاری سطح/جغرافیا (همان قاعدهٔ §۵ سند تحلیل) */
function comboOk(o) {
  if (o.level === 'province') return o.province_id != null && o.county_id == null && o.district_id == null;
  if (o.level === 'county') return o.province_id != null && o.county_id != null && o.district_id == null;
  if (o.level === 'district') return o.province_id != null && o.county_id != null && o.district_id != null;
  return false;
}
const bad = sample.offices.filter((o) => !comboOk(o));
if (bad.length) { console.error('DRAFT-INVALID: ' + JSON.stringify(bad.map((o) => o.id))); process.exit(1); }
console.log(JSON.stringify(sample, null, 2));
