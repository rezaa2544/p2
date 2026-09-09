#!/usr/bin/env node
/**
 * E.8 — تست سرور کلاس‌های تابستانی
 *  - مدیر: CRUD کلاس و ثبت‌نام در مدرسه خودش
 *  - دبیر: فقط ثبت attendance روی summer_enrollments کلاس خودش
 *  - نقش/دامنه fail-closed
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { opX } = require('./helpers/opx');
const ROOT = path.join(__dirname, '..');
const PORT = 8994;
const BASE = `http://127.0.0.1:${PORT}`;
function http(method, url, body, cookie) {
  return fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined })
    .then(async r => ({ status: r.status, json: await r.json().catch(() => ({})), hdr: r.headers.get('set-cookie') || '' }));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const T = (c, m) => { if(c){ pass++; console.log('  ✅ '+m); } else { fail++; console.log('  ❌ '+m); } };
async function main(){
console.log('\n▸ E.8 — سرور summer_classes/summer_enrollments');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-summer-'));
const store = path.join(dir, 'store.json');
const seed = path.join(ROOT, 'server/data/payesh.json');
if(!fs.existsSync(seed)){ console.error('⚠️ server/data/payesh.json نیست — اول: node server/seed.js'); process.exit(1); }
fs.copyFileSync(seed, store);
const child = spawn('node', [path.join(ROOT, 'server/index.js')], {
  env:{...process.env, PORT:String(PORT), HOST:'127.0.0.1', PAYESH_STORE:store, PAYESH_AUDIT:path.join(dir,'audit.jsonl'), PAYESH_JWT_SECRET:crypto.randomBytes(32).toString('hex'), PAYESH_DEMO_CODE:'1'},
  stdio:['ignore','pipe','pipe']
});
let out=''; child.stdout.on('data', d=>{out+=String(d);}); child.stderr.on('data', d=>{out+=String(d);});
try{
  await new Promise((res,rej)=>{let done=false; const iv=setInterval(async()=>{try{const r=await http('GET','/api/health'); if(r.status===200){done=true; clearInterval(iv); res();}}catch{}},250); setTimeout(()=>{if(!done)rej(new Error('سرور بالا نیامد: '+out.slice(-400)));},12000);});
  console.log('  (سرور روی '+PORT+' بالا آمد)');
  let st = JSON.parse(fs.readFileSync(store,'utf8'));
  const mgr1 = st.users.find(u=>u.role==='manager'&&u.school_id===1&&u.active);
  const mgr2 = st.users.find(u=>u.role==='manager'&&u.school_id===2&&u.active);
  const tea1 = st.users.find(u=>u.role==='teacher'&&u.school_id===1&&u.active);
  const tea2 = st.users.find(u=>u.role==='teacher'&&u.school_id===1&&u.active&&u.id!==tea1.id);
  const stu1 = st.users.find(u=>u.role==='student'&&u.school_id===1&&u.active);
  const login = async u => { const sc=await http('POST','/api/auth/send-code',{phone:u.phone}); const code=sc.json.demo_code||sc.json.code||'000000'; const lg=await http('POST','/api/auth/login',{phone:u.phone,code,national_id:u.national_id}); return lg.hdr.split(';')[0]; };
  const mgr1C=await login(mgr1), mgr2C=await login(mgr2), tea1C=await login(tea1), tea2C=await login(tea2);
  const clsData = {school_id:1,title:'تست E8 تابستان',name:'تست E8 تابستان',subject:'ریاضی',teacher_id:tea1.id,start_date:'2026-06-15',end_date:'2026-07-15',schedule:{saturday:'08:00-10:00'},capacity:12,status:'planned',created_at:'2026-06-01',updated_at:'2026-06-01'};
  const ins = await http('POST','/api/sync',{ops:[opX({by:mgr1.id,collection:'summer_classes',type:'ins',data:clsData})]},mgr1C);
  const r1=ins.json.results&&ins.json.results[0];
  T(ins.status===200 && r1 && r1.ok===true, 'B1 مدیر کلاس تابستانی می‌سازد');
  await sleep(2300); st=JSON.parse(fs.readFileSync(store,'utf8'));
  const cls = st.summer_classes.find(x=>x.title==='تست E8 تابستان');
  T(!!cls && cls.schedule && cls.schedule.saturday, 'B2 کلاس و schedule در store ماندگار است');
  const evil = await http('POST','/api/sync',{ops:[opX({by:mgr2.id,collection:'summer_classes',type:'ins',data:{...clsData,title:'نشت E8',name:'نشت E8'}})]},mgr2C);
  T(evil.status===403 && evil.json.code==='out_of_scope', 'B3 مدیر مدرسه دیگر نمی‌تواند کلاس مدرسه ۱ بسازد');
  const enrData={school_id:1,summer_class_id:cls.id,student_id:stu1.id,enrolled_at:'2026-06-10',status:'enrolled',attendance:{},created_at:'2026-06-10',updated_at:'2026-06-10'};
  const enr = await http('POST','/api/sync',{ops:[opX({by:mgr1.id,collection:'summer_enrollments',type:'ins',data:enrData})]},mgr1C);
  T(enr.status===200 && enr.json.results[0].ok===true, 'B4 مدیر دانش‌آموز را ثبت‌نام می‌کند');
  await sleep(2300); st=JSON.parse(fs.readFileSync(store,'utf8'));
  const er = st.summer_enrollments.find(x=>x.summer_class_id===cls.id&&x.student_id===stu1.id);
  T(!!er, 'B5 ثبت‌نام در store ماندگار است');
  const att = await http('POST','/api/sync',{ops:[opX({by:tea1.id,collection:'summer_enrollments',type:'upd',id:er.id,data:{attendance:{'2026-06-20':'present'},updated_at:'2026-06-20'}})]},tea1C);
  T(att.status===200 && att.json.results[0].ok===true, 'B6 دبیر همان کلاس حضور را ثبت می‌کند');
  const badField = await http('POST','/api/sync',{ops:[opX({by:tea1.id,collection:'summer_enrollments',type:'upd',id:er.id,data:{status:'withdrawn',updated_at:'2026-06-20'}})]},tea1C);
  const bf = badField.json.results&&badField.json.results[0];
  T(badField.status===200 && bf && bf.ok===false && bf.code==='field_denied', 'B7 دبیر نمی‌تواند ثبت‌نام/انصراف را دستکاری کند');
  const otherTeacher = await http('POST','/api/sync',{ops:[opX({by:tea2.id,collection:'summer_enrollments',type:'upd',id:er.id,data:{attendance:{'2026-06-21':'absent'},updated_at:'2026-06-21'}})]},tea2C);
  const ot = otherTeacher.json.results&&otherTeacher.json.results[0];
  T((otherTeacher.status===403 && otherTeacher.json.code==='out_of_scope') || (otherTeacher.status===200 && ot && ot.ok===false && ot.code==='out_of_scope'), 'B8 دبیر دیگر کلاس out_of_scope است');
  await sleep(2300); st=JSON.parse(fs.readFileSync(store,'utf8'));
  const er2 = st.summer_enrollments.find(x=>x.id===er.id);
  T(er2.attendance && er2.attendance['2026-06-20']==='present' && !er2.attendance['2026-06-21'] && er2.status==='enrolled', 'B9 فقط حضور مجاز روی store اعمال شد');
} finally { child.kill('SIGKILL'); fs.rmSync(dir,{recursive:true,force:true}); }
console.log(`\nsummer3 (E.8 سرور): ${pass+fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail?1:0);
}
main().catch(e=>{console.error(e);process.exit(1);});
