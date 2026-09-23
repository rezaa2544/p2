#!/usr/bin/env python3
"""REAL local DR regression + measured DB RPO/RTO. Never E4.
Requires PostgreSQL/pgBackRest/Redis binaries. No skip-success. All targets are
fresh disposable directories/loopback. Run with --out outside the repository.
"""
from concurrent.futures import ThreadPoolExecutor
import argparse,datetime,fcntl,glob,hashlib,json,os,pathlib,shutil,subprocess as sp,tempfile,time,traceback
ROOT=pathlib.Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--runs',type=int,default=5);args=parser.parse_args()
OUT=pathlib.Path(args.out).resolve();OUT.mkdir(parents=True,exist_ok=True)
PG=sorted(glob.glob('/usr/lib/postgresql/*/bin'))[-1]
ENV={'PATH':PG+':/usr/bin:/bin','HOME':str(pathlib.Path.home()),'USER':os.environ.get('USER','user'),'LANG':'C.UTF-8'}
ledger=[]; failures=[]; measurements=[]

def check(tag,condition,detail=''):
    print(('PASS ' if condition else 'FAIL ')+tag,flush=True)
    ledger.append({'id':tag,'assertion':bool(condition),'detail':detail})
    if not condition:failures.append(tag)

def run(tag,argv,env=None,expected=0,timeout=150):
    start=time.monotonic_ns();utc=datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        p=sp.run(list(map(str,argv)),cwd=ROOT,env=ENV|(env or {}),text=True,capture_output=True,timeout=timeout)
        code,stdout,stderr=p.returncode,p.stdout,p.stderr
    except sp.TimeoutExpired as e:code,stdout,stderr=124,str(e.stdout),str(e.stderr)
    row=dict(id=tag,command=list(map(str,argv)),environment=env or {},utc_start=utc,start_monotonic_ns=start,end_monotonic_ns=time.monotonic_ns(),exit=code,stdout=stdout,stderr=stderr,expected=expected)
    ledger.append(row);(OUT/(tag+'.json')).write_text(json.dumps(row,indent=2))
    ok=code!=0 if expected=='nonzero' else code==expected
    check(tag+'-exit',ok,f'expected {expected}, actual {code}')
    return row

