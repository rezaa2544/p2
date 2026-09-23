#!/usr/bin/env python3
"""Real co-located Sentinel regression + measured Redis service RPO/RTO (E3)."""
import argparse,datetime,json,os,pathlib,shutil,subprocess as sp,tempfile,time,traceback
ROOT=pathlib.Path(__file__).resolve().parents[3];p=argparse.ArgumentParser();p.add_argument('--out',required=True);args=p.parse_args();OUT=pathlib.Path(args.out);OUT.mkdir(parents=True,exist_ok=True)
ENV={'PATH':'/usr/bin:/bin','HOME':str(pathlib.Path.home())};rows=[];failed=[];measurements=[]
def run(tag,argv,extra=None,expected=0):
    start=time.monotonic_ns();r=sp.run(list(map(str,argv)),cwd=ROOT,env=ENV|(extra or {}),capture_output=True,text=True,timeout=70)
    row=dict(id=tag,command=list(map(str,argv)),environment=extra or {},exit=r.returncode,stdout=r.stdout,stderr=r.stderr,start_ns=start,end_ns=time.monotonic_ns(),utc_end=datetime.datetime.now(datetime.timezone.utc).isoformat(),expected=expected);rows.append(row)
    if r.returncode!=expected:failed.append(tag)
    print(tag,'exit',r.returncode,flush=True);return r.stdout.strip()
def check(tag,cond):
    rows.append(dict(id=tag,assertion=bool(cond)));print(tag,bool(cond),flush=True)
    if not cond:failed.append(tag)
def cli(port,*args):return sp.run(['redis-cli','--raw','-p',str(port),*args],env=ENV,capture_output=True,text=True,timeout=3).stdout.strip()
def wait(fn,seconds=40):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        if fn():return True
        time.sleep(.1)
    return False
for n in range(1,6):
    b=pathlib.Path(tempfile.mkdtemp(prefix='a8c-sentinel-'));processes={};port=56700+n*10
    def boot(name,num,extra='',sentinel=False,restart=False):
        d=b/name;d.mkdir(exist_ok=True);cfg=d/'redis.conf'
        if not restart:cfg.write_text(f'bind 127.0.0.1\nport {num}\ndir {d}\nlogfile {d}/server.log\n'+extra)
        proc=sp.Popen(['redis-server',str(cfg)]+(['--sentinel'] if sentinel else []),env=ENV,stdout=sp.DEVNULL,stderr=sp.DEVNULL);processes[num]=proc
    try:
        boot('master',port,'save ""\nappendonly yes\n');boot('replica',port+1,f'save ""\nappendonly yes\nreplicaof 127.0.0.1 {port}\n')
        for k in range(3):boot('sentinel'+str(k),port+2+k,f'sentinel monitor arena 127.0.0.1 {port} 2\nsentinel down-after-milliseconds arena 1500\nsentinel failover-timeout arena 5000\n',True)
        check(f's{n}-initial-sync',wait(lambda:'master_link_status:up' in cli(port+1,'INFO','replication')))
        ex={'SENTINELS':','.join(f'127.0.0.1:{port+2+k}' for k in range(3)),'MASTER_NAME':'arena'}
        run(f's{n}-healthy-guard',['bash','tools/failover-redis.sh','--dry-run'],ex,1)
        run(f's{n}-missing-sentinel',['bash','tools/failover-redis.sh','--dry-run'],ex|{'SENTINELS':'127.0.0.1:1'},1)
        check(f's{n}-sentinel-discovery',wait(lambda:all('master-link-status\nok' in cli(port+2+k,'SENTINEL','replicas','arena') and cli(port+2+k,'SENTINEL','CKQUORUM','arena').startswith('OK') for k in range(3))))
        run(f's{n}-forced-wrapper',['bash','tools/failover-redis.sh','--force'],ex)
        check(f's{n}-new-master','role:master' in cli(port+1,'INFO','replication'))
        check(f's{n}-old-rejoins',wait(lambda:'master_link_status:up' in cli(port,'INFO','replication') and 'role:slave' in cli(port,'INFO','replication')))
        ack={}
        for i in range(10):
            check(f's{n}-ack-{i}',run(f's{n}-set-{i}',['redis-cli','-p',port+1,'SET',f'ack:{i}',f'value-{i}'])=='OK');ack[i]=time.monotonic_ns()
        expected=[f'value-{i}' for i in range(10)];keys=[f'ack:{i}' for i in range(10)]
        check(f's{n}-replica-caught-up',wait(lambda:cli(port,'MGET',*keys).splitlines()==expected))
        failure=time.monotonic_ns();utc=datetime.datetime.now(datetime.timezone.utc).isoformat();processes[port+1].kill();processes[port+1].wait()
        ready=wait(lambda:cli(port+2,'SENTINEL','get-master-addr-by-name','arena').splitlines()==['127.0.0.1',str(port)] and 'role:master' in cli(port,'INFO','replication'))
        check(f's{n}-automatic-failover',ready)
        values=run(f's{n}-recovered-data',['redis-cli','--raw','-p',port,'MGET',*keys]).splitlines()
        check(f's{n}-all-acks-survive',values==expected)
        check(f's{n}-new-write',run(f's{n}-write-after',['redis-cli','-p',port,'SET','post','recovered'])=='OK')
        check(f's{n}-new-read',run(f's{n}-read-after',['redis-cli','-p',port,'GET','post'])=='recovered')
        end=time.monotonic_ns();survive=[i for i,v in enumerate(values) if i in ack and v==expected[i]];last=max((ack[i] for i in survive),default=None)
        measurements.append(dict(run=n,valid=not any(x.startswith(f's{n}-') for x in failed),scope='E3 Redis service, not application/E4',failure_utc=utc,failure_monotonic_ns=failure,recovered_monotonic_ns=end,rto_seconds=(end-failure)/1e9,lost_acknowledged_ids=sorted(set(ack)-set(survive)),rpo_ack_loss_window_seconds=None if last is None else (max(ack.values())-last)/1e9,recovered_point_age_at_failure_seconds=None if last is None else (failure-last)/1e9,acknowledgements=ack))
        boot('replica',port+1,restart=True)
        check(f's{n}-crashed-node-rejoin',wait(lambda:'role:slave' in cli(port+1,'INFO','replication') and 'master_link_status:up' in cli(port+1,'INFO','replication'),60))
        check(f's{n}-rejoin-data',cli(port+1,'MGET',*keys).splitlines()==expected)
    except Exception:
        failed.append(f's{n}-exception');(OUT/f's{n}-exception.txt').write_text(traceback.format_exc())
    finally:
        for proc in processes.values():
            if proc.poll() is None:
                proc.terminate()
                try:proc.wait(timeout=4)
                except sp.TimeoutExpired:proc.kill();proc.wait()
        for log in b.rglob('server.log'):(OUT/f's{n}-{log.parent.name}.log').write_text(log.read_text())
        shutil.rmtree(b)
(OUT/'ledger.json').write_text(json.dumps(rows,indent=2));(OUT/'measurements.json').write_text(json.dumps(measurements,indent=2));(OUT/'failures.json').write_text(json.dumps(failed,indent=2));print('SENTINEL_COMPLETE failures='+str(failed),flush=True)
raise SystemExit(1 if failed else 0)
