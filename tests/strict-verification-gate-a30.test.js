#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const GATE=path.join(__dirname,'..','tools','strict-verification-gate.js');
let checks=0,fail=0;
function chk(name,ok){checks++;if(!ok){fail++;console.error('FAIL '+name);}else console.log('OK '+name);}
function run(dir,expected){return cp.spawnSync(process.execPath,[path.join(dir,'tools','strict-verification-gate.js')],{cwd:dir,env:{...process.env,STRICT_GATE_EXPECTED_HEAD_SHA:expected},encoding:'utf8'});}
function base(){const d=fs.mkdtempSync(path.join(os.tmpdir(),'payesh-a30-'));fs.mkdirSync(path.join(d,'tools'));fs.mkdirSync(path.join(d,'docs/verification'),{recursive:true});fs.mkdirSync(path.join(d,'docs'),{recursive:true});fs.mkdirSync(path.join(d,'infra/observability'),{recursive:true});fs.copyFileSync(GATE,path.join(d,'tools/strict-verification-gate.js'));fs.writeFileSync(path.join(d,'docs/STRICT_VERIFICATION_GATE.md'),'policy');fs.writeFileSync(path.join(d,'infra/observability/alert-rules.yml'),'groups: []');fs.writeFileSync(path.join(d,'docs/verification/FALSE_GREEN_ALLOWLIST.json'),JSON.stringify({schema_version:2,items:[]}));cp.execFileSync('git',['init','-q'],{cwd:d});cp.execFileSync('git',['config','user.email','test@example.com'],{cwd:d});cp.execFileSync('git',['config','user.name','test'],{cwd:d});cp.execFileSync('git',['add','.'],{cwd:d});cp.execFileSync('git',['commit','-qm','fixture'],{cwd:d});return d;}
function validReg(head){return {schema_version:2,policy:'docs/STRICT_VERIFICATION_GATE.md',status:'INDEPENDENTLY_VERIFIED',head_bound:head,required_reviewers:['chatgpt','arena','atria'],allowed_statuses:['UNKNOWN','TESTED','RUNTIME_VERIFIED','ADVERSARIAL_VERIFIED','INDEPENDENTLY_VERIFIED','CERTIFIED'],items:[{id:'A30-T',status:'INDEPENDENTLY_VERIFIED',head_sha:head,evidence:[{requirement:'gate contract',head_sha:head,command:'node tools/strict-verification-gate.js',exit_code:0,artifact:'fixture.log',artifact_sha256:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',runtime:true,scope:'gate fixture',provenance:'runtime fixture',timestamp:'2026-09-25T00:00:00Z',timestamp:'2026-09-25T00:00:00Z'}],reviewers:{chatgpt:{status:'PASS',head_sha:head,independent:true,run_id:'cg-1'},arena:{status:'PASS',head_sha:head,independent:true,run_id:'ar-1'},atria:{status:'PASS',head_sha:head,independent:true,run_id:'at-1'}}}]};}
const d=base(),head=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:d,encoding:'utf8'}).trim();
let reg=validReg(head);
function write(){fs.writeFileSync(path.join(d,'docs/verification/VERIFICATION_REGISTRY.json'),JSON.stringify(reg,null,2));}
write();chk('positive valid contract passes',run(d,head).status===0);
const cases={
'V01-empty-registry':()=>{reg.items=[];},
'V02-weak-evidence':()=>{reg.items[0].evidence=['ok'];},
'V03-reviewer-not-independent':()=>{reg.items[0].reviewers.arena.independent=false;},
'V04-invalid-status':()=>{reg.items[0].status='PASS';},
'V05-blocked-until':()=>{reg.status='BLOCKED_UNTIL_THREE_AI_AGREEMENT';},
'V06-head-mismatch':()=>{reg.head_bound='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';},
'V08-self-attested-cert':()=>{reg.items[0].status='CERTIFIED';reg.items[0].certification={source:'gate-derived',evidence_count:1,required_fields_complete:true,human_approval:{approved:true,reviewer_id:'h',timestamp:'2026-01-01'},quality_gates:[{self_attested:true,source:'self_attested',evidence_ref:'x'}],ranking_count:1};},
'V09-cert-input-injection':()=>{reg.items[0].status='CERTIFIED';reg.items[0].certification={source:'user',evidence_count:999,required_fields_complete:true,human_approval:{approved:true,reviewer_id:'h',timestamp:'2026-01-01'},quality_gates:[{evidence_ref:'x'}],ranking_count:1};},
'V10-missing-human-fields':()=>{reg.items[0].status='CERTIFIED';reg.items[0].certification={source:'gate-derived',evidence_count:1,required_fields_complete:true,quality_gates:[{evidence_ref:'x'}],ranking_count:1};},
'V11-zero-ranking':()=>{reg.items[0].status='CERTIFIED';reg.items[0].certification={source:'gate-derived',evidence_count:1,required_fields_complete:true,human_approval:{approved:true,reviewer_id:'h',timestamp:'2026-01-01'},quality_gates:[{evidence_ref:'x'}],ranking_count:0};},
'V12-provenance-missing':()=>{reg.items[0].evidence[0].provenance='';}
};
for(const [name,mut] of Object.entries(cases)){reg=validReg(head);mut();write();chk(name+' fails closed',run(d,head).status!==0);}
reg=validReg(head);write();fs.writeFileSync(path.join(d,'scanner-target.js'),'assert(true)');
chk('V07 scanner catches injected false-green pattern',run(d,head).status!==0);
chk('V06 external intended-head mismatch fails closed',run(d,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb').status!==0);
console.log('CHECKS '+checks+' FAIL '+fail);
process.exit(fail?1:0);
