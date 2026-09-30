"""Independent ZIP/OOXML check of synthetic release outputs; never opens personal files."""
from pathlib import Path
from zipfile import ZipFile
from lxml import etree
from posixpath import normpath,dirname,join
import hashlib,json
ROOT=Path(__file__).resolve().parents[2]
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
pairs=[]
for p in (ROOT/'output/release-docx').glob('*_规范版.docx'):
 pairs.append((ROOT/'demo/cases'/p.name.replace('_规范版',''),p))
for name,source in [('demo','demo/乱格式办公通知示例.docx'),('reload','output/production-e2e/demo_规范版.docx'),('A-uniform','demo/cases/01-uniform.docx'),('B-unnumbered','demo/cases/03-unnumbered.docx'),('C-attachments','demo/cases/04-attachments.docx')]:
 pairs.append((ROOT/source,ROOT/f'output/production-e2e/{name}_规范版.docx'))
recorded=ROOT/'output/video/recorded-output.docx'
if recorded.exists():pairs.append((ROOT/'demo/乱格式办公通知示例.docx',recorded))
results=[]
for source,out in pairs:
 with ZipFile(source) as a,ZipFile(out) as b:
  assert b.testzip() is None
  allxml=[n for n in b.namelist() if n.endswith(('.xml','.rels'))]
  for n in allxml:
   tree=etree.fromstring(b.read(n))
   if n.endswith('.rels'):
    base='' if n=='_rels/.rels' else dirname(dirname(n))
    for rel in tree:
     if rel.get('TargetMode')=='External':continue
     target=rel.get('Target');resolved=normpath(join(base,target)) if not target.startswith('/') else target[1:]
     assert resolved in b.namelist(),(n,resolved)
   if n=='[Content_Types].xml':
    for entry in tree:
     if entry.tag.endswith('Override'):assert entry.get('PartName')[1:] in b.namelist()
  x=etree.fromstring(a.read('word/document.xml'));y=etree.fromstring(b.read('word/document.xml'))
  tx=''.join(x.xpath('//w:t/text()',namespaces=NS));ty=''.join(y.xpath('//w:t/text()',namespaces=NS));assert tx==ty
  media=[n for n in a.namelist() if n.startswith('word/media/') and not n.endswith('/')]
  retained=[n for n in a.namelist() if n.startswith(('word/header','word/footer')) and n.endswith('.xml')]
  assert all(a.read(n)==b.read(n) for n in media+retained)
  tables=len(x.xpath('//w:tbl',namespaces=NS));assert tables==len(y.xpath('//w:tbl',namespaces=NS))
  results.append({'file':out.name,'source':source.name,'pass':True,'zipCRC':'PASS','xmlPartsValid':len(allxml),'relationships':'PASS','contentTypes':'PASS','textCharacters':len(tx),'beforeSHA256':hashlib.sha256(tx.encode()).hexdigest(),'afterSHA256':hashlib.sha256(ty.encode()).hexdigest(),'tablesPreserved':tables,'imagesByteIdentical':len(media),'originalHeaderFooterPartsByteIdentical':len(retained)})
p=ROOT/'output/docx-audit';p.mkdir(exist_ok=True);(p/'report.json').write_text(json.dumps({'pass':True,'method':'Independent Python zipfile + lxml; text hash uses concatenated w:t without paragraph separators','documents':results},ensure_ascii=False,indent=2))
print(json.dumps({'pass':True,'documents':len(results)},indent=2))
