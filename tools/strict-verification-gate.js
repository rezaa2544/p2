#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=path.join(__dirname,'..');
const REG=path.join(ROOT,'docs','verification','VERIFICATION_REGISTRY.json');
const ALLOW=path.join(ROOT,'docs','verification','FALSE_GREEN_ALLOWLIST.json');
const ALERT_RULES=path.join(ROOT,'infra','observability','alert-rules.yml');
let pass=0,fail=0,failures=[];
function chk(n,ok,d){if(ok){pass++;console.log('  OK '+n+(d?' — '+d:''));}else{fail++;failures.push({n:n,d:d});console.log('  FAIL '+n+(d?' — '+d:''));}}
function read(p){return fs.readFileSync(p,'utf8');}
let head='';try{head=cp.execSync('git rev-parse HEAD',{cwd:ROOT}).toString().trim();}catch(e){}
console.log('==== PAYESH STRICT VERIFICATION GATE ====');
chk('G1 current HEAD known',/^[0-9a-f]{40}$/.test(head),head);
chk('G2 mandatory policy exists',fs.existsSync(path.join(ROOT,'docs','STRICT_VERIFICATION_GATE.md')));
chk('G3 registry exists',fs.existsSync(REG));
let reg=null;try{reg=JSON.parse(read(REG));}catch(e){}
chk('G4 registry valid JSON',!!reg);
chk('G5 three independent reviewers declared',!!reg&&JSON.stringify(reg.required_reviewers)===JSON.stringify(['chatgpt','arena','atria']));
let allowed=null;try{allowed=JSON.parse(read(ALLOW));}catch(e){}
chk('G6 explicit false-green allowlist exists',!!allowed&&Array.isArray(allowed.items));
chk('G6a canonical alert rules exists',fs.existsSync(ALERT_RULES),path.relative(ROOT,ALERT_RULES));
function walk(dir,out){out=out||[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','dist'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory())walk(p,out);else if(/\.(js|mjs|cjs|yml|yaml)$/.test(e.name))out.push(p);}return out;}
const amap=new Map();
if(allowed&&Array.isArray(allowed.items))for(const x of allowed.items)amap.set(String(x.pattern),x);
const pats=[['assert(true',/assert\s*\(\s*true\b/gi],['process.exit(0)',/process\.exit\(\s*0\s*\)/g],['|| true',/\|\|\s*true\b/g],['0/0 checks',/0\s*\/\s*0\s*(?:checks?|tests?)/gi]];
for(const pair of pats){const label=pair[0],re=pair[1];let hits=[];for(const f of walk(ROOT)){const s=read(f);re.lastIndex=0;let m;while((m=re.exec(s)))hits.push(path.relative(ROOT,f)+':'+(s.slice(0,m.index).split('\n').length));}const bad=hits.filter(function(h){for(const a of amap.values()){if(a.pattern===label&&(a.expires==='never'||new Date(a.expires)>new Date()))return false;}return true;});chk('G7 '+label+' has no unapproved hits',bad.length===0,bad.slice(0,15).join(', '));}
if(reg&&Array.isArray(reg.items)){
 const ids=new Set();
 for(const item of reg.items){
  const id=String(item.id||'');chk('G8 unique item '+id,!!id&&!ids.has(id));ids.add(id);
  chk('G9 '+id+' binds current HEAD',item.head_sha===head,'item='+item.head_sha+' head='+head);
  for(const r of ['chatgpt','arena','atria']){const v=item[r]||{};chk('G10 '+id+' '+r+' PASS + evidence',v.status==='PASS'&&Array.isArray(v.evidence)&&v.evidence.length>0,v.status||'missing');}
  if(item.status==='CERTIFIED'){chk('G11 '+id+' certified with 3 PASS',['chatgpt','arena','atria'].every(function(r){return item[r]&&item[r].status==='PASS';}));chk('G12 '+id+' has evidence',Array.isArray(item.evidence)&&item.evidence.length>=3);}
  else chk('G13 '+id+' not falsely certified',item.status!=='CERTIFIED',item.status);
 }
}
const certified=reg&&Array.isArray(reg.items)?reg.items.filter(function(x){return x.status==='CERTIFIED';}).length:0;
console.log('RESULT '+pass+' pass / '+fail+' fail');console.log('HEAD '+head);console.log('CERTIFIED '+certified);console.log('VERDICT '+(fail?'NOT VERIFIED':'VERIFIED'));
if(fail){console.log('BLOCKERS');failures.forEach(function(x){console.log(' - '+x.n+(x.d?' — '+x.d:''));});}
process.exit(fail?1:0);
