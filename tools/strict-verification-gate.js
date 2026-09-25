#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=path.join(__dirname,'..');
const REG=path.join(ROOT,'docs','verification','VERIFICATION_REGISTRY.json');
const ALLOW=path.join(ROOT,'docs','verification','FALSE_GREEN_ALLOWLIST.json');
const ALERT_RULES=path.join(ROOT,'infra','observability','alert-rules.yml');
const REQUIRED_REVIEWERS=['chatgpt','arena','atria'];
const ALLOWED_STATUSES=['UNKNOWN','TESTED','RUNTIME_VERIFIED','ADVERSARIAL_VERIFIED','INDEPENDENTLY_VERIFIED','CERTIFIED'];
let pass=0,fail=0,failures=[];
function chk(n,ok,d){if(ok){pass++;console.log('  OK '+n+(d?' — '+d:''));}else{fail++;failures.push({n,d});console.log('  FAIL '+n+(d?' — '+d:''));}}
function read(p){return fs.readFileSync(p,'utf8');}
function sha(v){return typeof v==='string'&&/^[0-9a-f]{40}$/.test(v);}
function expectedHead(){return process.env.STRICT_GATE_EXPECTED_HEAD_SHA||process.env.GATE_EXPECTED_MAIN_HEAD_SHA||'';}
let head='';try{head=cp.execSync('git rev-parse HEAD',{cwd:ROOT,stdio:['ignore','pipe','ignore']}).toString().trim();}catch(e){}
console.log('==== PAYESH STRICT VERIFICATION GATE ====');
chk('G1 current HEAD known',sha(head),head);
const intended=expectedHead();
chk('G1b intended main HEAD supplied',sha(intended),intended||'missing');
chk('G1c local HEAD equals intended main HEAD',sha(head)&&sha(intended)&&head===intended,`local=${head} intended=${intended}`);
chk('G2 mandatory policy exists',fs.existsSync(path.join(ROOT,'docs','STRICT_VERIFICATION_GATE.md')));
chk('G3 registry exists',fs.existsSync(REG));
let reg=null;try{reg=JSON.parse(read(REG));}catch(e){}
chk('G4 registry valid JSON',!!reg);
let allowed=null;try{allowed=JSON.parse(read(ALLOW));}catch(e){}
chk('G5 allowlist valid JSON',!!allowed&&Array.isArray(allowed.items));
const amap=new Map();
if(allowed&&Array.isArray(allowed.items))for(const x of allowed.items){if(x&&typeof x.pattern==='string')amap.set(x.pattern,x);}
const now=Date.now();
function allowedHit(label){const a=amap.get(label);return !!a && (a.expires==='never'||(typeof a.expires==='string'&&!Number.isNaN(Date.parse(a.expires))&&Date.parse(a.expires)>now)&&typeof a.owner==='string'&&a.owner.trim()&&typeof a.reason==='string'&&a.reason.trim()&&typeof a.replacement_test==='string'&&a.replacement_test.trim());}
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','dist'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory())walk(p,out);else if(/\.(js|mjs|cjs|yml|yaml|json)$/.test(e.name))out.push(p);}return out;}
const pats=[[['assert','true'].join('('),/assert\s*\(\s*true\b/gi],[['process','exit','0'].join('.'),/process\.exit\(\s*0\s*\)/g],[['|','|','true'].join(' '),/\|\|\s*true\b/g],[['0','0','checks'].join('/'),/0\s*\/\s*0\s*(?:checks?|tests?)/gi]];
for(const [label,re] of pats){let hits=[];for(const f of walk(ROOT)){let s=read(f);re.lastIndex=0;let m;while((m=re.exec(s)))hits.push(path.relative(ROOT,f)+':'+(s.slice(0,m.index).split('\\n').length));}const bad=hits.filter(()=>!allowedHit(label));chk('G6 '+label+' has no unapproved hits',bad.length===0,bad.slice(0,15).join(', '));}
chk('G7 canonical alert rules exists',fs.existsSync(ALERT_RULES),path.relative(ROOT,ALERT_RULES));
const items=reg&&Array.isArray(reg.items)?reg.items:null;
chk('G8 registry items is non-empty',Array.isArray(items)&&items.length>0,items?String(items.length):'missing');
if(reg){
 chk('G9 allowed_statuses exactly enforced',Array.isArray(reg.allowed_statuses)&&JSON.stringify(reg.allowed_statuses)===JSON.stringify(ALLOWED_STATUSES));
 chk('G10 required reviewers exactly declared',Array.isArray(reg.required_reviewers)&&JSON.stringify(reg.required_reviewers)===JSON.stringify(REQUIRED_REVIEWERS));
 chk('G11 registry head_bound is exact SHA',sha(reg.head_bound));
 chk('G12 registry head_bound equals intended HEAD',reg.head_bound===intended,`registry=${reg.head_bound} intended=${intended}`);
 chk('G13 registry status is allowed',ALLOWED_STATUSES.includes(reg.status),String(reg.status));
 const blocked=/^BLOCKED_UNTIL_(.+)$/.exec(String(reg.status||''));
 if(blocked){chk('G14 blocked-until condition is explicit and fail-closed',false,'registry is blocked: '+reg.status);}
}
const ids=new Set();
let certified=0;
if(items){
 for(const item of items){
  const id=String(item&&item.id||'');
  chk('item '+id+' has unique id',!!id&&!ids.has(id)); ids.add(id);
  chk('item '+id+' status is allowed',!!item&&ALLOWED_STATUSES.includes(item.status),String(item&&item.status));
  chk('item '+id+' binds exact HEAD',!!item&&item.head_sha===intended,`item=${item&&item.head_sha} intended=${intended}`);
  const ev=item&&item.evidence;
  chk('item '+id+' evidence schema',Array.isArray(ev)&&ev.length>0&&ev.every(e=>e&&typeof e==='object'&&sha(e.head_sha)&&typeof e.requirement==='string'&&e.requirement.trim()&&typeof e.command==='string'&&e.command.trim()&&Number.isInteger(e.exit_code)&&typeof e.artifact==='string'&&e.artifact.trim()&&typeof e.runtime==='boolean'&&typeof e.scope==='string'&&e.scope.trim()&&typeof e.provenance==='string'&&e.provenance.trim()));
  const rev=item&&item.reviewers;
  chk('item '+id+' has three independent reviewers',rev&&REQUIRED_REVIEWERS.every(r=>rev[r]&&rev[r].status==='PASS'&&sha(rev[r].head_sha)&&rev[r].head_sha===intended&&rev[r].independent===true&&typeof rev[r].run_id==='string'&&rev[r].run_id.trim()));
  if(item&&item.status==='CERTIFIED'){certified++;chk('item '+id+' certification input is non-injectable',item.certification&&item.certification.source==='gate-derived'&&item.certification.evidence_count===ev.length&&item.certification.required_fields_complete===true&&item.certification.human_approval&&item.certification.human_approval.approved===true&&typeof item.certification.human_approval.reviewer_id==='string'&&item.certification.human_approval.reviewer_id.trim()&&typeof item.certification.human_approval.timestamp==='string'&&item.certification.human_approval.timestamp.trim()&&Array.isArray(item.certification.quality_gates)&&item.certification.quality_gates.length>0&&item.certification.quality_gates.every(q=>q&&q.self_attested!==true&&q.source!=='self_attested'&&typeof q.evidence_ref==='string'&&q.evidence_ref.trim())&&Number.isInteger(item.certification.ranking_count)&&item.certification.ranking_count>0);}
 }
}
chk('G15 zero-ranking cannot be compliant',certified===0 || (items||[]).filter(x=>x.status==='CERTIFIED').every(x=>x.certification&&Number.isInteger(x.certification.ranking_count)&&x.certification.ranking_count>0));
console.log('RESULT '+pass+' pass / '+fail+' fail');console.log('HEAD '+head);console.log('INTENDED_MAIN_HEAD '+intended);console.log('CERTIFIED '+certified);console.log('VERDICT '+(fail?'NOT VERIFIED':'VERIFIED'));
if(fail){console.log('BLOCKERS');failures.forEach(x=>console.log(' - '+x.n+(x.d?' — '+x.d:'')));}
process.exit(fail?1:0);
