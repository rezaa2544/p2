'use strict';
// Negative gate contract: expected rejection is not project clearance.
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'strict-gate-fixture-'));
try {
 fs.mkdirSync(path.join(root,'tools'));fs.mkdirSync(path.join(root,'docs/verification'),{recursive:true});
 fs.mkdirSync(path.join(root,'tools/lib'),{recursive:true});
 fs.copyFileSync(path.join(__dirname,'../tools/strict-verification-gate.js'),path.join(root,'tools/strict-verification-gate.js'));
 /* M15-01 recovery: the gate no longer owns the binding rule — it requires the
    shared module. A fixture that copies only the gate would crash on require and
    "pass" the exit-1 assertion for the wrong reason, so the module is copied too. */
 fs.copyFileSync(path.join(__dirname,'../tools/lib/verification-witness.js'),path.join(root,'tools/lib/verification-witness.js'));
 fs.writeFileSync(path.join(root,'docs/STRICT_VERIFICATION_GATE.md'),'Fixture policy only.');
 fs.writeFileSync(path.join(root,'docs/verification/FALSE_GREEN_ALLOWLIST.json'),JSON.stringify({items:[]}));
 fs.copyFileSync(path.join(__dirname,'../docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json'),path.join(root,'docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json'));
 cp.execFileSync('git',['init','--quiet',root]);
 for (const status of ['UNKNOWN','BLOCKED_UNTIL_REGISTRY_IS_COMPLETE']) {
  fs.writeFileSync(path.join(root,'docs/verification/VERIFICATION_REGISTRY.json'),JSON.stringify({status,items:[],required_reviewers:['arena']}));
  const r=cp.spawnSync(process.execPath,[path.join(root,'tools/strict-verification-gate.js')],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,1);assert(r.stdout.includes('FAIL V-01 registry declares a non-empty items array'));assert(r.stdout.includes('VERDICT NOT VERIFIED'));
  if(status.startsWith('BLOCKED'))assert(r.stdout.includes('FAIL V-05 top-level status in machine & not BLOCKED*'));
 }
 console.log('PASS: 2 empty-registry rejection cases (UNIT; no gate clearance)');
} finally {fs.rmSync(root,{recursive:true,force:true});}