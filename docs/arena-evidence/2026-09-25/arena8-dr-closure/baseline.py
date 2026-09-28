import os,sys,json,time,subprocess as sp,tempfile,pathlib,re,shutil,hashlib,glob,fcntl,traceback,datetime
ROOT=pathlib.Path('/home/user/p2'); OUT=pathlib.Path('/home/user/arena8-dr-closure/evidence/baseline'); OUT.mkdir(exist_ok=True)
PG='/usr/lib/postgresql/16/bin'
ENV={'PATH':PG+':/usr/bin:/bin','HOME':'/home/user','USER':'user','LANG':'C.UTF-8'}
ledger=[]
def _safe_path(path,root):
 p=pathlib.Path(path).resolve();r=pathlib.Path(root).resolve()
 if p!=r and r not in p.parents:raise ValueError(f'path escapes allowed base {r}: {p}')
 return p
SERVER_LOG_NAME='server.log';LOCK_NAME='lock'
REDIS_BASE_DIR='/tmp/arena8-dr-redis';PG_BASE_DIR='/tmp/arena8-dr-pg'
SRC_DIR=REDIS_BASE_DIR+'/source';RDB_TARGET_DIR=REDIS_BASE_DIR+'/rdb-target';AOF_TARGET_DIR=REDIS_BASE_DIR+'/aof-target'
BACKUP_DIR=REDIS_BASE_DIR+'/backup';WRONG_DIR=REDIS_BASE_DIR+'/wrong';WRONG_BACKUP_DIR=REDIS_BASE_DIR+'/wrong-backup'
UNREACHABLE_DIR=REDIS_BASE_DIR+'/unreachable';CORRUPT_RDB=REDIS_BASE_DIR+'/corrupt.rdb';LOCK_PATH=REDIS_BASE_DIR+'/lock'
OUT_NAME_RE=re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]*$')
def _server_log(base_dir):
 p=pathlib.Path(base_dir)/SERVER_LOG_NAME;_safe_path(p,base_dir);return p
def _lock_file(base_dir):
 p=pathlib.Path(base_dir)/LOCK_NAME;_safe_path(p,base_dir);return p
def _out(name):
 s=str(name)
 if not OUT_NAME_RE.fullmatch(s): raise SystemExit(f'refusing unsafe out name: {s!r}')
 return OUT/s
def _out_json(tag):
 return _out(str(tag)+'.json')
def _auto_conf(base_dir):
 p=pathlib.Path(base_dir)/'postgresql.auto.conf';_safe_path(p,base_dir);return p
def _target_log(base_dir):
 p=pathlib.Path(base_dir)/'target.log';_safe_path(p,base_dir);return p
def run(tag,args,env=None,check=False,timeout=90):
 e=ENV| (env or {}); start=datetime.datetime.now(datetime.timezone.utc).isoformat(); t=time.monotonic_ns()
 try:
  p=sp.run([str(x) for x in args],env=e,cwd=ROOT,text=True,capture_output=True,timeout=timeout); rc=p.returncode; stdout=p.stdout; stderr=p.stderr
 except sp.TimeoutExpired as x: rc=124; stdout=str(x.stdout);stderr=str(x.stderr)
 row=dict(id=tag,command=[str(x) for x in args],environment=env or {},utc_start=start,elapsed_ms=(time.monotonic_ns()-t)/1e6,exit=rc,stdout=stdout,stderr=stderr)
 ledger.append(row);_out_json(tag).write_text(json.dumps(row,indent=2));print(tag,'exit',rc,flush=True)
 if check and rc: raise RuntimeError(tag+': '+stderr[-1500:])
 return row

def _safe_name(name):
 """ensure the sub-directory name is a plain scalar (no traversal, no separators)."""
 s=str(name)
 if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', s): raise SystemExit(f'refusing unsafe dir name: {s!r}')
 return s

