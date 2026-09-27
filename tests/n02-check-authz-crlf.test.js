#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/n02-check-authz-crlf.test.js — N-02 / N-13 regression guard
   -------------------------------------------------------------------
   tools/check-authz.js compared source lines with exact `=== '};'` and
   `=== '  };'`. On a Windows checkout every src/js file carries CRLF, so
   those comparisons never matched, ZERO action containers were found, and
   the gate printed "اکشن 0 ... ✅ تطبیق کامل" — a fully green no-op that
   validated nothing.

   The fix normalizes CRLF → LF in the tool's readLines. These five
   scenarios drive the tool against synthetic CRLF/LF fixtures (written to
   a temp dir at runtime) and prove parsing now works.

   N02-1  CRLF `19-actions-*` partial container is found + writes detected
   N02-2  CRLF `*_ACTIONS` object container is found (the line-83 compare)
   N02-3  CRLF `var ACTION_ROLES` block is parsed (the line-143 compare)
   N02-4  check() now genuinely evaluates WRITE_PERMS and reports real
          violations instead of passing vacuously
   N02-5  mixed EOLs: an LF-only file parses identically alongside CRLF ones
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n02-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

/* Fixture sources. The CRLF ones are what a Windows checkout actually looks
   like; `crlf()` converts at write time so the bytes on disk are real CRLF. */
const crlf = (s) => s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

const PARTIAL = 'function crlfActions(){\n' +
  '  return {\n' +
  "   'add-student'(){ insert('students', form); },\n" +
  "   'add-class'(){ insert('classes', form); }\n" +
  '  };\n' +
  '}\n';

const OBJECT = "const OBJ_ACTIONS = {\n" +
  "  'obj-one'(){ insert('bell_schedules', {}); },\n" +
  "};\n";

const LF_PARTIAL = 'function lfActions(){\n' +
  '  return {\n' +
  "   'lf-only-action'(){ insert('subjects', form); }\n" +
  '  };\n' +
  '}\n';

const ROLES = "var ACTION_ROLES = {\n" +
  " 'add-student': ['manager','student'],\n" +
  " 'add-class': ['student'],\n" +
  " 'lf-only-action': ['manager'],\n" +
  " 'obj-one': ['manager']\n" +
  "};\n";

const SYNC = "module.exports = { WRITE_PERMS: { manager: ['students','classes','subjects','bell_schedules'], student: [] } };\n";

fs.writeFileSync(path.join(TMP, '19-actions-crlf.js'), crlf(PARTIAL));
fs.writeFileSync(path.join(TMP, 'obj-actions-crlf.js'), crlf(OBJECT));
fs.writeFileSync(path.join(TMP, '19-actions-lf.js'), LF_PARTIAL);   /* intentionally LF-only */
fs.writeFileSync(path.join(TMP, '30-authz.js'), crlf(ROLES));
fs.writeFileSync(path.join(TMP, 'sync.js'), SYNC);

/* The tool resolves SRC / SYNC_PATH from env at module load, so set both
   before requiring it. Static literal path keeps the require safe. */
process.env.PAYESH_AUTHZ_SRC = TMP;
process.env.PAYESH_SYNC_PATH = path.join(TMP, 'sync.js');

const { extract, check, parseActionRoles } = require('../tools/check-authz.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

console.log('\n🔍 N-02/N-13 regression: CRLF-safe authorization gate');

/* Sanity: the fixtures really are CRLF on disk (otherwise the test would
   prove nothing about the CRLF path). */
test('fixture sanity: CRLF files really carry CRLF bytes', () => {
  const b = fs.readFileSync(path.join(TMP, '19-actions-crlf.js'), 'utf8');
  assert.ok(b.indexOf('\r\n') > -1, 'fixture was not written as CRLF');
  const lf = fs.readFileSync(path.join(TMP, '19-actions-lf.js'), 'utf8');
  assert.strictEqual(lf.indexOf('\r'), -1, 'LF fixture was contaminated with CR');
});

test('N02-1: CRLF 19-actions-* partial container is parsed with its writes', () => {
  const ex = extract();
  assert.ok(ex.actions['add-student'], 'add-student action missing (CRLF container not found)');
  assert.deepStrictEqual(ex.actions['add-student'].colls, ['students']);
  assert.ok(ex.actions['add-class'], 'add-class action missing');
  assert.deepStrictEqual(ex.actions['add-class'].colls, ['classes']);
});

test('N02-2: CRLF *_ACTIONS object container is parsed', () => {
  const ex = extract();
  assert.ok(ex.actions['obj-one'], 'obj-one action missing (object container not found)');
  assert.deepStrictEqual(ex.actions['obj-one'].colls, ['bell_schedules']);
});

test('N02-3: CRLF var ACTION_ROLES block is parsed', () => {
  const roles = parseActionRoles();
  assert.deepStrictEqual(roles['add-student'], ['manager', 'student']);
  assert.deepStrictEqual(roles['add-class'], ['student']);
  assert.deepStrictEqual(roles['obj-one'], ['manager']);
});

test('N02-4: check() evaluates WRITE_PERMS and reports real violations', () => {
  const ex = extract();
  ex.actionRoles = parseActionRoles();
  const { violations } = check(ex);
  /* manager has every collection → no violations; student has none → both
     student actions must be reported. Before the fix, actions was empty and
     violations was always [] while the tool printed a green "full match". */
  assert.strictEqual(violations.length, 2, 'expected 2 violations, got ' + JSON.stringify(violations));
  assert.ok(violations.every((v) => v.role === 'student'), 'all violations must be for the student role');
  const colls = violations.map((v) => v.coll).sort();
  assert.deepStrictEqual(colls, ['classes', 'students']);
});

test('N02-5: mixed EOLs — LF-only file parses alongside CRLF files', () => {
  const ex = extract();
  assert.ok(ex.actions['lf-only-action'], 'LF-only action missing');
  assert.deepStrictEqual(ex.actions['lf-only-action'].colls, ['subjects']);
  /* all four containers from all four files must be visible in one run */
  const names = Object.keys(ex.actions).sort();
  assert.deepStrictEqual(names, ['add-class', 'add-student', 'lf-only-action', 'obj-one']);
});

console.log('\nN-02/N-13 regression tests: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail === 0 ? 0 : 1);
