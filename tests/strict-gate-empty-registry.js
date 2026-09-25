'use strict';
// Negative gate contract: expected rejection is not project clearance.
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'strict-gate-fixture-'));
try {
 fs.mkdirSync(path.join(root,'tools'));fs.mkdirSync(path.join(root,'docs/verification'),{recursive:true});
 fs.copyFileSync(path.join(__dirname,'../tools/strict-verification-gate.js'),path.join(root,'tools/strict-verification-gate.js'));
 fs.writeFileSync(path.join(root,'docs/STRICT_VERIFICATION_GATE.md'),'Fixture policy only.');
 fs.writeFileSync(path.join(root,'docs/verification/FALSE_GREEN_ALLOWLIST.json'),JSON.stringify({items:[]}));
 cp.execFileSync('git',['init','--quiet',root]);
 for (const status of ['UNKNOWN','BLOCKED_UNTIL_REGISTRY_IS_COMPLETE']) {
  fs.writeFileSync(path.join(root,'docs/verification/VERIFICATION_REGISTRY.json'),JSON.stringify({status,items:[],required_reviewers:['chatgpt','arena','atria']}));
  const r=cp.spawnSync(process.execPath,[path.join(root,'tools/strict-verification-gate.js')],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,1);assert(r.stdout.includes('FAIL G4b registry has actionable items'));assert(r.stdout.includes('VERDICT NOT VERIFIED'));
  if(status.startsWith('BLOCKED'))assert(r.stdout.includes('FAIL G4c registry is not blocked'));
 }
 console.log('PASS: 2 empty-registry rejection cases (UNIT; no gate clearance)');
} finally {fs.rmSync(root,{recursive:true,force:true});}