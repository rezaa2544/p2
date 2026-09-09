#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   نقطهٔ ورودِ رسمیِ اسکنِ راز (CI + توسعه‌دهنده)
   منطق در tests/secret-scan.js است؛ این فایل فقط واگذار می‌کند و
   کدِ خروج را دست‌نخورده برمی‌گرداند (۰ = تمیز، ۱ = نفوذ).
   اجرا:  npm run scan:secrets
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const r = spawnSync(process.execPath,
  [path.join(__dirname, '..', 'tests', 'secret-scan.js'), ...process.argv.slice(2)],
  { stdio: 'inherit' });
process.exit(typeof r.status === 'number' ? r.status : 1);
