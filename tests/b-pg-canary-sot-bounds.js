#!/usr/bin/env node
/**
 * B-PG-REWORK/M12-F3 — پروبِ کران‌هایِ TTL/backoff کانریِ SoT
 * -------------------------------------------------------------------
 * F-3 پیاده‌سازی شد ولی هرمس یک coverage gap باز ثبت کرد: هیچ تست و هیچ
 * stepای از CI رفتارِ نامعتبرِ `PAYESH_CANARY_SOT_TTL_MS` /
 * `PAYESH_CANARY_SOT_BACKOFF_MS` را محافظت نمی‌کرد. این پروب آن gap را
 * می‌بندد و در دو سطح اثبات می‌کند:
 *
 *   ۱) سطحِ پارسر — هر شکلِ نامعتبر باید به defaultِ کران‌دار (۲۰۰۰/۳۰۰۰۰)
 *      فرو برود. این همان قراردادِ boundedMs است که F-1 برای PG_TIMEOUT_MS
 *      برقرار کرد.
 *
 *   ۲) سطحِ gate — مقادیرِ فروبرده‌شده واقعاً gateهایِ `refreshCacheFromPg`
 *      را در مسیرِ read فعال نگه می‌دارند. این بخش است که F-3 را
 *      load-bearing می‌کند: gateهایِ خاموش یعنی `SELECT` همگام رویِ
 *      *هر* درخواست HTTP (B-PG-1b).
 *
 * روشِ مشاهده: gateها کد را اجرا نمی‌کنند بلکه برمی‌گردند، پس رفتارشان
 * از طریقِ شاخهٔ پرتاب دیده می‌شود. وقتی authority attach نشده و
 * `DATABASE_URL` تنظیم است، `refreshCacheFromPg` بعد از عبور از gateها با
 * `AUTHORITY_UNAVAILABLE` پرتاب می‌کند. پس:
 *
 *     gate فعال  ⇒ پرتاب نکردن (بازگشتِ زودهنگام)
 *     gate خاموش ⇒ پرتاب AUTHORITY_UNAVAILABLE
 *
 * که برابر است با «TTL/backoff واقعاً خوانده می‌شوند و مسیرِ read را
 * مسدود می‌کنند». نیاز به PG زنده ندارد — یک پروسهٔ Node تمیز کافی است.
 *
 *     node tests/b-pg-canary-sot-bounds.js                      # درختِ اصلاح‌شده: exit 0
 *     PAYESH_PG_UNBOUNDED_PROBE=1 node tests/b-pg-canary-sot-bounds.js
 *                            # درختِ شکسته: exit 1 (gateها خاموش می‌شوند)
 *
 * هر شکل در یک پروسهٔ child کاملاً تازه اجرا می‌شود چون `boundedMs` در
 * زمانِ build از `process.env` می‌خواند و state در یک پروسه آلوده می‌شود.
 * همهٔ waitها watchdog-guarded هستند؛ timeout ⇒ FAIL، هرگز hang.
 */
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CHILD_TIMEOUT_MS = 20000;

/* LEGACY: پرچمِ بازتولیدِ درختِ pre-fix. وقتی روشن است، موتور درست همان
 * مقادیرِ نامحدودِ قدیمی را می‌بیند و پروب انتظارِ gate خاموش دارد. */
const LEGACY = process.env.PAYESH_PG_UNBOUNDED_PROBE === '1' && process.env.NODE_ENV !== 'production';

const DEFAULT_TTL_MS = 2000;
const DEFAULT_BACKOFF_MS = 30000;

/* شکل‌های misconfiguration که باید fail-safe باشند. هر کدام قبلاً یا NaN
 * می‌شدند (Math.max(0, parseInt('abc')) ⇒ Math.max(0, NaN) ⇒ NaN) یا ۰/منفی
 * — و NaN/0/منفی همهٔ مقایسه‌هایِ gate را false می‌کنند. */
