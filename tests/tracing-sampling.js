/* ─────────────────────────────────────────────────────────────
   tracing-sampling.js — نمونه‌برداری + واحدهایِ خالصِ tracing (P-Trace)
   ─────────────────────────────────────────────────────────────
   همیشه اجرا می‌شود (بدونِ Jaeger، بدونِ سرور).
   CFG-*  پیکربندیِ خالص (env → config)
   SMP-*  انتخاب و تصمیمِ sampler (نسبت‌ها + والد-محوری)
   RED-*  پاک‌سازیِ PII (ویژگیِ اسپن + URL)
   ATT-*  شکلِ ویژگی‌هایِ اسپن (primitives)
   ───────────────────────────────────────────────────────────── */
'use strict';
const crypto = require('crypto');
const api = require('@opentelemetry/api');
const tracing = require('../server/tracing.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const rid = () => crypto.randomBytes(16).toString('hex');
function decisions(sampler, n, parent) {
  let s = 0;
  const ctx = parent || api.context.active();
  for (let i = 0; i < n; i++) {
    const r = sampler.shouldSample(ctx, rid(), 't', api.SpanKind.INTERNAL, {});
    if (r && r.decision === api.SamplingDecision.RECORD_AND_SAMPLED) s++;
  }
  return s;
}
function parentCtx(sampled) {
  return api.trace.setSpanContext(api.context.active(), {
    traceId: rid(), spanId: rid().slice(0, 16),
    traceFlags: sampled ? api.TraceFlags.SAMPLED : api.TraceFlags.NONE
  });
}

(async () => {
  console.log('\n▸ P-Trace — نمونه‌برداری و واحدهایِ خالص');

  /* ── CFG: پیکربندی ── */
  const dflt = tracing.readConfig({});
  chk('CFG-a پیش‌فرض: فعال + OTLP محلی + payesh-api', dflt.enabled === true
    && dflt.endpoint === 'http://localhost:4318/v1/traces' && dflt.serviceName === 'payesh-api');
  chk('CFG-b غیرفعال‌سازی با false/0', tracing.readConfig({ TRACING_ENABLED: 'false' }).enabled === false
    && tracing.readConfig({ TRACING_ENABLED: '0' }).enabled === false);
  chk('CFG-c اولویتِ استاندارد OTEL بر سفارشی', tracing.readConfig({
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://std/v1/traces',
    TRACING_OTLP_ENDPOINT: 'http://custom/v1/traces',
    OTEL_SERVICE_NAME: 'std-svc', TRACING_SERVICE_NAME: 'custom-svc'
  }).endpoint === 'http://std/v1/traces'
    && tracing.readConfig({ OTEL_SERVICE_NAME: 'std-svc', TRACING_SERVICE_NAME: 'custom-svc' }).serviceName === 'std-svc');
  chk('CFG-d جایگزینِ سفارشی وقتی استاندارد نیست', tracing.readConfig({
    TRACING_OTLP_ENDPOINT: 'http://custom/v1/traces', TRACING_SERVICE_NAME: 'custom-svc'
  }).endpoint === 'http://custom/v1/traces');
  const hd = tracing.readConfig({ OTEL_RESOURCE_ATTRIBUTES: 'a=1,b=two', OTEL_EXPORTER_OTLP_TRACES_HEADERS: 'k=v' });
  chk('CFG-e پارسِ attributes و headers', hd.resourceAttrs.a === '1' && hd.resourceAttrs.b === 'two' && hd.headers.k === 'v');
  chk('CFG-f نشانیِ پایهٔ سراسری ‎/v1/traces می‌گیرد', tracing.readConfig({
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318'
  }).endpoint === 'http://collector:4318/v1/traces'
    && tracing.readConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318/v1/traces' }).endpoint === 'http://c:4318/v1/traces'
    && tracing.readConfig({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://t/v1/traces', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://g:4318' }).endpoint === 'http://t/v1/traces');

  /* ── SMP: انتخاب ── */
  chk('SMP-sel پیش‌فرضِ توسعه always_on', tracing.selectSampler({}).name === 'always_on');
  chk('SMP-sel پیش‌فرضِ پروداکشن parentbased/۱۰٪', JSON.stringify(tracing.selectSampler({ NODE_ENV: 'production' })) === JSON.stringify({ name: 'parentbased_ratio', arg: 0.1 }));
  /* BUG-5 (باگ‌هانت چت ۵): تشخیص تولیدِ سرور PAYESH_ENV است (گیت TLS) —
     sampler نباید با NODE_ENVِ خالی به always_on برگردد. */
  chk('SMP-sel پروداکشنِ PAYESH_ENV هم parentbased/۱۰٪', JSON.stringify(tracing.selectSampler({ PAYESH_ENV: 'production' })) === JSON.stringify({ name: 'parentbased_ratio', arg: 0.1 }));
  chk('SMP-sel TRACING_SAMPLE_ALL بر همه می‌چربد', tracing.selectSampler({ NODE_ENV: 'production', TRACING_SAMPLE_ALL: '1' }).name === 'always_on');
  chk('SMP-sel هر ۷ نامِ استاندارد OTEL', tracing.selectSampler({ OTEL_TRACES_SAMPLER: 'always_on' }).name === 'always_on'
    && tracing.selectSampler({ OTEL_TRACES_SAMPLER: 'always_off' }).name === 'always_off'
    && tracing.selectSampler({ OTEL_TRACES_SAMPLER: 'traceidratio', OTEL_TRACES_SAMPLER_ARG: '0.5' }).arg === 0.5
    && tracing.selectSampler({ OTEL_TRACES_SAMPLER: 'parentbased_always_on' }).name === 'parentbased_on'
    && tracing.selectSampler({ OTEL_TRACES_SAMPLER: 'parentbased_always_off' }).name === 'parentbased_off'
    && tracing.selectSampler({ OTEL_TRACES_SAMPLER: 'parentbased_traceidratio' }).name === 'parentbased_ratio');
  chk('SMP-sel نامِ ناشناخته → پیش‌فرض (نه کرش)', tracing.selectSampler({ OTEL_TRACES_SAMPLER: 'nope' }) === null);
  chk('SMP-sel آرگِ بد → ۰.۱ و کلمپِ بازه', tracing.selectSampler({ OTEL_TRACES_SAMPLER: 'traceidratio', OTEL_TRACES_SAMPLER_ARG: 'xx' }).arg === 0.1
    && tracing.selectSampler({ OTEL_TRACES_SAMPLER: 'traceidratio', OTEL_TRACES_SAMPLER_ARG: '9' }).arg === 1
    && tracing.selectSampler({ OTEL_TRACES_SAMPLER: 'traceidratio', OTEL_TRACES_SAMPLER_ARG: '-2' }).arg === 0);

  /* ── SMP: تصمیم‌ها ── */
  const sdk = {
    AlwaysOnSampler: require('@opentelemetry/sdk-trace-node').AlwaysOnSampler,
    AlwaysOffSampler: require('@opentelemetry/sdk-trace-node').AlwaysOffSampler,
    ParentBasedSampler: require('@opentelemetry/sdk-trace-node').ParentBasedSampler,
    TraceIdRatioBasedSampler: require('@opentelemetry/sdk-trace-node').TraceIdRatioBasedSampler
  };
  const devS = tracing.createSampler(tracing.selectSampler({}), sdk);
  chk('SMP-dev100 توسعه: ۲۰۰/۲۰۰ نمونه', decisions(devS, 200) === 200);
  const prodS = tracing.createSampler(tracing.selectSampler({ NODE_ENV: 'production' }), sdk);
  const p = decisions(prodS, 2000);
  chk('SMP-prod10 پروداکشن: ۱۰٪ ± ۵٪', p >= 100 && p <= 300, 'n=' + p);
  const offS = tracing.createSampler(tracing.selectSampler({ OTEL_TRACES_SAMPLER: 'always_off' }), sdk);
  chk('SMP-off همیشه‌خاموش: ۰/۵۰', decisions(offS, 50) === 0);
  const halfS = tracing.createSampler(tracing.selectSampler({ OTEL_TRACES_SAMPLER: 'traceidratio', OTEL_TRACES_SAMPLER_ARG: '0.5' }), sdk);
  const h = decisions(halfS, 1000);
  chk('SMP-half نسبتِ ۵۰٪ ± ۱۰٪', h >= 400 && h <= 600, 'n=' + h);
  chk('SMP-parent والدِ نمونه دنبال می‌شود', decisions(prodS, 50, parentCtx(true)) === 50);
  chk('SMP-parent والدِ نانمونه رد می‌شود', decisions(prodS, 50, parentCtx(false)) === 0);

  /* ── RED: پاک‌سازی ── */
  const r = tracing.redactForSpan({
    title: 'اعلامیه', password: 's3cr3t', token: 'tok-1', secret: 's', jwt: 'j', otp: '12345',
    authorization: 'Bearer x', cookie: 'sess=abc', api_key: 'k', national_id: '0012345678',
    phone: '09121234567', nested: { pass: 'q', nid: '9876543210', keep: 'yes' }, arr: [{ mobile: '09987654321' }]
  });
  chk('RED-a کلیدهایِ حساس [REDACTED]', r.password === '[REDACTED]' && r.token === '[REDACTED]'
    && r.secret === '[REDACTED]' && r.jwt === '[REDACTED]' && r.otp === '[REDACTED]');
  chk('RED-b کلیدهایِ اسپنی (auth/cookie/key) [REDACTED]', r.authorization === '[REDACTED]'
    && r.cookie === '[REDACTED]' && r.api_key === '[REDACTED]');
  chk('RED-c کد ملی ماسک شد نه حذف (*** و بدونِ رقمِ خام)', typeof r.national_id === 'string'
    && r.national_id.indexOf('***') >= 0 && r.national_id.indexOf('0012345678') < 0);
  chk('RED-d تلفن ماسک شد', typeof r.phone === 'string' && r.phone.indexOf('***') >= 0 && r.phone.indexOf('09121234567') < 0);
  chk('RED-e تودرتو و آرایه هم پاک شدند', r.nested.pass === '[REDACTED]' && r.nested.nid.indexOf('***') >= 0
    && r.arr[0].mobile.indexOf('***') >= 0);
  chk('RED-f سالم‌ها دست نخوردند', r.title === 'اعلامیه' && r.nested.keep === 'yes');
  const circ = { a: 1 }; circ.self = circ;
  let circOk = false;
  try { const rc = tracing.redactForSpan(circ); circOk = rc.self === '[CIRCULAR]'; } catch (e) {}
  chk('RED-g چرخه کرش نمی‌کند', circOk);

  /* ── RED: URL ── */
  chk('RED-u کوئریِ حساس [REDACTED] و بقیه سالم', tracing.redactUrl('/api/x?password=p&next=/y&nid=0012345678')
    === '/api/x?password=[REDACTED]&next=/y&nid=[REDACTED]');
  chk('RED-u بدونِ کوئری دست نخورده', tracing.redactUrl('/api/health') === '/api/health'
    && tracing.redactUrl(null) === null);
  chk('RED-v کوئریِ خالی (url.query) جدا پاک می‌شود',
    tracing.redactQuery('password=p&next=/y&token=t') === 'password=[REDACTED]&next=/y&token=[REDACTED]'
    && tracing.redactQuery('') === '' && tracing.redactQuery(null) === '');
  const fakeSpan = { attributes: { 'url.query': 'password=SecretPW123&q=09121234567', 'http.route': '/api/x' },
    setAttribute(k, v) { this.attributes[k] = v; } };
  tracing.scrubUrlAttributes(fakeSpan);
  tracing.scrubUrlAttributes(null);
  tracing.scrubUrlAttributes({});
  chk('RED-w اسپنِ زنده: کوئری پاک و تلفن ماسک و مسیر سالم',
    fakeSpan.attributes['url.query'].indexOf('SecretPW123') < 0
    && fakeSpan.attributes['url.query'].indexOf('password=[REDACTED]') >= 0
    && fakeSpan.attributes['url.query'].indexOf('09121234567') < 0
    && fakeSpan.attributes['url.query'].indexOf('***') >= 0
    && fakeSpan.attributes['http.route'] === '/api/x');

  /* ── ATT: شکلِ ویژگی‌ها ── */
  const at = tracing.toSpanAttributes({ s: 'x', n: 3, b: true, o: { a: 1 }, u: undefined, f: function () {} });
  chk('ATT-a primitives می‌گذرند', at.s === 'x' && at.n === 3 && at.b === true);
  chk('ATT-b آبجکت JSON و تهی/تابع حذف', at.o === '{"a":1}' && !('u' in at) && !('f' in at));

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
