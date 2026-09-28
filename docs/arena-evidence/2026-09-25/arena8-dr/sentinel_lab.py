import subprocess as s,os,time,re,tempfile,pathlib,shutil,json,datetime
R=pathlib.Path('/home/user/p2');O=pathlib.Path('/home/user/arena8-dr/evidence');env={'PATH':'/usr/bin:/bin','HOME':'/home/user'};ledger=[]
SENTINEL_BASE_DIR='/tmp/arena8-sentinel'
OUT_NAME_RE=re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]*$')
def _out(name):
 t=str(name)
 if not OUT_NAME_RE.fullmatch(t): raise SystemExit(f'refusing unsafe out name: {t!r}')
 return O/t
def _out_json(tag): return _out(str(tag)+'.json')
def _safe_path(path,root):
 p=pathlib.Path(path).resolve();r=pathlib.Path(root).resolve()
 if p!=r and r not in p.parents:raise ValueError(f'path escapes allowed base {r}: {p}')
 return p
def _safe_name(name):
 t=str(name)
 if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*',t): raise SystemExit(f'refusing unsafe dir name: {t!r}')
 return t
def _conf(base_dir):
 p=pathlib.Path(base_dir)/'redis.conf';_safe_path(p,base_dir);return p
def _server_log(base_dir):
 p=pathlib.Path(base_dir)/'server.log';_safe_path(p,base_dir);return p
def cmd(tag,args,extra=None):
 t=time.monotonic_ns();p=s.run(list(map(str,args)),env=env|(extra or {}),cwd=R,capture_output=True,text=True,timeout=70)
 row={'id':tag,'command':list(map(str,args)),'environment':extra or {},'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'elapsed_ms':(time.monotonic_ns()-t)/1e6,'utc_end':datetime.datetime.now(datetime.timezone.utc).isoformat()};_out_json(tag).write_text(json.dumps(row,indent=2));ledger.append(row);print(tag,p.returncode,flush=True);return row
for n in [1,2]:
 b=pathlib.Path(SENTINEL_BASE_DIR);shutil.rmtree(b,ignore_errors=True);b.mkdir(parents=True,exist_ok=True);procs=[];p=56600+n*10
 def boot(name,port,extra='',sentinel=False):
  d=b/_safe_name(name);d.mkdir();c=_conf(d);c.write_text(f'bind 127.0.0.1\nport {port}\ndir {d}\nlogfile {_server_log(d)}\n'+extra)
  x=s.Popen(['redis-server',str(c)]+(['--sentinel'] if sentinel else []),env=env,stdout=s.DEVNULL,stderr=s.DEVNULL);procs.append(x)
 try:
  boot('master',p,'save ""\n');boot('replica',p+1,f'save ""\nreplicaof 127.0.0.1 {p}\n')
  for k in range(3):boot('sentinel'+str(k),p+2+k,f'sentinel monitor arena 127.0.0.1 {p} 2\nsentinel down-after-milliseconds arena 3000\nsentinel failover-timeout arena 10000\n',True)
  for _ in range(150):
   q=s.run(['redis-cli','-p',str(p+1),'INFO','replication'],capture_output=True,text=True,env=env)
   if 'master_link_status:up' in q.stdout:break
   time.sleep(.1)
  cmd(f's{n}-seed',['redis-cli','-p',p,'SET','arena:marker',f'run-{n}']);cmd(f's{n}-ack',['redis-cli','-p',p,'WAIT','1','2000'])
  ex={'SENTINELS':','.join(f'127.0.0.1:{p+2+k}' for k in range(3)),'MASTER_NAME':'arena'}
  cmd(f's{n}-healthy-guard',['bash','tools/failover-redis.sh','--dry-run'],ex)
  cmd(f's{n}-forced-failover',['bash','tools/failover-redis.sh','--force'],ex)
  cmd(f's{n}-new-master',['redis-cli','-p',p+2,'SENTINEL','get-master-addr-by-name','arena'])
  cmd(f's{n}-role',['redis-cli','-p',p+1,'INFO','replication']);cmd(f's{n}-marker',['redis-cli','-p',p+1,'GET','arena:marker'])
  cmd(f's{n}-post-write',['redis-cli','-p',p+1,'SET','arena:post','ok'])
 except Exception as e:_out_json(f's{n}-exception').write_text(str(e))
 finally:
  for x in procs:x.terminate()
  for x in procs:
   try:x.wait(timeout=4)
   except: x.kill();x.wait()
  for f in b.rglob('server.log'):_out_json(f's{n}-{f.parent.name}.log').write_text(f.read_text())
  shutil.rmtree(b)
_out('ledger-sentinel.json').write_text(json.dumps(ledger,indent=2));print('SENTINEL_COMPLETE',flush=True)
