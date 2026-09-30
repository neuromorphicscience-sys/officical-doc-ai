"""Freeze the current clean, deployed HEAD into an ignored manifest and submission ZIP."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import subprocess,json,urllib.request,re,hashlib,datetime
ROOT=Path(__file__).resolve().parents[2];SOFTWARE='cd1f55e29964a7f5855b2eec9f8dd72d3a03ebea'
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT).decode().strip()
assert not git('status','--porcelain'),'Commit reviewed release materials first'
sha=git('rev-parse','HEAD');assert git('rev-parse','origin/main')==sha
assert not git('diff',SOFTWARE,sha,'--','src','public','worker','index.html','package.json','package-lock.json','vite.config.ts'),'Runtime changed after software acceptance'
def get(url):
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30)
api='https://api.github.com/repos/neuromorphicscience-sys/officical-doc-ai/actions/runs?head_sha='+sha
runs=json.load(get(api))['workflow_runs'];selected=[]
for name in ['CI','Deploy GitHub Pages']:
 r=next(x for x in runs if x['name']==name)
 assert r['status']=='completed' and r['conclusion']=='success',(name,r['status'],r['conclusion'])
 selected.append({k:r[k] for k in ['name','head_sha','status','conclusion','html_url']})
url='https://neuromorphicscience-sys.github.io/officical-doc-ai/'
html=get(url).read().decode();assets=[]
for asset in re.findall(r'(?:src|href)="(/officical-doc-ai/assets/[^\"]+)"',html):
 remote=get('https://neuromorphicscience-sys.github.io'+asset).read();local=(ROOT/'dist/assets'/Path(asset).name).read_bytes();assert remote==local,asset
 assets.append({'path':asset,'sha256':hashlib.sha256(remote).hexdigest(),'matchesAcceptedLocalBuild':True})
assert len(assets)>=2
health=get('https://official-doc-ai-proxy.neuromorphicscience.workers.dev/health');assert health.status==200
video=json.loads((ROOT/'submission/VIDEO_VALIDATION.json').read_text());assert video['pass'] and video.get('visualQC',{}).get('status')=='PASS'
manifest={'finalStatus':'READY_FOR_SUBMISSION','finalCommitSHA':sha,'acceptedSoftwareCommitSHA':SOFTWARE,'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'workflows':selected,'production':url,'workerHealth':health.status,'productionAssets':assets,'gitStatus':'clean','remoteMainMatches':True,'materialsOnlySinceSoftwareAcceptance':True,'video':video,'notCommitted':'Final MP4 and this generated manifest are deliberately ignored; included in ZIP.'}
(ROOT/'submission/RELEASE_MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
archive=ROOT.parent/'official-doc-ai-final-submission.zip'
files=[]
for directory in ['submission','demo','docs']:
 files.extend(p for p in (ROOT/directory).rglob('*') if p.is_file())
files.extend(ROOT/name for name in ['README.md','PROJECT_STATUS.md','LICENSE'] if (ROOT/name).exists())
for p in files:
 assert not any(x in p.parts for x in ['node_modules','.git','dist','output','__pycache__'])
 assert not p.name.startswith(('API Key','.env','.dev.vars','~$'))
 assert p.suffix.lower() not in ['.ttf','.otf','.ttc','.webm','.log']
with ZipFile(archive,'w',ZIP_DEFLATED,compresslevel=6) as z:
 for p in sorted(files):z.write(p,p.relative_to(ROOT))
with ZipFile(archive) as z:
 assert z.testzip() is None
 for name in ['submission/office-doc-ai-demo.mp4','submission/office-doc-ai-demo.srt','submission/FINAL_ACCEPTANCE_REPORT.md','submission/RELEASE_MANIFEST.json','demo/乱格式办公通知示例.docx']:assert name in z.namelist()
 digest=hashlib.sha256(z.read('submission/office-doc-ai-demo.mp4')).hexdigest();assert digest==video['sha256']
ziphash=hashlib.sha256(archive.read_bytes()).hexdigest();archive.with_suffix('.zip.sha256').write_text(ziphash+'  '+archive.name+'\n')
print(json.dumps({'finalCommit':sha,'CI':'PASS','Pages':'PASS','productionAssetsMatch':True,'gitStatus':'clean','zip':str(archive),'files':len(files),'sizeBytes':archive.stat().st_size,'sha256':ziphash},ensure_ascii=False,indent=2))