def pg_test(n):
    b=pathlib.Path(tempfile.mkdtemp(prefix='a8c-pg-'));started=[];port=55300+n*10
    source=b/'source';sock=b/'socket';sock.mkdir();repo=b/'repo';repo.mkdir();conf=b/'pbr.conf'
    conf.write_text(f'[global]\nrepo1-path={repo}\nrepo1-retention-full=2\nstart-fast=y\nlog-path={b}\nlock-path={b}/lock\nspool-path={b}/spool\n[payesh]\npg1-path={source}\npg1-port={port}\npg1-socket-path={sock}\npg1-user=user\n')
    env={'PGBACKREST_CONFIG':str(conf),'PGHOST':str(sock),'PGPORT':str(port),'PGDATABASE':'payesh','PGUSER':'user'}
    def sql(tag,q,extra=None):return run(f'p{n}-{tag}',['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-c',q],env|(extra or {}))['stdout'].strip()
    def restore(tag,options,manifest):
        r=run(f'p{n}-{tag}',['bash','tools/pitr-restore.sh',*options,'--dest',b/tag,'--port',port+1,'--manifest',manifest],env)
        lines=[line.split('=',1)[1] for line in r['stdout'].splitlines() if line.startswith('PITR_RUN_DIR=')]
        if not lines:raise RuntimeError('restore did not report run directory')
        d=pathlib.Path(lines[0]);targetenv=env|{'PGHOST':str(d/'run'),'PGPORT':str(port+1)}
        if (d/'data'/'postmaster.pid').exists():started.append(d/'data')
        if r['exit']!=0:raise RuntimeError('restore failed: '+r['stderr'][-500:])
        return d,targetenv
    try:
        run(f'p{n}-init',['initdb','-U','user','-D',source,'-A','trust','--no-locale'])
        with (source/'postgresql.conf').open('a') as f:f.write(f"\nport={port}\nlisten_addresses=''\nunix_socket_directories='{sock}'\narchive_mode=on\narchive_command='pgbackrest --config={conf} --stanza=payesh archive-push %p'\nwal_level=replica\n")
        run(f'p{n}-start',['pg_ctl','-D',source,'-l',b/'source.log','-w','start'],env);started.append(source)
        sql('database','CREATE DATABASE payesh',{'PGDATABASE':'postgres'})
        sql('seed',';'.join(f"CREATE TABLE {t}(id int PRIMARY KEY,value text); INSERT INTO {t} SELECT i,'seed-{n}-'||i FROM generate_series(1,10)i" for t in ('users','schools','classes','grades','attendance')))
        run(f'p{n}-stanza',['pgbackrest','--stanza=payesh','stanza-create'],env)
        run(f'p{n}-backup',['pgbackrest','--stanza=payesh','--type=full','backup'],env)
        run(f'p{n}-backup-info',['pgbackrest','--stanza=payesh','--output=json','info'],env)
        # pgBackRest backup stop timestamps are second-granular. Place the
        # later time target strictly beyond the recorded backup stop second.
        time.sleep(1.1)
        sql('commit','INSERT INTO users VALUES(11,\'committed-before-target\')')
        manifest=b/'expected.json';run(f'p{n}-capture',['python3','tools/pitr-manifest.py','--capture',manifest],env)
        targettime=sql('target-time','SELECT clock_timestamp()::text')
        sql('restore-point',"SELECT pg_create_restore_point('arena_committed')")
        sql('after-point',"INSERT INTO users VALUES(12,'after-target'); SELECT pg_switch_wal()")
        run(f'p{n}-archive',['pgbackrest','--stanza=payesh','check'],env)
        d,te=restore('named',['--name','arena_committed'],manifest)
        run(f'p{n}-wrong-source',['bash','tools/pitr-verify.sh','--manifest',manifest,'--expect-data-dir',d/'data'],env,expected='nonzero')
        run(f'p{n}-missing-manifest',['bash','tools/pitr-verify.sh'],te,expected='nonzero')
        run(f'p{n}-wrong-dir',['bash','tools/pitr-verify.sh','--manifest',manifest,'--expect-data-dir',source],te,expected='nonzero')
        run(f'p{n}-crash',['pg_ctl','-D',d/'data','-m','immediate','-w','stop'],te)
        run(f'p{n}-restart',['pg_ctl','-D',d/'data','-o',f'-c config_file={d}/etc/postgresql.conf','-l',d/'restart.log','-w','start'],te)
        run(f'p{n}-post-crash-integrity',['bash','tools/pitr-verify.sh','--manifest',manifest,'--expect-data-dir',d/'data'],te)
        run(f'p{n}-named-stop',['pg_ctl','-D',d/'data','-m','fast','-w','stop'],te);started.remove(d/'data')
        d,te=restore('time',['--native','--time',targettime],manifest)
        run(f'p{n}-time-stop',['pg_ctl','-D',d/'data','-m','fast','-w','stop'],te);started.remove(d/'data')
        latest=b/'latest.json';run(f'p{n}-capture-latest',['python3','tools/pitr-manifest.py','--capture',latest],env)
        d,te=restore('latest',['--latest'],latest)
        run(f'p{n}-already-primary',['bash','tools/failover-postgres.sh','--dry-run'],te,expected='nonzero')
        # Streaming replication with acknowledged source writes, then real crash.
        standby=b/'standby';ssock=b/'standby-socket';ssock.mkdir()
        run(f'p{n}-basebackup',['pg_basebackup','-h',sock,'-p',port,'-U','user','-D',standby,'-R','-X','stream','-c','fast'],env)
        se=env|{'PGHOST':str(ssock),'PGPORT':str(port+2),'OLD_PGHOST':str(sock),'OLD_PGPORT':str(port)}
        run(f'p{n}-standby-start',['pg_ctl','-D',standby,'-o',f'-p {port+2} -k {ssock} -c archive_mode=off','-l',b/'standby.log','-w','start'],env);started.append(standby)
        ack={}
        def writer(i):
            sql(f'ack-write-{i}',f"INSERT INTO grades VALUES({i},'ack-{i}')")
            ack[i]=time.monotonic_ns()
        with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(writer,range(100,110)))
        # Explicit bounded convergence; not pretending async replication is sync.
        for _ in range(100):
            p=sp.run(['psql','-X','-qAtc','SELECT count(*) FROM grades WHERE id>=100'],env=ENV|se,capture_output=True,text=True)
            if p.returncode==0 and p.stdout.strip()=='10':break
            time.sleep(.05)
        before=sql('standby-before',"SELECT md5(string_agg(grades::text,'|' ORDER BY id)) FROM grades",se)
        run(f'p{n}-no-fence',['bash','tools/failover-postgres.sh','--dry-run'],se,expected='nonzero')
        # Fence verifier checks the exact local source process is STOPPED, not merely unreachable.
        fence=b/'fence';fence.write_text(f'#!/bin/bash\npg_ctl -D "{source}" status >/dev/null 2>&1\nrc=$?\n[ "$rc" = 3 ] || exit 1\nprintf "FENCED %s:%s\\n" "$1" "$2"\n');fence.chmod(0o700);se['PG_FENCE_CHECK']=str(fence)
        failure=time.monotonic_ns();failure_utc=datetime.datetime.now(datetime.timezone.utc).isoformat()
        run(f'p{n}-primary-crash',['pg_ctl','-D',source,'-m','immediate','-w','stop'],env);started.remove(source)
        run(f'p{n}-promote',['bash','tools/failover-postgres.sh'],se)
        after=sql('standby-after',"SELECT md5(string_agg(grades::text,'|' ORDER BY id)) FROM grades",se)
        check(f'p{n}-promote-hash',before==after)
        surviving=set(map(int,sql('surviving-acks','SELECT id FROM grades WHERE id>=100 ORDER BY id',se).splitlines()))
        sql('recovery-write',"INSERT INTO users VALUES(999,'recovered')",se)
        check(f'p{n}-recovery-read',sql('recovery-read',"SELECT value FROM users WHERE id=999",se)=='recovered')
        end=time.monotonic_ns();last_recovered=max((ack[k] for k in surviving if k in ack),default=None)
        measurements.append(dict(run=n,scope='E3 PostgreSQL DB service; not application/E4',failure_utc=failure_utc,failure_monotonic_ns=failure,recovered_monotonic_ns=end,rto_seconds=(end-failure)/1e9,lost_acknowledged_ids=sorted(set(ack)-surviving),rpo_ack_loss_window_seconds=None if last_recovered is None else (max(ack.values())-last_recovered)/1e9,recovered_point_age_at_failure_seconds=None if last_recovered is None else (failure-last_recovered)/1e9,acknowledgements=ack,definition='RTO fault injection -> role change + expected dataset + successful new committed write/read. RPO loss window last acknowledged write minus newest recovered acknowledged write; also report point age.' ))
        # Real upstream semantic verification contract + corrupted restore refusal.
        files=[p for p in (repo/'backup').rglob('*.gz') if '/base/' in str(p)]
        corrupt=max(files,key=lambda p:p.stat().st_size);corrupt.write_bytes(b'CORRUPTED-BACKUP')
        result=run(f'p{n}-verify-corrupt',['pgbackrest','--stanza=payesh','--log-level-console=info','verify'],env)
        check(f'p{n}-verify-semantic-invalid','status: invalid' in result['stdout'])
        run(f'p{n}-restore-corrupt',['pgbackrest','--stanza=payesh',f'--pg1-path={b}/corrupt-target','--type=immediate','restore'],env,expected='nonzero')
    finally:
        for f in b.rglob('*.log'):
            if 'repo' not in f.parts:(OUT/f'p{n}-{f.parent.name}-{f.name}').write_text(f.read_text())
        for d in reversed(started):sp.run(['pg_ctl','-D',str(d),'-m','immediate','-w','stop'],env=ENV|env,capture_output=True)
        shutil.rmtree(b)

