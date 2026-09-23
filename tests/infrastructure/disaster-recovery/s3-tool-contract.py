#!/usr/bin/env python3
"""MOCK contract tests only. No S3 service, IAM, TLS or off-site DR is verified."""
import concurrent.futures,json,os,pathlib,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory(prefix='s3-contract-') as tmp:
    d=pathlib.Path(tmp); tool=d/'aws'
    tool.write_text('''#!/usr/bin/env python3
import json,os,pathlib,sys,time
args=sys.argv[1:];mode=os.environ['MOCK_MODE'];root=pathlib.Path(os.environ['MOCK_STORE'])
def val(flag):return args[args.index(flag)+1]
if val('--expected-bucket-owner')!='123456789012' or mode=='owner-denied':sys.exit(42)
key=val('--key');file=root/key
if mode=='timeout':time.sleep(3)
if args[1]=='put-object':
 file.parent.mkdir(exist_ok=True,parents=True);file.write_bytes(pathlib.Path(val('--body')).read_bytes())
 if mode=='partial':sys.exit(9)
 print(json.dumps({} if mode=='no-version' else {'VersionId':'v1'}))
else:
 body=file.read_bytes();pathlib.Path(args[-1]).write_bytes(b'corrupt' if mode=='corrupt' else body)
 print(json.dumps({'VersionId':'wrong' if mode=='wrong-version' else 'v1'}))
''');tool.chmod(0o700)
    bundle=d/'bundle';bundle.write_bytes(b'synthetic test bundle; NOT A REAL BACKUP')
    def invoke(mode,owner='123456789012'):
        e=os.environ|{'PATH':str(d)+':'+os.environ['PATH'],'MOCK_MODE':mode,'MOCK_STORE':str(d/'objects'),'BACKUP_S3_TIMEOUT':'1'}
        return subprocess.run(['python3',str(ROOT/'tools/backup-s3-publish.py'),str(bundle),'s3://mock-bucket/backup',owner],env=e,capture_output=True,text=True)
    for repeat in range(5):
        for mode in ['good','owner-denied','partial','no-version','wrong-version','corrupt','timeout']:
            r=invoke(mode);assert (r.returncode==0)==(mode=='good'),(mode,r.stdout,r.stderr)
            if mode=='good':assert json.loads(r.stdout)['readback_verified'] is True
            print('MOCK PASS',repeat,mode,'exit',r.returncode)
        assert invoke('good','bad-owner').returncode!=0
        # Concurrent readbacks cannot exchange bundle/version/temp identities.
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            rs=list(pool.map(invoke,['good']*4))
        keys=[json.loads(r.stdout)['key'] for r in rs if r.returncode==0]
        assert len(keys)==4 and len(set(keys))==4
        print('MOCK PASS',repeat,'concurrent unique object identities')
print('S3_TOOL_CONTRACT_PASS — MOCK ONLY; E4/S3 NOT VERIFIED')
