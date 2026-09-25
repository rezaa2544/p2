#!/usr/bin/env node
// tests/phase-c-backup-pg-noop.js — رگرسیونِ A-05b
// در حالتِ PG-live تایمرِ بکاپِ درون‌پروسه‌ای هرگز فایلی نمی‌نوشت و هیچ
// خطایی نمی‌داد، در حالی که بنرِ بوت قولِ «بکاپِ خودکارِ هر N دقیقه» را
// می‌داد. اکنون تایمر مسلح نمی‌شود و یک‌بار دلیلش اعلام می‌شود.
'use strict';

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { createAdmin } = require('../server/admin');

let pass = 0;
const failures = [];
const checks = [];
function chk(name, fn) {
  checks.push(Promise.resolve().then(async () => {
    try { await fn(); pass += 1; console.log('  ✅ ' + name); }
    catch (e) { failures.push(name); console.log('  ❌ ' + name + ' — ' + e.message); }
  }));
}

function makeAdmin(opts) {
  const pg = !!opts.pg;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-bak-'));
  const logs = [];
  const realWarn = console.warn;
  /* لاگِ هشدار را فقط در حینِ اجرای هر سناریو دزدیده می‌کنیم (نه در زمانِ
     ساخت) تا برافروختگیِ console.warnِ جهانی به جا نماند. */
  const capture = () => { logs.length = 0; console.warn = (m) => { logs.push(String(m)); }; };
  const release = () => { console.warn = realWarn; return logs.slice(); };
  const admin = createAdmin({
    store: { users: [] },
    db: {
      isPostgres: () => pg,
      persistOpsBatch: async () => ({ ok: true })
    },
    audit: () => {}, markDirty: () => {},
    sessionFrom: async () => null,
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    dataDir: dir,
    workers: null
  });
  return { admin, dir, capture, release };
}

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  console.log('▸ A-05b · حالتِ PG-live: تایمر مسلح نمی‌شود');
  {
    const ctx = makeAdmin({ pg: true });
    ctx.capture();
    const t = ctx.admin.startAutoBackup(60 * 1000);
    const logs = ctx.release();
    chk('startAutoBackup در PG-live برمی‌گرداند null (تایمر مسلح نمی‌شود)',
      () => assert.strictEqual(t, null, 'expected null handle, got ' + t));
    chk('دلیلِ خاموشیِ تایمر لاگ می‌شود',
      () => assert.ok(logs.some((l) => /NO-OP|pg_dump/i.test(l)), 'no warning logged: ' + JSON.stringify(logs)));
    const r = await ctx.admin.backupNow('auto', null);
    chk('backupNow("auto") در PG-live برمی‌گرداند null',
      () => assert.strictEqual(r, null, JSON.stringify(r)));
  }

  console.log('▸ A-05b · حالتِ JSON: تایمر مسلح می‌شود');
  {
    const { admin } = makeAdmin({ pg: false });
    const t = admin.startAutoBackup(60 * 1000);
    chk('startAutoBackup در حالتِ JSON یک تایمر برمی‌گرداند',
      () => assert.ok(t && typeof t.unref === 'function', 'no timer handle'));
    chk('تایمر unref شده (فرآیندِ تست را زنده نگه نمی‌دارد)',
      () => assert.doesNotThrow(() => t.unref()));
    clearInterval(t);
    const r = await admin.backupNow('auto', null);
    chk('backupNow("auto") در حالتِ JSON یک فایل می‌نویسد',
      () => assert.ok(r && r.name, 'no backup produced: ' + JSON.stringify(r)));
  }

  console.log('▸ A-05b · ms <= 0 همچنان null (قراردادِ موجود)');
  {
    const { admin } = makeAdmin({ pg: false });
    chk('startAutoBackup(0) برمی‌گرداند null',
      () => assert.strictEqual(admin.startAutoBackup(0), null));
    chk('startAutoBackup(-1) برمی‌گرداند null',
      () => assert.strictEqual(admin.startAutoBackup(-1), null));
  }

  await Promise.all(checks);
  console.log('\n──────────────────────────────────────────');
  if (failures.length) {
    console.log('phase-c-backup-pg-noop: ' + pass + ' موفق، ' + failures.length + ' ناموفق');
    console.log('ناموفق‌ها: ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('phase-c-backup-pg-noop: ' + pass + '/' + pass + ' موفق ✅');
}
