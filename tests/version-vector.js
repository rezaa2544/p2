#!/usr/bin/env node
'use strict';

const vv = require('../server/version-vector');
let ok = 0, total = 0;
function test(name, fn){
  total++;
  try{ fn(); ok++; console.log('  ✅ ' + name); }
  catch(e){ console.error('  ❌ ' + name + ': ' + e.message); process.exitCode = 1; }
}
function assert(x,msg){ if(!x) throw new Error(msg); }

console.log('\n▸ Version vector core');

test('mergeVectors بیشینهٔ هر node را نگه می‌دارد', () => {
  const m = vv.mergeVectors({a:1,b:4}, {a:3,c:2});
  assert(m.a === 3 && m.b === 4 && m.c === 2, JSON.stringify(m));
});

test('isAncestor برای بردار قدیمی true و برای آینده false است', () => {
  assert(vv.isAncestor({a:1}, {a:2,b:1}) === true, 'old not ancestor');
  assert(vv.isAncestor({a:3}, {a:2,b:1}) === false, 'future ancestor');
});

test('compareVectors چهار حالت را تشخیص می‌دهد', () => {
  assert(vv.compareVectors({a:1}, {a:1}) === 'equal', 'equal');
  assert(vv.compareVectors({a:1}, {a:2}) === 'ancestor', 'ancestor');
  assert(vv.compareVectors({a:2}, {a:1}) === 'descendant', 'descendant');
  assert(vv.compareVectors({a:2}, {b:2}) === 'concurrent', 'concurrent');
});

test('needsConflict فقط equality را بدون تعارض می‌داند', () => {
  assert(vv.needsConflict({server:2}, {server:2}) === false, 'equal conflict');
  assert(vv.needsConflict({server:1}, {server:2}) === true, 'stale no conflict');
  assert(vv.needsConflict({client:1}, {server:2}) === true, 'concurrent no conflict');
});

test('validateVector شکل و اندازه را fail-closed می‌سنجد', () => {
  assert(vv.validateVector({server:1, 'client-1':0}).ok, 'valid');
  assert(!vv.validateVector(null).ok, 'null valid');
  assert(!vv.validateVector({'bad space':1}).ok, 'bad node valid');
  assert(!vv.validateVector({server:1.5}).ok, 'float valid');
  const big = {}; for(let i=0;i<40;i++) big['n'+i]=i;
  assert(!vv.validateVector(big).ok, 'big valid');
});

test('vectorOfRecord از version_vector یا version عددی بردار می‌سازد', () => {
  assert(vv.vectorOfRecord({version_vector:{a:2}}, 'server').a === 2, 'explicit');
  assert(vv.vectorOfRecord({version:7}, 'server').server === 7, 'version fallback');
});

test('bumpVector مؤلفه node فعلی را با version جدید هماهنگ می‌کند', () => {
  const b = vv.bumpVector({server:2, c:1}, 'server', 5);
  assert(b.server === 5 && b.c === 1, JSON.stringify(b));
});

test('resolveConflict در حالت manual تعارض stale را نگه می‌دارد', () => {
  const r = vv.resolveConflict({version_vector:{server:1}}, {version_vector:{server:2}}, {score:19}, 'manual');
  assert(r.conflict && r.winner === 'manual', JSON.stringify(r));
});

process.on('beforeExit', () => {
  if(ok !== total){ console.error(`\nversion-vector: ${ok}/${total} سبز — خطا دارد ❌`); process.exitCode = 1; }
  else console.log(`\nversion-vector: ${ok}/${total} سبز ✅`);
});
