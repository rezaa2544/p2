#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/m15-10-circuit-breaker.test.js — کلیدِ مدار (M15-10)
   ───────────────────────────────────────────────────────────────────
   درون‌حافظه‌ای و قطعی — هیچ زیرساختی لازم ندارد و در هر محیطی اجرا
   می‌شود (بدونِ NOT-RUN: گم‌شدنِ زیرساخت = قرمز، نه سبزِ خاموش).
   اثباتِ منفیِ جهش: tests/m15-10-circuit-breaker-mutations.js
      (این فایل تحتِ جهشِ «مدار هرگز باز نمی‌شود» باید قرمز شود)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { createCircuitBreaker } = require('../server/circuit-breaker.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (extra ? ' :: ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? ' :: ' + String(extra).slice(0, 200) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function main() {
  console.log('\nM15-10 — کلیدِ مدارِ محافظت‌شده\n');

  /* C1: closed → پاس‌جام و نتیجهٔ سالم */
  {
    const br = createCircuitBreaker();
    const r = await br.execute('dep-c1', async () => 'ok-value');
    check('C1 مسیرِ سالم: نتیجهٔ واقعی با degraded:false', r && r.value === 'ok-value' && r.degraded === false, JSON.stringify(r && r.value));
  }

  /* C2: آستانهٔ خطا → open */
  {
    const br = createCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 500, windowMs: 60000 });
    for (let i = 0; i < 3; i++) {
      await br.execute('dep-c2', async () => { throw new Error('boom-' + i); }, { fallback: null });
    }
    const st = br.status()['dep-c2'];
    check('C2 پس از آستانه، مدار باز می‌شود', st && st.state === 'open' && st.failuresInWindow === 3, JSON.stringify(st));
  }

  /* C3: open → ردِ فوری با خطای نوع‌دار CIRCUIT_OPEN */
  {
    const br = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60000, windowMs: 60000 });
    await br.execute('dep-c3', async () => { throw new Error('x'); }, { fallback: null });
    let threw = null;
    let fnRan = false;
    try {
      await br.execute('dep-c3', async () => { fnRan = true; return 'never'; });
    } catch (e) { threw = e; }
    check('C3 مدارِ باز: CIRCUIT_OPEN فوری (fn هرگز اجرا نشد)',
      threw && threw.code === 'CIRCUIT_OPEN' && fnRan === false && threw.retryAfterMs > 0,
      threw ? (threw.code + ' retry=' + threw.retryAfterMs) : 'هیچ خطایی');
  }

  /* C4: degrade با fallback (تابع) در حالتِ open */
  {
    const br = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60000, windowMs: 60000 });
    await br.execute('dep-c4', async () => { throw new Error('x'); }, { fallback: null });
    const r = await br.execute('dep-c4', async () => 'never', { fallback: ({ reason }) => 'fallback:' + reason });
    check('C4 fallback در open: نتیجهٔ جایگزین با degraded:true و reason circuit-open',
      r && r.value === 'fallback:circuit-open' && r.degraded === true, JSON.stringify(r && r.value));
  }

  /* C5: failClosed حتی با fallback پرتاب می‌کند */
  {
    const br = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60000, windowMs: 60000 });
    await br.execute('dep-c5', async () => { throw new Error('x'); }, { fallback: 'fb' });
    let threw = null;
    try {
      await br.execute('dep-c5', async () => 'never', { fallback: 'fb', failClosed: true });
    } catch (e) { threw = e; }
    check('C5 failClosed: خطا بالا می‌رود (fallback نادیده)', threw && threw.code === 'CIRCUIT_OPEN', threw && threw.code);
  }

  /* C6: پس از reset timeout → half-open، پروب مجاز */
  {
    const br = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60, windowMs: 60000, halfOpenProbes: 1 });
    await br.execute('dep-c6', async () => { throw new Error('x'); }, { fallback: null });
    await sleep(90); /* بیشتر از resetMs */
    const st = br.status()['dep-c6'];
    check('C6 پس از مهلت، نیمه‌باز (پروبِ آزمون)', st && st.state === 'half-open', JSON.stringify(st && st.state));
  }

  /* C7: موفقیت در half-open → مدار بسته می‌شود */
  {
    const br = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60, windowMs: 60000, halfOpenProbes: 1 });
    await br.execute('dep-c7', async () => { throw new Error('x'); }, { fallback: null });
    await sleep(90);
    const r = await br.execute('dep-c7', async () => 'recovered');
    const st = br.status()['dep-c7'];
    check('C7 پروبِ موفق، مدار را می‌بندد', r && r.value === 'recovered' && r.degraded === false && st.state === 'closed', JSON.stringify(st && st.state));
  }

  /* C8: شکست در half-open → بی‌درنگ open */
  {
    const br = createCircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 60, windowMs: 60000, halfOpenProbes: 1 });
    await br.execute('dep-c8', async () => { throw new Error('x'); }, { fallback: null });
    await br.execute('dep-c8', async () => { throw new Error('y'); }, { fallback: null }); /* اکنون open */
    await sleep(90);
    await br.execute('dep-c8', async () => { throw new Error('probe'); }, { fallback: null }); /* پروبِ نیمه‌باز شکست */
    const st = br.status()['dep-c8'];
    check('C8 شکستِ پروب → بی‌درنگ بازِ دوباره', st && st.state === 'open' && st.retryAfterMs > 0, JSON.stringify(st));
  }

  /* C9: جداسازیِ per-dependency */
  {
    const br = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60000, windowMs: 60000 });
    await br.execute('dep-a', async () => { throw new Error('x'); }, { fallback: null }); /* a باز */
    const r = await br.execute('dep-b', async () => 'fine');
    const sa = br.status()['dep-a'];
    check('C9 مدارِ بازِ «a»، «b» را نمی‌بندد', r && r.value === 'fine' && sa.state === 'open', JSON.stringify(sa && sa.state));
  }

  /* C10: پنجرهٔ خطا — شکست‌های کهنه منقضی می‌شوند (مدار باز نمی‌شود) */
  {
    const br = createCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60000, windowMs: 120 });
    await br.execute('dep-c10', async () => { throw new Error('old'); }, { fallback: null });
    await sleep(160); /* فراتر از پنجره */
    await br.execute('dep-c10', async () => { throw new Error('fresh'); }, { fallback: null });
    const st = br.status()['dep-c10'];
    check('C10 پنجرهٔ لغزان: شکستِ کهنه شمرده نمی‌شود', st && st.state !== 'open' && st.failuresInWindow === 1, JSON.stringify(st));
  }

  /* C11: خطای سیاست — نامِ نامعتبر / fn غیرتابع */
  {
    const br = createCircuitBreaker();
    let e1 = null, e2 = null;
    try { await br.execute('bad name!', async () => 1); } catch (e) { e1 = e; }
    try { await br.execute('dep-c11', 'not-a-fn'); } catch (e) { e2 = e; }
    check('C11 خطای سیاست: CIRCUIT_BREAKER_POLICY برای نام/fn نامعتبر',
      e1 && e1.code === 'CIRCUIT_BREAKER_POLICY' && e2 && e2.code === 'CIRCUIT_BREAKER_POLICY',
      (e1 && e1.code) + '/' + (e2 && e2.code));
  }

  /* C12: status() = عکسِ سریعِ سلامت برای /api/health */
  {
    const br = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60000, windowMs: 60000 });
    await br.execute('dep-c12', async () => { throw new Error('last-err'); }, { fallback: null });
    const st = br.status()['dep-c12'];
    check('C12 status(): state + failuresInWindow + lastError + transitions',
      st && st.state === 'open' && st.failuresInWindow === 1 && /last-err/.test(st.lastError || '') && st.transitions === 1,
      JSON.stringify(st));
  }

  /* C13: isDegraded() */
  {
    const br = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60000, windowMs: 60000 });
    const before = br.isDegraded('dep-c13');
    await br.execute('dep-c13', async () => { throw new Error('x'); }, { fallback: null });
    const after = br.isDegraded('dep-c13');
    check('C13 isDegraded: false → true پس از باز شدن', before === false && after === true, before + '/' + after);
  }

  /* C14: fallback به‌صورتِ مقدار (نه تابع) در شکستِ fn */
  {
    const br = createCircuitBreaker({ failureThreshold: 10, resetTimeoutMs: 60000, windowMs: 60000 });
    const r = await br.execute('dep-c14', async () => { throw new Error('x'); }, { fallback: 42 });
    check('C14 fallbackِ مقداری در شکست: 42 با degraded:true', r && r.value === 42 && r.degraded === true && r.reason === 'failure', JSON.stringify(r && r.value));
  }

  /* C15: پیش‌فرض‌های env — PAYESH_BREAKER_FAILURE_THRESHOLD */
  {
    process.env.PAYESH_BREAKER_FAILURE_THRESHOLD = '2';
    const br = createCircuitBreaker(); /* env همین الان خوانده می‌شود */
    delete process.env.PAYESH_BREAKER_FAILURE_THRESHOLD;
    await br.execute('dep-c15', async () => { throw new Error('x'); }, { fallback: null });
    await br.execute('dep-c15', async () => { throw new Error('y'); }, { fallback: null });
    const st = br.status()['dep-c15'];
    check('C15 پیش‌فرض از env: آستانهٔ ۲ اعمال شد', st && st.state === 'open', JSON.stringify(st && st.state));
  }

  console.log('────────────────────────────────────────────');
  console.log('m15-10-circuit-breaker: ' + pass + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });
