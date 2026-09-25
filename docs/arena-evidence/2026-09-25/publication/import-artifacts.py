"""Publish artifact bytes without materializing a second large worktree copy."""
import pathlib,subprocess,hashlib,json,shutil,os
ROOT=pathlib.Path('/home/user');REPO=ROOT/'p2';META=ROOT/'arena-publication';TEMP=pathlib.Path('/var/tmp/arena-publication-artifacts');TEMP.mkdir(exist_ok=True)
PREFIX='docs/arena-evidence/2026-09-25';names=['arena8','arena8-dr','arena8-dr-closure','arena-sync','arena-sync-current','arena8-a37'];manifest=[]
def git(*args):return subprocess.check_output(['git',*args],cwd=REPO,text=True).strip()
subprocess.run(['git','add','-u'],cwd=REPO,check=True)
for name in names:
 src=ROOT/name;dst=TEMP/name
 if src.exists():
  if dst.exists():raise RuntimeError('Refusing to overwrite staged artifact source '+str(dst))
  shutil.move(str(src),str(dst))
 for p in sorted(dst.rglob('*')):
  if not p.is_file():continue
  if p.is_symlink():raise RuntimeError('Unexpected artifact symlink '+str(p))
  data=p.read_bytes();rel=pathlib.PurePosixPath(name)/p.relative_to(dst).as_posix();dest=PREFIX+'/'+str(rel)
  oid=git('hash-object','-w','--',str(p));mode='100755' if os.access(p,os.X_OK) else '100644'
  subprocess.run(['git','update-index','--add','--cacheinfo',mode+','+oid+','+dest],cwd=REPO,check=True)
  subprocess.run(['git','update-index','--skip-worktree','--',dest],cwd=REPO,check=True)
  manifest.append({'original_workspace_path':str(rel),'repository_path':dest,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'git_blob':oid,'mode':mode})
(META/'ARTIFACT_MANIFEST.json').write_text(json.dumps({'count':len(manifest),'prefix':PREFIX,'files':manifest},ensure_ascii=False,indent=2))
(META/'IMPORT_SUMMARY.json').write_text(json.dumps({'artifact_files':len(manifest),'original_bytes':sum(x['bytes'] for x in manifest),'source_base_sha':git('rev-parse','HEAD'),'branch':git('branch','--show-current'),'storage_policy':'artifact paths staged and skip-worktree; bulky source retained temporarily outside workspace until remote verification','existing_working_tree_changes':'Included faithfully in dedicated snapshot; executable-bit losses and missing monitoring symlink require review before any merge.'},indent=2))
print((META/'IMPORT_SUMMARY.json').read_text())
