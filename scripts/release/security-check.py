"""Scan release files without reading the external API Key file or printing matches."""
from pathlib import Path
import subprocess, re, json, urllib.request, urllib.error
ROOT=Path(__file__).resolve().parents[2]
patterns=[re.compile(rb'sk-[A-Za-z0-9_-]{20,}'),re.compile(rb'gh[pousr]_[A-Za-z0-9]{20,}'),re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')]
files=[ROOT/p for p in subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0') if p]
files += [ROOT/p for p in subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0') if p]
files+=list((ROOT/'dist').rglob('*'))+list((ROOT/'submission').rglob('*'))
findings=[];scanned=0
for p in set(files):
 if p.is_file():
  data=p.read_bytes();scanned+=1
  if any(r.search(data) for r in patterns):findings.append(str(p.relative_to(ROOT)))
# Scan historical Git blobs without showing blob bytes or matching values.
objects=subprocess.check_output(['git','rev-list','--objects','--all'],cwd=ROOT).decode().splitlines()
historical=0
for row in objects:
 sha=row.split(' ',1)[0]
 if subprocess.check_output(['git','cat-file','-t',sha],cwd=ROOT).strip()!=b'blob':continue
 historical+=1;data=subprocess.check_output(['git','cat-file','blob',sha],cwd=ROOT)
 if any(r.search(data) for r in patterns):findings.append('history:'+sha)
base='https://official-doc-ai-proxy.neuromorphicscience.workers.dev'
origin='https://neuromorphicscience-sys.github.io'
checks=[]
def request(label,method,route,expect,body=None,origin_value=origin):
 headers={'Origin':origin_value,'Content-Type':'application/json','User-Agent':'Mozilla/5.0'}
 req=urllib.request.Request(base+route,method=method,headers=headers,data=None if body is None else body.encode())
 try:r=urllib.request.urlopen(req,timeout=30)
 except urllib.error.HTTPError as e:r=e
 status=r.code;data=r.read();h=dict(r.headers)
 checks.append({'label':label,'status':status,'expected':expect,'pass':status==expect,'noStore':h.get('Cache-Control') or h.get('cache-control'),'allowOrigin':h.get('Access-Control-Allow-Origin') or h.get('access-control-allow-origin')})
request('health','GET','/health',200)
request('CORS allow','OPTIONS','/v1/structure',204)
request('CORS deny','OPTIONS','/v1/structure',403,origin_value='https://untrusted.invalid')
request('POST only','GET','/v1/structure',404)
request('missing origin rejected','POST','/v1/structure',403,'{}',origin_value='')
request('invalid JSON','POST','/v1/structure',400,'{bad')
request('paragraph limit','POST','/v1/structure',413,json.dumps({'documentTypeHint':'auto','paragraphs':[{'id':i,'text':'test'} for i in range(1201)]}))
request('body limit','POST','/v1/structure',413,' '*2_000_001)
result={'filesScanned':scanned,'historicalBlobsScanned':historical,'secretFindings':findings,'externalKeyFileRead':False,'workerChecks':checks,'pass':not findings and all(x['pass'] for x in checks),'rateLimit':'Configured 10 per IP per 60s per Cloudflare location; not a strict global quota.'}
out=ROOT/'output'/'security';out.mkdir(parents=True,exist_ok=True);(out/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))
assert result['pass']