def redis_suite(n):
 base=pathlib.Path(REDIS_BASE_DIR);shutil.rmtree(base,ignore_errors=True);base.mkdir(parents=True,exist_ok=True); procs=[]
 def boot(dir_const,port,aof=False):
  d=pathlib.Path(dir_const);d.mkdir(exist_ok=True)
  log=_server_log(d).open('w');p=sp.Popen(['redis-server','--bind','127.0.0.1','--port',str(port),'--dir','.','--appendonly','yes' if aof else 'no','--save',''],env=ENV,cwd=d,stdout=log,stderr=sp.STDOUT);procs.append((p,log))
  for _ in range(100):
   q=sp.run(['redis-cli','-p',str(port),'PING'],env=ENV,capture_output=True)
   if q.returncode==0: return d
   if p.poll() is not None: break
   time.sleep(.03)
  return d
 port=56370+n*10
 try:
  src=boot(SRC_DIR,port,True)
  run(f'r{n}-seed',['redis-cli','-p',port,'SET','arena:identity',f'dataset-{n}'],check=True)
  env={'REDIS_HOST':'127.0.0.1','REDIS_PORT':str(port),'REDIS_DIR':str(src),'BACKUP_DIR':BACKUP_DIR,'BACKUP_LOCK':LOCK_PATH,'BACKUP_S3':'s3://arena8-no-network-test/redis'}
  run(f'r{n}-backup-s3-missing',['bash','tools/redis-backup.sh'],env,check=True)
  b=pathlib.Path(BACKUP_DIR);files=[str(p.relative_to(b)) for p in b.rglob('*') if p.is_file()];rdb=list(b.glob('dump-*.rdb'))[0]
  _out_json(f'r{n}-archive').write_text(json.dumps({'files':files,'rdb_sha256':hashlib.sha256(rdb.read_bytes()).hexdigest(),'source_files':[str(p.relative_to(src)) for p in src.rglob('*') if p.is_file()]},indent=2))
  # Actual RDB restore on distinct target, expected dataset marker.
  dst=pathlib.Path(RDB_TARGET_DIR);dst.mkdir();shutil.copy(rdb,dst/'dump.rdb');boot(RDB_TARGET_DIR,port+1)
  run(f'r{n}-restored-marker',['redis-cli','-p',port+1,'GET','arena:identity'])
  run(f'r{n}-rdb-integrity',['redis-check-rdb',rdb])
  aof=pathlib.Path(AOF_TARGET_DIR);aof.mkdir();ap=list(b.glob('appendonlydir-*'))[0];shutil.copytree(ap,aof/'appendonlydir');boot(AOF_TARGET_DIR,port+2,True)
  run(f'r{n}-aof-restored-marker',['redis-cli','-p',port+2,'GET','arena:identity'])
  _out_json(f'r{n}-aof-boot').write_text(_server_log(aof).read_text())
  bad=pathlib.Path(CORRUPT_RDB);bad.write_bytes(rdb.read_bytes()[:20]);run(f'r{n}-corrupt-rdb',['redis-check-rdb',bad])
  # lock contention must not be success
  with _lock_file(base).open('w') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);run(f'r{n}-lock-busy',['bash','tools/redis-backup.sh'],env)
  # healthy source, WRONG local directory: valid unrelated RDB falsely attributed to source endpoint
  wrong=pathlib.Path(WRONG_DIR);wrong.mkdir();shutil.copy(rdb,wrong/'dump.rdb')
  run(f'r{n}-source-mutated',['redis-cli','-p',port,'SET','arena:identity','new-source-dataset'])
  wrongenv=env|{'REDIS_DIR':str(wrong),'BACKUP_DIR':WRONG_BACKUP_DIR,'BACKUP_S3':''}
  run(f'r{n}-wrong-directory',['bash','tools/redis-backup.sh'],wrongenv)
  wr=list(pathlib.Path(WRONG_BACKUP_DIR).glob('dump-*.rdb'))[0]
  _out_json(f'r{n}-wrong-target').write_text(json.dumps({'backup_equals_old_dataset':hashlib.sha256(wr.read_bytes()).hexdigest()==hashlib.sha256(rdb.read_bytes()).hexdigest(),'manifest':(pathlib.Path(WRONG_BACKUP_DIR)/'last-backup.txt').read_text()},indent=2))
  # Unavailable source must fail.
  run(f'r{n}-unreachable',['bash','tools/redis-backup.sh'],env|{'REDIS_PORT':'1','BACKUP_DIR':UNREACHABLE_DIR})
 finally:
  for p,f in procs:
    p.terminate()
    try:p.wait(timeout=5)
    except: p.kill();p.wait()
    f.close()
  shutil.rmtree(base)

