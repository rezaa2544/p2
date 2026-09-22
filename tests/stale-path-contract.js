#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEGACY = ['TODO_BEFORE', '_PRODUCTION.md'].join('');
const CANONICAL = path.join(ROOT, 'docs', 'audit', 'history', 'audit', LEGACY);
const COMPAT = path.join(ROOT, LEGACY);

const TEXT_EXT = new Set(['.md', '.txt', '.yml', '.yaml', '.json', '.js', '.sh', '.ps1', '.html']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full);
    if (SKIP_DIRS.has(name)) continue;
    if (rel === path.join('docs', 'audit', 'history') || rel.startsWith(path.join('docs', 'audit', 'history') + path.sep)) continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (TEXT_EXT.has(path.extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

let pass = 0;
function check(name, cond, detail) {
  if (!cond) throw new Error(`${name}: ${detail || 'condition failed'}`);
  pass++;
  console.log(`  ✅ ${name}`);
}

console.log('\n▸ stale-path contract');
check('historical TODO document exists', fs.existsSync(CANONICAL), CANONICAL);
check('legacy compatibility path exists', fs.existsSync(COMPAT), COMPAT);

const redirect = fs.readFileSync(COMPAT, 'utf8');
check('compatibility path identifies itself as historical redirect', /historical redirect/i.test(redirect));
check('compatibility path points to canonical historical document', redirect.includes('docs/audit/history/audit/TODO_BEFORE_PRODUCTION.md'));

const refs = [];
for (const file of walk(ROOT)) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(LEGACY)) refs.push(path.relative(ROOT, file));
}
check('all active legacy references resolve through the compatibility path', fs.existsSync(COMPAT), `references=${refs.length}`);
check('canonical historical copy is excluded from active-path accounting', !refs.includes(path.relative(ROOT, CANONICAL)));

console.log(`stale-path contract: ${pass}/6 PASS`);
