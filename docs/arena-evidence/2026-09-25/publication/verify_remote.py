import urllib.request,json,pathlib,subprocess,gzip,os,datetime
ROOT=pathlib.Path('/home/user/arena-publication');REPO='/home/user/p2';token=pathlib.Path('/var/tmp/arena-publication-auth/token').read_text().strip()
plan=json.loads((ROOT/'PUSH_PLAN.json').read_text());sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()
request=urllib.request.Request('https://api.github.com/repos/rezaa2544/p2/git/trees/'+sha+'?recursive=1',headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','User-Agent':'Arena-publication-verification'})
with urllib.request.urlopen(request,timeout=60) as response:tree=json.load(response)
if tree.get('truncated'):raise RuntimeError('GitHub tree truncated; cannot confirm complete push')
remote={x['path']:(x['mode'],x['sha']) for x in tree['tree'] if x['type']!='tree'}
local={}
for item in subprocess.check_output(['git','ls-tree','-r','-z','HEAD'],cwd=REPO).split(b'\0'):
 if not item:continue
 meta,path=item.decode().split('\t',1);mode,typ,oid=meta.split();local[path]=(mode,oid)
missing=sorted(set(local)-set(remote));extra=sorted(set(remote)-set(local));mismatches=[p for p in local.keys() & remote.keys() if local[p]!=remote[p]]
manifest=json.loads((ROOT/'ARTIFACT_MANIFEST.json').read_text());artifact_mismatches=[x['repository_path'] for x in manifest['files'] if remote.get(x['repository_path'])!=(x['mode'],x['git_blob'])]
env=os.environ.copy();env.update(GIT_ASKPASS='/var/tmp/arena-publication-auth/askpass',GIT_TERMINAL_PROMPT='0')
heads=subprocess.check_output(['git','ls-remote','--heads','origin'],cwd=REPO,env=env,text=True);(ROOT/'remote-heads-verified.txt').write_text(heads)
refmap={line.split()[1].removeprefix('refs/heads/'):line.split()[0] for line in heads.splitlines()}
refchecks=[]
for x in plan['refs']:
 expected=sha if x['branch']=='arena8/workspace-publication-20260925' else x['sha'];actual=refmap.get(x['branch']);refchecks.append({'branch':x['branch'],'expected_sha':expected,'github_sha':actual,'match':expected==actual})
result={'verified_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'repository':'https://github.com/rezaa2544/p2','branch':'arena8/workspace-publication-20260925','verified_commit':sha,'github_tree_sha':tree['sha'],'github_tree_truncated':False,'local_tree_entries':len(local),'github_tree_entries':len(remote),'missing':missing,'extra':extra,'mismatched_blobs_or_modes':mismatches,'artifact_files':manifest['count'],'artifact_mismatches':artifact_mismatches,'ref_checks':refchecks,'main_sha_at_verification':refmap.get('main'),'scope':'GitHub REST immutable commit tree plus fresh git ls-remote; verifies publication bytes/modes, not test correctness or production readiness'}
result['complete_push_verified']=not(missing or extra or mismatches or artifact_mismatches) and all(x['match'] for x in refchecks)
(ROOT/'REMOTE_VERIFICATION.json').write_text(json.dumps(result,indent=2));
with gzip.open(ROOT/'github-tree.json.gz','wt') as f:json.dump(tree,f)
print(json.dumps(result,indent=2));raise SystemExit(0 if result['complete_push_verified'] else 1)