def pg_suite(n):
 base=pathlib.Path(PG_BASE_DIR);shutil.rmtree(base,ignore_errors=True);base.mkdir(parents=True,exist_ok=True);data=base/'source';sock=base/'socket';sock.mkdir(); repo=base/'repo';repo.mkdir();port=55430+n*2;started=[]
 conf=base/'pbr.conf';conf.write_text(f'[global]\nrepo1-path={repo}\nrepo1-retention-full=2\nlog-path={base}\nlock-path={base}/lock\nspool-path={base}/spool\nlog-level-console=info\nstart-fast=y\n[payesh]\npg1-path={data}\npg1-port={port}\npg1-socket-path={sock}\npg1-user=user\n')
 env={'PGBACKREST_CONFIG':str(conf),'PGHOST':str(sock),'PGPORT':str(port),'PGUSER':'user','PGDATABASE':'payesh'}
 def sql(tag,text,other=None,db='payesh',check=True):return run(f'p{n}-{tag}',['psql','-v','ON_ERROR_STOP=1','-d',db,'-tAXc',text],env|(other or {}),check=check)
 def stop(d): run(f'p{n}-stop-{d.name}',['pg_ctl','-D',d,'-m','immediate','-w','stop'],env)
 try:
  run(f'p{n}-init',['initdb','-D',data,'-A','trust','--no-locale'],check=True)
  with (data/'postgresql.conf').open('a') as f:f.write(f"\nport={port}\nlisten_addresses=''\nunix_socket_directories='{sock}'\narchive_mode=on\narchive_command='pgbackrest --config={conf} --stanza=payesh archive-push %p'\nwal_level=replica\n")
  run(f'p{n}-start',['pg_ctl','-D',data,'-l',base/'source.log','-w','start'],env,True);started.append(data)
  sql('create-db','CREATE DATABASE payesh',db='postgres')
  sql('seed',";".join(f"CREATE TABLE {t}(id int primary key, value text); INSERT INTO {t} SELECT i,'run{n}-'||i FROM generate_series(1,10)i" for t in ['users','schools','classes','grades','attendance']))
  run(f'p{n}-stanza',['pgbackrest','--stanza=payesh','stanza-create'],env,True)
  run(f'p{n}-backup',['pgbackrest','--stanza=payesh','--type=full','backup'],env,True)
  run(f'p{n}-info',['pgbackrest','--stanza=payesh','--output=json','info'],env,True)
  sql('before-target',"INSERT INTO users VALUES(11,'keep'); SELECT pg_create_restore_point('arena_target');")
  expected=sql('expected',"SELECT count(*),md5(string_agg(users::text,'|' ORDER BY id)) FROM users")["stdout"]
  sql('after-target',"INSERT INTO users VALUES(12,'must-not-restore'); SELECT pg_switch_wal();")
  run(f'p{n}-archive-check',['pgbackrest','--stanza=payesh','check'],env,True)
  # Live CLI boundaries, no mock tools.
  for tag,args in [('time',['--time','2026-09-23 00:00:00+00']),('latest',['--latest']),('native',['--native','--time','2026-09-23 00:00:00+00'])]:
   run(f'p{n}-restore-{tag}',['bash','tools/pitr-restore.sh',*args,'--no-start','--dest',base/tag],env)
  run(f'p{n}-restore-name',['bash','tools/pitr-restore.sh','--name','arena_target','--no-start','--dest',base/'restore','--port',port+1],env,True)
  rd=next((base/'restore').glob('pitr-*'));target=rd/'data'
  _out_json(f'p{n}-restore-auto.conf').write_text(_auto_conf(target).read_text())
  # Independent driver explicitly supplies promote; this is NOT successful unmodified wrapper execution.
  run(f'p{n}-target-start',['pg_ctl','-D',target,'-o',f'-c config_file={rd}/etc/postgresql.conf -c recovery_target_action=promote','-l',_target_log(rd),'-w','start'],env,True);started.append(target)
  tenv={'PGHOST':str(rd/'run'),'PGPORT':str(port+1)}
  for i in range(100):
   q=sp.run(['psql','-tAXc','SELECT pg_is_in_recovery()'],env=ENV|env|tenv,text=True,capture_output=True)
   if q.returncode==0 and q.stdout.strip()=='f':break
   time.sleep(.05)
  actual=sql('actual',"SELECT count(*),md5(string_agg(users::text,'|' ORDER BY id)) FROM users",tenv)['stdout']
  sql('source-identity',"SELECT current_database(),current_setting('data_directory'),system_identifier FROM pg_control_system()")
  sql('target-identity',"SELECT current_database(),current_setting('data_directory'),system_identifier FROM pg_control_system()",tenv)
  _out_json(f'p{n}-comparison.json').write_text(json.dumps({'expected':expected,'actual':actual,'match':expected==actual},indent=2))
  run(f'p{n}-verify-correct',['bash','tools/pitr-verify.sh'],env|tenv)
  run(f'p{n}-verify-wrong-source',['bash','tools/pitr-verify.sh'],env)
  run(f'p{n}-verify-postgres-db',['bash','tools/pitr-verify.sh'],env|tenv|{'PGDATABASE':'postgres'})
  run(f'p{n}-promote-primary-guard',['bash','tools/failover-postgres.sh','--dry-run'],env|tenv)
  # Corrupt one archived backup data file; prove restore refusal, no inferred verify semantics.
  backup_files=[p for p in (repo/'backup'/'payesh').rglob('*') if p.is_file() and '/base/' in str(p)]
  if backup_files:
   damaged=backup_files[0];prior=hashlib.sha256(damaged.read_bytes()).hexdigest();damaged.write_bytes(b'CORRUPT-BACKUP')
   _out_json(f'p{n}-corruption.json').write_text(json.dumps({'file':str(damaged.relative_to(repo)),'before_sha256':prior,'after_sha256':hashlib.sha256(damaged.read_bytes()).hexdigest()}))
   run(f'p{n}-restore-corrupt',['pgbackrest','--stanza=payesh',f'--pg1-path={base}/bad-target','--type=immediate','restore'],env)
  _out_json(f'p{n}-target.log').write_text(_target_log(rd).read_text())
 finally:
  for d in reversed(started):stop(d)
  shutil.rmtree(base)

try:
 run('versions',['bash','-c','psql --version; redis-server --version; pgbackrest version; uname -a; date -u +%FT%TZ'])
 for n in [1,2]:
  for name,fn in [('redis',redis_suite),('pg',pg_suite)]:
   try:fn(n)
   except Exception as e:_out_json(f'{name}{n}-exception.txt').write_text(traceback.format_exc());print(name,n,'ERROR',str(e),flush=True)
finally:
 _out('ledger.json').write_text(json.dumps(ledger,indent=2));print('LAB_COMPLETE',flush=True)
