#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   دور ۷۳ — بستنِ پایش: ابزارِ seed (فایلِ PII با 0600 نوشته شود)
     Z1  seed اجرا می‌شود و store را با mode 0600 می‌نویسد
     Z2  store دترمینیک است: محتوای storeِ committed دست‌نخورده می‌ماند
     Z3  (موتانت: حذفِ mode ⇒ Z1 می‌شکند)
   اجرا: node tests/security_seed.js
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'server/data/payesh.json');
let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); }
}
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function main() {
  console.log('\n▸ دور ۷۳ — ابزارِ seed (بستنِ پایش)');
  const before = sha(STORE);
  const beforeRaw = fs.readFileSync(STORE, 'utf8');
  const modeBefore = fs.statSync(STORE).mode & 0o777;
  if (modeBefore === 0o600) fs.chmodSync(STORE, 0o644); /* Z1 واقعی بسنجیم */

  const r = spawnSync(process.execPath, ['server/seed.js'], { cwd: ROOT, timeout: 90000, encoding: 'utf8' });
  chk('Z0 seed بدونِ خطا تمام شد', r.status === 0, (r.stderr || '').slice(0, 200));

  const mode = fs.statSync(STORE).mode & 0o777;
  chk('Z1 store با 0600 نوشته شد', mode === 0o600, '0' + mode.toString(8));

  const db = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  chk('Z1-B store سالم است (users >= 1000)', Array.isArray(db.users) && db.users.length >= 1000, String(db.users && db.users.length));

  const afterRaw = fs.readFileSync(STORE, 'utf8');
  /* مقایسهٔ معنایی: seed، timestampِ لحظهٔ اجرا را در چند رکورد می‌زند
     (رفتارِ قدیمی و شناخته‌شده) — فقط ساختار و مقادیرِ غیر-زمانی باید
     دقیقاً با storeِ committed یکی باشند. */
  const canonical = (raw) => {
    const o = JSON.parse(raw);
    (function strip(x){
      if(Array.isArray(x)) return x.forEach(strip);
      if(x && typeof x === 'object'){
        for(const k of Object.keys(x)){
          if(k === 'created_at' || k === 'updated_at') x[k] = '';
          else strip(x[k]);
        }
      }
    })(o);
    return JSON.stringify(o, Object.keys(o).sort());
  };
  try {
    const same = canonical(beforeRaw) === canonical(afterRaw);
    chk('Z2 store دترمینیک است (ساختار/مقادیر بدونِ دررفتگی؛ فقط timestamp عوض می‌شود)', same);
  } catch(e) {
    chk('Z2 store دترمینیک است', false, e.message);
  }
  fs.chmodSync(STORE, 0o600); /* درخت تمیز بماند */

  console.log('\nsecurity_seed: ' + pass + ' ✅ / ' + fail + ' ❌');
  if (fail) { errors.forEach((e) => console.log('  — ' + e)); process.exit(1); }
}

main();