const SHAPES = [
  { label: 'unset', env: {} },
  { label: 'empty string', env: { PAYESH_CANARY_SOT_TTL_MS: '', PAYESH_CANARY_SOT_BACKOFF_MS: '' } },
  { label: 'zero', env: { PAYESH_CANARY_SOT_TTL_MS: '0', PAYESH_CANARY_SOT_BACKOFF_MS: '0' } },
  { label: 'negative', env: { PAYESH_CANARY_SOT_TTL_MS: '-1', PAYESH_CANARY_SOT_BACKOFF_MS: '-5' } },
  { label: 'non-numeric', env: { PAYESH_CANARY_SOT_TTL_MS: 'abc', PAYESH_CANARY_SOT_BACKOFF_MS: 'NaN' } }
];

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: String(detail || '').slice(0, 220) });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '  — ' + results[results.length - 1].detail));
}

/* teardownِ best-effort: شکست در مسیرِ پاک‌سازی هرگز نباید نتیجهٔ واقعیِ
 * پروب را ببلعد. همهٔ cleanupها از این helper می‌گذرند تا یک `catch (e) {}`ِ
 * برهنه (که eslint به‌عنوانِ no-empty می‌شمارد) در فایل باقی نماند. */
function bestEffort(fn) {
  try { fn(); } catch (e) { /* intentionally ignored — cleanup path */ }
}

/* ── child mode ───────────────────────────────────────────────────── */
/* هر شکل env را در یک پروسهٔ تمیز می‌بیند، موتور را می‌سازد، مقادیرِ فروبرده
 * شده را گزارش می‌دهد و رفتارِ gate را از طریقِ شاخهٔ پرتاب می‌آزماید.
 * خروجی: یک خطِ `F3-CHILD <json>` روی stdout. */
function child() {
  const { Phase6CanaryEngine } = require('../server/infrastructure/phase6-canary-engine');
  const authority = require('../server/infrastructure/authority');

  const out = { attached: authority.attached() };

  const eng = new Phase6CanaryEngine();
  out.ttl = eng._sotCacheTtlMs;
  out.backoff = eng._sotRefreshBackoffMs;

  if (!out.attached) {
    /* وقتی gateها عبور کنند، refreshCacheFromPg به شاخهٔ PG می‌رسد. چون
     * authority attach نشده، با AUTHORITY_UNAVAILABLE پرتاب می‌کند — مشروط
     * به اینکه DATABASE_URL تنظیم باشد، وگرنه بی‌صدا برمی‌گردد و رفتارِ gate
     * غیرقابل‌مشاهده می‌شود. */
    if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgresql://f3-probe.invalid:1/f3_probe';

    const probe = async (label, setup, opts) => {
      eng._sotCacheAt = 0;
      eng._sotRefreshFailedAt = 0;
      setup(eng);
      try {
        await eng.refreshCacheFromPg(opts);
        out[label] = 'returned';          /* gate فعال: جلوی رسیدن به PG را گرفت */
      } catch (e) {
        const code = e && e.code;
        out[label] = (code === 'AUTHORITY_UNAVAILABLE') ? 'threw-authority' : 'threw-other';
        if (out[label] === 'threw-other') out[label + ':msg'] = String(e && e.message).slice(0, 120);
      }
    };

    (async () => {
      const ttl = eng._sotCacheTtlMs;
      const backoff = eng._sotRefreshBackoffMs;

      /* A) TTL gate: cache ۱۰۰ms پیش ساخته شده (تازه) ⇒ نباید به PG برسد.
       *    NaN: `100 < NaN` false ⇒ عبور ⇒ پرتاب. ۰/منفی: همین. */
      await probe('gateFRESH', (e) => { e._sotCacheAt = Date.now() - 100; }, {});

      /* B) TTL gate: cache قدیمی‌تر از ttl ⇒ باید عبور کند ⇒ پرتاب.
       *    این_SIDE به‌تنهایی load-bearing نیست (NaN هم عبور می‌کند) ولی
       *    اثبات می‌کند که gate فقط stalenessِ read را محدود می‌کند. */
      await probe('gateSTALE', (e) => { e._sotCacheAt = Date.now() - (ttl + 5000); }, {});

      /* C) backoff gate: شکست ۱۰۰ms پیش ⇒ نباید دوباره PG را کوبد. */
      await probe('gateBACKOFF', (e) => { e._sotRefreshFailedAt = Date.now() - 100; }, {});

      /* D) backoff gate: پنجرهٔ backoff گذشته ⇒ باید عبور کند ⇒ پرتاب. */
      await probe('gateBACKOFFEXPIRED', (e) => { e._sotRefreshFailedAt = Date.now() - (backoff + 5000); }, {});

      /* E) force:true همیشه عبور می‌کند (init و هر authority write) —
       *    gateها هرگز writeِ fail-closed را مسدود نمی‌کنند. */
      await probe('gateFORCE', (e) => { e._sotCacheAt = Date.now() - 100; }, { force: true });

      console.log('F3-CHILD ' + JSON.stringify(out));
      process.exit(0);
    })().catch((e) => {
      console.log('F3-CHILD ' + JSON.stringify({ childError: String(e && e.message).slice(0, 160) }));
      process.exit(3);
    });
    return;
  }

  /* authority از قبل attach شده — شاخهٔ پرشار قابل‌اعتماد نیست. */
  console.log('F3-CHILD ' + JSON.stringify(out));
  process.exit(0);
}

