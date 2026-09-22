#!/usr/bin/env node
'use strict';
const assert=require('assert');
const fs=require('fs');
const cp=require('child_process');
const p='tools/production-verifier.sh';
const s=fs.readFileSync(p,'utf8');
const pass=(n,f)=>{f();console.log('PASS '+n);};
pass('functional-shell-syntax',()=>cp.execFileSync('bash',['-n',p],{stdio:'pipe'}));
pass('boundary-t5-excludes-authority-migrations',()=>{
  assert.match(s,/case "\$f" in\s+\*".*\/019_"\*\|\*".*\/020_"\*\) continue/s);
  assert.doesNotMatch(s,/grep -v '\.down\.sql\$' \| sort \| grep -v '019_'/);
});
pass('negative-empty-pg-auth-fixture',()=>{
  assert.match(s,/9000001/); assert.match(s,/9000002/);
  assert.match(s,/INSERT INTO users/); assert.match(s,/INSERT INTO schools/);
  assert.match(s,/psql "\$URL" -v ON_ERROR_STOP=1 -q/);
});
pass('concurrency-replay-resilience',()=>{
  assert.match(s,/kill -9 "\$PIDA"/);
  assert.match(s,/replay same nonce/);
  assert.match(s,/phase6_replay_ledger/);
});
pass('independent-regression-verifier-contract',()=>{
  for(const t of ['T1','T2','T3','T4','T5','T6','T7']) assert.ok(s.includes('════ '+t+' '),'missing '+t);
  assert.match(s,/VERDICT: VERIFIED/); assert.match(s,/VERDICT: NOT VERIFIED/);
});
console.log('Phase 7 verifier contract: 5/5 PASS');
