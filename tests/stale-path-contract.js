#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LEGACY = 'TODO_BEFORE_PRODUCTION.md';
const CANONICAL = path.join(ROOT,'docs','audit','history','audit',LEGACY);
const COMPAT = path.join(ROOT,LEGACY);
function ok(name, cond, detail='') { if (!cond) throw new Error(`${name}: ${detail}`); console.log(`  ✅ ${name}`); }
console.log('\n▸ stale-path contract');
ok('historical TODO exists', fs.existsSync(CANONICAL), CANONICAL);
ok('legacy compatibility path exists', fs.existsSync(COMPAT), COMPAT);
const redirect = fs.readFileSync(COMPAT,'utf8');
ok('compatibility file declares historical redirect', /historical redirect/i.test(redirect));
ok('compatibility file points to canonical historical document', redirect.includes('docs/audit/history/audit/TODO_BEFORE_PRODUCTION.md'));
console.log('stale-path contract: 4/4 PASS');