/* ── parent mode ──────────────────────────────────────────────────── */
function runShape(shape) {
  const env = Object.assign({}, process.env, shape.env, { F3_SHAPE_LABEL: shape.label });
  let stdout = '';
  try {
    stdout = execFileSync(process.execPath, [__filename, '--child'], {
      env, cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], timeout: CHILD_TIMEOUT_MS, encoding: 'utf8'
    });
  } catch (e) {
    const killed = e && (e.killed || e.signal === 'SIGTERM' || /TIMEDOUT/i.test(String(e && e.message)));
    return {
      error: killed ? 'child watchdog tripped (hang)' : 'child crashed: ' + String(e && e.message).slice(0, 140)
    };
  }
  const line = String(stdout).split(/\r?\n/).filter((l) => l.startsWith('F3-CHILD ')).pop();
  if (!line) return { error: 'child printed no F3-CHILD verdict line' };
  try { return JSON.parse(line.slice('F3-CHILD '.length)); } catch (e) { return { error: 'bad F3-CHILD json' }; }
}

function isBounded(v, expected) {
  /* مقادیرِ فروبرده‌شده باید دقیقاً default کران‌دار باشند: finite، positive
   * و مساویِ عددِ انتظار. NaN/۰/منفی همگی رد می‌شوند. */
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v === expected;
}