def redis_test(n):
    b=pathlib.Path(tempfile.mkdtemp(prefix='a8c-redis-'));processes=[];port=56200+n*10
    def boot(name,p,aof=True):
        d=b/name;d.mkdir(exist_ok=True);log=open(d/'server.log','w')
        proc=sp.Popen(['redis-server','--bind','127.0.0.1','--port',str(p),'--dir',str(d),'--save','','--appendonly','yes' if aof else 'no','--aof-use-rdb-preamble','yes' if n%2 else 'no'],env=ENV,stdout=log,stderr=sp.STDOUT);processes.append((proc,log))
        for _ in range(100):
            if sp.run(['redis-cli','-p',str(p),'PING'],env=ENV,capture_output=True).returncode==0:return d
            time.sleep(.03)
        raise RuntimeError('Redis not ready')
    try:
        source=boot('source',port)
        run(f'r{n}-seed',['redis-cli','-p',port,'SET','arena:identity',f'run-{n}'])
        env={'REDIS_DIR':str(source),'REDIS_PORT':str(port),'BACKUP_DIR':str(b/'backup'),'BACKUP_LOCK':str(b/'lock')}
        run(f'r{n}-backup',['bash','tools/redis-backup.sh'],env)
        rdb=next((b/'backup').glob('dump-*.rdb'));aof=next((b/'backup').glob('appendonlydir-*'))
        files=[str(x.relative_to(aof)) for x in aof.iterdir()]
        check(f'r{n}-manifest-complete',any(x.endswith('.manifest') for x in files) and any(x.endswith(('.rdb','.base.aof')) for x in files),str(files))
        d=b/'rdb-target';d.mkdir();shutil.copy(rdb,d/'dump.rdb');boot('rdb-target',port+1,False)
        r=run(f'r{n}-rdb-read',['redis-cli','-p',port+1,'GET','arena:identity']);check(f'r{n}-rdb-data',r['stdout'].strip()==f'run-{n}')
        d=b/'aof-target';d.mkdir();shutil.copytree(aof,d/'appendonlydir');boot('aof-target',port+2,True)
        r=run(f'r{n}-aof-read',['redis-cli','-p',port+2,'GET','arena:identity']);check(f'r{n}-aof-data',r['stdout'].strip()==f'run-{n}')
        bad=b/'corrupt.rdb';bad.write_bytes(rdb.read_bytes()[:20]);run(f'r{n}-corrupt',['redis-check-rdb',bad],expected='nonzero')
        wrong=b/'wrong';wrong.mkdir();shutil.copy(rdb,wrong/'dump.rdb')
        run(f'r{n}-wrong-source',['bash','tools/redis-backup.sh'],env|{'REDIS_DIR':str(wrong),'BACKUP_DIR':str(b/'bad-backup')},expected='nonzero')
        run(f'r{n}-missing-s3',['bash','tools/redis-backup.sh'],env|{'BACKUP_S3':'s3://test-only/b','BACKUP_S3_OWNER':'123456789012'},expected='nonzero')
        run(f'r{n}-unreachable',['bash','tools/redis-backup.sh'],env|{'REDIS_PORT':'1'},expected='nonzero')
        with open(b/'lock','w') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX);run(f'r{n}-lock',['bash','tools/redis-backup.sh'],env,expected=75)
        run(f'r{n}-aof-source-shutdown',['redis-cli','-p',port+2,'SHUTDOWN','NOSAVE'])
        boot('aof-target',port+2,True)
        r=run(f'r{n}-aof-restart-read',['redis-cli','-p',port+2,'GET','arena:identity']);check(f'r{n}-aof-restart-data',r['stdout'].strip()==f'run-{n}')
    finally:
        for proc,log in processes:
            if proc.poll() is None:
                proc.terminate()
                try:proc.wait(timeout=5)
                except sp.TimeoutExpired:proc.kill();proc.wait()
            log.close()
        for f in b.rglob('server.log'):(OUT/f'r{n}-{f.parent.name}.log').write_text(f.read_text())
        shutil.rmtree(b)

try:
    run('versions',['bash','-c','psql --version; redis-server --version; pgbackrest version; uname -a'])
    for n in range(1,args.runs+1):
        for label,func in [('postgres',pg_test),('redis',redis_test)]:
            try:func(n)
            except Exception:
                failures.append(f'{label}{n}-exception');(OUT/f'{label}{n}-exception.txt').write_text(traceback.format_exc());print(traceback.format_exc(),flush=True)
finally:
    (OUT/'ledger.json').write_text(json.dumps(ledger,indent=2));(OUT/'measurements.json').write_text(json.dumps(measurements,indent=2));(OUT/'failures.json').write_text(json.dumps(failures,indent=2));print('DR_TEST_COMPLETE failures='+str(failures),flush=True)
raise SystemExit(1 if failures else 0)
