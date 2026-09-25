import os,subprocess,json,time,datetime,pathlib
root=pathlib.Path('/home/user/p2');out=pathlib.Path('/home/user/arena-sync/evidence');sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
assert not subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True)
env=os.environ|{'PATH':'/tmp/sync-node/node_modules/.bin:'+os.environ['PATH'],'NODE_PATH':'/tmp/sync-deps/node_modules','PAYESH_ALLOW_DEV_MEMORY_AUTHORITY':'1','TMPDIR':'/var/tmp','SYNC_TEST_DATABASE_URL':'postgres://user@127.0.0.1:25432/postgres'}
rows=[];failed=[]
legacy=['data-integrity-occ-migration','sync-dup-claim','sync-atomic-batch','sync-del-mirror','sync-cache-errors','sync-mirror-visible','sync-chunk','sync-sending-revive','sync-dlq-retry','sync-queue-caps','sync-lastsync','delta-sync-hardening','offline-sync-drill','sync-conflict-ui','occ','server15','server18','conflicts-list-cap']
new=['sync-occ-adversarial-live','sync-replay-adversarial-live','sync-client-adversarial','strict-gate-empty-registry']
cases=[(name,['node','tests/'+name+'.js'],0) for name in legacy]
cases += [(f'{name}-independent-{i}',['node','tests/'+name+'.js'],0) for i in [1,2] for name in new]
cases += [('strict-gate',['node','tools/strict-verification-gate.js'],1),('check-authz',['node','tools/check-authz.js'],0)]
for name,cmd,expected in cases:
 start=time.monotonic_ns();utc=datetime.datetime.now(datetime.timezone.utc).isoformat()
 try:
  p=subprocess.run(cmd,cwd=root,env=env,capture_output=True,text=True,timeout=150);code=p.returncode;text=p.stdout+'\nSTDERR\n'+p.stderr
 except subprocess.TimeoutExpired as e:code=124;text=str(e)
 log=out/('final-'+name+'.log');log.write_text(text)
 rows.append(dict(case=name,sha=sha,command=cmd,cwd=str(root),utc=utc,start_ns=start,end_ns=time.monotonic_ns(),expected_exit=expected,actual_exit=code,log=log.name,gate_status='NOT VERIFIED' if name=='strict-gate' else None))
 (out/'final-command-ledger.json').write_text(json.dumps(rows,indent=2))
 if code!=expected:failed.append(name)
 print(name,'actual_exit',code,'expected_exit',expected,flush=True)
(out/'final-failures.json').write_text(json.dumps(failed));print('FINAL_REGRESSION_COMPLETED unexpected_failures='+str(failed),flush=True)
raise SystemExit(1 if failed else 0)