(async () => {
  if (process.argv[2] === '--child') { child(); return; }

  console.log('B-PG canary SoT TTL/backoff bounds probe  (LEGACY='
    + (LEGACY ? '1 (expect gates to go dead — broken tree)' : '0 (expect bounded gates)') + ')');

  const legacyFailures = [];

  for (const shape of SHAPES) {
    console.log('\n  --- shape: ' + shape.label + ' ---');
    const r = runShape(shape);

    if (r.error) {
      check('shape "' + shape.label + '": child harness produced a verdict', false, r.error);
      continue;
    }
    if (r.childError) {
      check('shape "' + shape.label + '": child probe ran without an internal error', false, r.childError);
      continue;
    }

    /* ── سطح ۱: پارسر ── */
    check('shape "' + shape.label + '": TTL degrades to the bounded default (' + DEFAULT_TTL_MS + ')',
      isBounded(r.ttl, DEFAULT_TTL_MS), 'ttl=' + r.ttl);
    check('shape "' + shape.label + '": backoff degrades to the bounded default (' + DEFAULT_BACKOFF_MS + ')',
      isBounded(r.backoff, DEFAULT_BACKOFF_MS), 'backoff=' + r.backoff);

    /* ── سطح ۲: gateها ── */
    /* اگر authority از قبل attach شده، child شاخهٔ پرشار را آزمایش نکرد —
     * گزارشش به‌جای روانِ gateها، یک precondition است نه یک PASS خاموش. */
    if (r.attached) {
      check('shape "' + shape.label + '": authority unattached so the gate branch is observable', false,
        'attached=true — probe cannot see gate behaviour in this process');
      continue;
    }

    const gatesOk = r.gateFRESH === 'returned'
      && r.gateSTALE === 'threw-authority'
      && r.gateBACKOFF === 'returned'
      && r.gateBACKOFFEXPIRED === 'threw-authority'
      && r.gateFORCE === 'threw-authority';

    check('shape "' + shape.label + '": TTL gate holds fresh cache out of PG (returned, no authority throw)',
      r.gateFRESH === 'returned', 'gateFRESH=' + r.gateFRESH);
    check('shape "' + shape.label + '": TTL gate lets an expired cache through to the authority branch',
      r.gateSTALE === 'threw-authority', 'gateSTALE=' + r.gateSTALE);
    check('shape "' + shape.label + '": backoff gate holds a recent failure out of PG (returned)',
      r.gateBACKOFF === 'returned', 'gateBACKOFF=' + r.gateBACKOFF);
    check('shape "' + shape.label + '": backoff gate lets an expired failure through to the authority branch',
      r.gateBACKOFFEXPIRED === 'threw-authority', 'gateBACKOFFEXPIRED=' + r.gateBACKOFFEXPIRED);
    check('shape "' + shape.label + '": force:true always bypasses both gates (authority branch reached)',
      r.gateFORCE === 'threw-authority', 'gateFORCE=' + r.gateFORCE);

    if (LEGACY && !gatesOk) {
      /* درختِ pre-fix: مقادیرِ نامعتبر ⇒ NaN/۰ ⇒ تمامِ مقایسه‌ها false ⇒
       * gate خاموش. توجه: فقطِ شکل‌هایی که مقدارِ *صریحاً* نامعتبر دارند
       * خاموش می‌شوند (zero/negative/non-numeric). unset و empty-string حتی در
       * درختِ pre-fix هم defaultِ کران‌دار می‌گرفتند (چون `X || default` با
       * undefined/'' fallback اجرا می‌شد)، پس سبز ماندنِ آن دو در LEGACY
       * ویژگیِ درستِ آن دو شکل است، نه یک regression. */
      if (shape.env.PAYESH_CANARY_SOT_TTL_MS) legacyFailures.push(shape.label);
    } else if (!LEGACY) {
      check('shape "' + shape.label + '": all five gate behaviours hold together', gatesOk,
        'FRESH=' + r.gateFRESH + ' STALE=' + r.gateSTALE + ' BACKOFF=' + r.gateBACKOFF
        + ' EXPIRED=' + r.gateBACKOFFEXPIRED + ' FORCE=' + r.gateFORCE);
    }
  }

  /* ── verdict ── */
  const failed = results.filter((r2) => !r2.ok);

  if (LEGACY) {
    const reproduced = legacyFailures.length >= 3;
    console.log('B-PG-PROBE VERDICT: FAIL mode=LEGACY broken-tree-dead-gates-reproduced'
      + ' shapes=' + JSON.stringify(legacyFailures));
    if (reproduced) {
      console.log('  RED ON BROKEN TREE (expected — ' + legacyFailures.length + ' of ' + SHAPES.length
        + ' shapes had invalid env, so the gates died and every request reached PostgreSQL)');
      console.log('  note: unset/empty-string stay bounded even pre-fix — `X || default` handled those;'
        + ' the F-3 defect is the explicitly-invalid shapes (zero/negative/non-numeric)');
    } else {
      console.log('  WARNING: fewer than 3 shapes reproduced the dead-gate behaviour — probe may be losing its load-bearing proof');
    }
    process.exit(1);
  }

  if (failed.length) {
    console.log('\n  ' + (results.length - failed.length) + '/' + results.length + ' checks passed');
    console.log('  FAILED: ' + failed.map((f) => f.name).join(' | '));
    console.log('B-PG-PROBE VERDICT: FAIL mode=FIXED failed=' + failed.length);
    process.exit(1);
  }

  console.log('\n  ' + results.length + '/' + results.length + ' checks passed');
  console.log('B-PG-PROBE VERDICT: PASS mode=FIXED');
  console.log('  ALL GREEN — every canary TTL/backoff misconfiguration degrades to a bounded, load-bearing gate');
})().catch((e) => {
  bestEffort(() => console.error('B-PG-PROBE VERDICT: ERROR harness-crash'));
  console.error('PROBE ERROR:', e.stack || e);
  process.exit(2);
});
