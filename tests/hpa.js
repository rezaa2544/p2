#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   گاردِ ضدِ رانشِ مانیفست‌هایِ HPA (k8s/ + سند)
   H1: هر ۳ فایل HPA با apiVersion درست موجودند
   H2: آستانه‌هایِ API (۳/۲۰، ‏cpu/70‏، ‏mem/80‏)
   H3: متریکِ سفارشیِ صف (۱۰۰۰)
   H4: cooldown پنج‌دقیقه‌ایِ scaleDown (۳۰۰ ثانیه)
   H5: قفلِ statefulها (‏min=max=1‏ + ارجاعِ VPA)
   H6: سند هر ۳ فایل را می‌شناسد
   اجرا:  node tests/hpa.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(ROOT, 'k8s', 'hpa-payesh-api.yaml'), 'utf8');
const rds = fs.readFileSync(path.join(ROOT, 'k8s', 'hpa-payesh-redis.yaml'), 'utf8');
const pg = fs.readFileSync(path.join(ROOT, 'k8s', 'hpa-payesh-postgres.yaml'), 'utf8');
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'AUTO_SCALING_SETUP.md'), 'utf8');

let pass = 0;
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else console.log('  ❌ ' + name + (extra ? ' — ' + extra : ''));
}
function has(t, s){ return t.indexOf(s) > -1; }

console.log('\n🔍 HPA Manifest Tests (k8s/ drift guard)');
chk('H1: هر ۳ مانیفست HPA با apiVersion درست',
  [api, rds, pg].every(t => has(t, 'kind: HorizontalPodAutoscaler') && has(t, 'apiVersion: autoscaling/v2')));
chk('H2: آستانه‌هایِ API (‏min3/max20‏، ‏cpu70‏، ‏mem80‏)',
  has(api, 'minReplicas: 3') && has(api, 'maxReplicas: 20') &&
  has(api, 'name: cpu') && has(api, 'averageUtilization: 70') &&
  has(api, 'name: memory') && has(api, 'averageUtilization: 80'));
chk('H3: متریکِ سفارشیِ صف (‏http_requests_queue_length/1000‏)',
  has(api, 'http_requests_queue_length') && has(api, 'averageValue: 1000'));
chk('H4: cooldown پنج‌دقیقه‌ایِ scaleDown (‏stabilizationWindowSeconds: 300‏)',
  has(api, 'scaleDown:') && has(api, 'stabilizationWindowSeconds: 300'));
chk('H5: قفلِ statefulها (‏min=max=1‏ + ارجاعِ VPA + تارگتِ StatefulSet)',
  [rds, pg].every(t => has(t, 'minReplicas: 1') && has(t, 'maxReplicas: 1') &&
    has(t, 'VPA') && has(t, 'kind: StatefulSet')));
chk('H6: سند هر ۳ فایل را می‌شناسد',
  has(doc, 'hpa-payesh-api.yaml') && has(doc, 'hpa-payesh-redis.yaml') && has(doc, 'hpa-payesh-postgres.yaml'));

const N = 6;
console.log(pass === N ? `\nHPA Tests: ${N}/${N} passed\n` : `\nHPA Tests: ${pass}/${N} FAILED\n`);
process.exit(pass === N ? 0 : 1);
