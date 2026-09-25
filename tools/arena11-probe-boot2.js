#!/usr/bin/env node
'use strict';
/* hunt9: (1) isolate WHY bootstrap skips grades/classes — is the reason
 * transactional FK rollback? Run seedPgFromBootstrap-like per-table insert
 * and capture the actual error. Confirm order: schools(6/6) succeeded.
 * (2) restart consequence: second boot hydrates from PG (grades gone). */
process.env.NODE_PATH = '/tmp/repo-node_modules';
require('module').Module._initPaths();
const L = require('/home/user/repo/tests/chaos-drill-lib');
const CHILD_NODE_PATH = '/tmp/repo-node_modules';
(async () => {
  const infra = await L.Infra.start();
  const st = infra.store();
  const ps = (q) => infra.psql(q);
  // confirm schools seeded
  console.log('schools:', ps('SELECT COUNT(*) FROM schools'));
  console.log('users:', ps('SELECT COUNT(*) FROM users'));
  console.log('attendance:', ps('SELECT COUNT(*) FROM attendance'));
  console.log('grades:', ps('SELECT COUNT(*) FROM grades'));
  console.log('classes:', ps('SELECT COUNT(*) FROM classes'));
  // insert a single attendance row (school 1) → verify FK ok logically
  const attOk = ps("INSERT INTO attendance (student_id,class_id,school_id,date,status,id) VALUES (16,1,1,'2026-09-25','present',999999)");
  console.log('attendance single insert:', attOk.replace(/\n/g, ' | '));
  const oneAPI = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  // restart: stop and start again — see what store hydrates (grades/classes loss)
  oneAPI.stop();
  const api2 = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });
  const log2 = api2.logs().split('\n').filter((l) => /Hydrated|hydrat|seed/i.test(l));
  console.log('2nd boot log:', JSON.stringify(log2.slice(-3)));
  // read-only endpoints showing missing collections
  const { readFileSync } = require('fs');
  const storeFile = infra.storeFile;
  const st2 = JSON.parse(readFileSync(storeFile, 'utf8'));
  console.log('store after 2nd boot — users:', (st2.users || []).length, 'classes:', (st2.classes || []).length, 'grades:', (st2.grades || []).length, 'attendance:', (st2.attendance || []).length);
  api2.stop(); infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); process.exit(1); });
