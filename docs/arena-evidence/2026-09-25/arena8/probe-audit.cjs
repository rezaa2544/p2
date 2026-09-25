const http=require('node:http'),fs=require('node:fs'),{spawn}=require('node:child_process');
const root='/home/user/arena8/evidence', tool='/home/user/p2/tools/capacity-saturation-probe.js';
const rows=[];
async function run(name,args){ const command=[process.execPath,tool,...args]; return await new Promise(resolve=>{const p=spawn(command[0],command.slice(1),{cwd:'/home/user/p2',env:{PATH:process.env.PATH}});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b); const timer=setTimeout(()=>p.kill('SIGKILL'),15000);p.on('close',(code,signal)=>{clearTimeout(timer);fs.writeFileSync(`${root}/${name}.log`,JSON.stringify({command,code,signal,stdout,stderr},null,2));resolve({code,signal});});});}
(async()=>{for(let repeat=1;repeat<=2;repeat++) for(const mode of ['ok','unauthorized','disconnect','server-error','truncated','zero','invalid','negative-duration']){
 let requests=0;
 const server=http.createServer((q,r)=>{if(q.url==='/metrics'){r.end('# empty fixture metrics\n');return;}requests++; if(mode==='disconnect'){q.socket.destroy();return;} if(mode==='truncated'){r.writeHead(200,{'Content-Length':'100'});r.write('x');setTimeout(()=>r.destroy(),5);return;} r.statusCode=mode==='unauthorized'?401:mode==='server-error'?503:200; r.end(JSON.stringify({ok:r.statusCode===200}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const name=`${mode}-${repeat}`,out=`${root}/${name}.json`;
 const args=['--target',`http://127.0.0.1:${server.address().port}`,'--confirm-staging','--profile','read-browse','--staircase',mode==='zero'?'0':mode==='invalid'?'abc':'2','--warmup-seconds','0.03','--step-seconds',mode==='negative-duration'?'-1':'0.15','--req-timeout-ms','100','--out',out];
 const result=await run(name,args);const artifact=fs.existsSync(out)?JSON.parse(fs.readFileSync(out)):null;
 rows.push({name,...result,fixtureRequests:requests,steps:artifact?.steps.map(s=>({requests:s.requests,errorRatePct:s.errorRatePct,transportErrors:s.transportErrors,p95:s.p95})),slo:artifact?.slo,knee:artifact?.knee});server.closeAllConnections();await new Promise(r=>server.close(r));
 }
 for(const stair of ['0','abc'])rows.push({name:'validate-'+stair,...await run('validate-'+stair,['--validate','--staircase',stair])});
 fs.writeFileSync(root+'/summary.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
