"""Executable offline Skill tests; generated files never enter the Skill bundle."""
import copy,hashlib,json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
ROOT=Path(__file__).resolve().parents[1]
SKILL=ROOT/'skill/official-docx-formatter'
SCRIPTS=SKILL/'scripts'
# -S prevents site packages. Deny all socket creation to prove no network dependency.
GUARD="import socket,sys,runpy; from pathlib import Path; socket.socket=lambda *a,**k: (_ for _ in ()).throw(RuntimeError('Network forbidden in Skill test')); socket.create_connection=socket.socket; sys.argv=sys.argv[1:]; sys.path.insert(0,str(Path(sys.argv[0]).parent)); runpy.run_path(sys.argv[0],run_name='__main__')"
CASES=['demo','01-uniform','02-numbering','03-unnumbered','04-attachments','05-long','06-letter','07-table','08-image']
RESULTS=[]
def execute(script,*args,code=0):
 p=subprocess.run([sys.executable,'-S','-B','-c',GUARD,str(SCRIPTS/script),*[str(a) for a in args]],capture_output=True,text=True,encoding='utf-8',cwd=ROOT)
 if p.returncode!=code:raise AssertionError(f'{script}: expected {code}, got {p.returncode}: {p.stderr}')
 return json.loads(p.stdout if code==0 else p.stderr)
def change_zip(source,dest,mutate):
 with ZipFile(source) as z:parts={n:z.read(n) for n in z.namelist()}
 mutate(parts)
 with ZipFile(dest,'w',ZIP_DEFLATED) as z:
  for n,b in parts.items():z.writestr(n,b)
class SkillExecution(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='official-docx-skill-');self.d=Path(self.tmp.name)
  self.source=ROOT/'demo/乱格式办公通知示例.docx';self.ast=json.loads((ROOT/'tests/skill-asts/demo.json').read_text())
 def tearDown(self):self.tmp.cleanup()
 def ast_file(self,ast=None):
  p=self.d/'structure.json';p.write_text(json.dumps(ast if ast is not None else self.ast,ensure_ascii=False));return p
 def test_01_full_offline_pipeline_all_valid_samples(self):
  for name in CASES:
   with self.subTest(name=name):
    src=self.source if name=='demo' else ROOT/f'demo/cases/{name}.docx';orig=src.read_bytes();out=self.d/(name+'.docx')
    inspection=execute('inspect_docx.py',src)
    ast=json.loads((ROOT/f'tests/skill-asts/{name}.json').read_text());self.assertEqual(inspection['inputSHA256'],ast['inputSHA256'])
    result=execute('format_docx.py',src,'--ast',ROOT/f'tests/skill-asts/{name}.json','--out',out)
    valid=execute('validate_docx.py',src,out);reopened=execute('inspect_docx.py',out)
    self.assertEqual(orig,src.read_bytes());self.assertEqual(inspection['textSHA256'],reopened['textSHA256']);self.assertTrue(valid['contentStructurePreserved'])
    self.assertEqual(inspection['tables'],reopened['tables']);self.assertEqual(inspection['images'],reopened['images']);self.assertEqual(valid['addedCharacters']+valid['deletedCharacters']+valid['modifiedCharacters'],0)
    RESULTS.append({'case':name,'inspect':'PASS','hostAST':'reviewed host annotations; no model/service request','format':'PASS','validate':'PASS','reopen':'PASS','network':'socket creation denied','standardLibraryOnly':True,'characters':valid['outputCharacters'],'textSHA256':valid['afterSHA256'],'tables':reopened['tables'],'images':reopened['images'],'protectedParts':valid['protectedPartsByteIdentical']})
 def test_02_corrupt(self):
  execute('inspect_docx.py',ROOT/'demo/cases/10-corrupt.docx',code=10)
  # Unsupported ZIP compression must produce the documented error, not a traceback.
  import struct
  raw=bytearray(self.source.read_bytes())
  for marker,offset in [(b'PK\x03\x04',8),(b'PK\x01\x02',10)]:
   start=0
   while (position:=raw.find(marker,start))!=-1:
    struct.pack_into('<H',raw,position+offset,99);start=position+4
  unsupported=self.d/'unsupported.docx';unsupported.write_bytes(raw)
  execute('inspect_docx.py',unsupported,code=10)
 def test_03_unknown_cannot_be_bypassed(self):
  execute('format_docx.py',ROOT/'demo/cases/09-ambiguous.docx','--ast',ROOT/'tests/skill-asts/09-ambiguous.json','--out',self.d/'out.docx','--reviewed',code=21)
  self.assertFalse((self.d/'out.docx').exists())
 def test_04_low_confidence_requires_review(self):
  self.ast['blocks'][2]['confidence']=.3;ast=self.ast_file();out=self.d/'out.docx'
  execute('format_docx.py',self.source,'--ast',ast,'--out',out,code=21);self.assertFalse(out.exists())
  execute('format_docx.py',self.source,'--ast',ast,'--out',out,'--reviewed');execute('validate_docx.py',self.source,out)
 def test_05_numbering_conflict(self):
  self.ast['blocks'][3]['level']=2
  execute('format_docx.py',self.source,'--ast',self.ast_file(),'--out',self.d/'out.docx','--reviewed',code=21)
 def test_06_stale_input(self):
  self.ast['inputSHA256']='0'*64
  execute('format_docx.py',self.source,'--ast',self.ast_file(),'--out',self.d/'out.docx',code=30)
 def test_07_no_overwrite(self):
  before=self.source.read_bytes();execute('format_docx.py',self.source,'--ast',self.ast_file(),'--out',self.source,code=40);self.assertEqual(before,self.source.read_bytes())
  out=self.d/'exists.docx';out.write_bytes(b'existing');execute('format_docx.py',self.source,'--ast',self.ast_file(),'--out',out,code=40);self.assertEqual(out.read_bytes(),b'existing')
 def test_08_no_model_format_parameters(self):
  self.ast['blocks'][0]['fontSize']=80
  execute('format_docx.py',self.source,'--ast',self.ast_file(),'--out',self.d/'out.docx',code=20)
  del self.ast['blocks'][0]['fontSize'];self.ast['blocks'][0]['rationale']=None
  execute('format_docx.py',self.source,'--ast',self.ast_file(),'--out',self.d/'out.docx',code=20)
 def test_09_missing_and_duplicate_blocks(self):
  for blocks in [self.ast['blocks'][1:],self.ast['blocks']+[self.ast['blocks'][0]]]:
   ast={**self.ast,'blocks':blocks};execute('format_docx.py',self.source,'--ast',self.ast_file(ast),'--out',self.d/'out.docx',code=20)
 def test_10_text_tamper(self):
  dest=self.d/'changed.docx';change_zip(self.source,dest,lambda p:p.update({'word/document.xml':p['word/document.xml'].replace('各学院'.encode(),'另一学院'.encode())}))
  execute('validate_docx.py',self.source,dest,code=30)
 def test_11_image_tamper(self):
  source=ROOT/'demo/cases/08-image.docx';dest=self.d/'changed.docx'
  def alter(p):
   name=next(n for n in p if n.startswith('word/media/'));p[name]=b'changed-image'
  change_zip(source,dest,alter);execute('validate_docx.py',source,dest,code=30)
 def test_12_dtd_rejected(self):
  dest=self.d/'dtd.docx'
  change_zip(self.source,dest,lambda p:p.update({'word/document.xml':p['word/document.xml'].replace(b'<w:document',b'<!DOCTYPE x [<!ENTITY a "x">]><w:document',1)}))
  execute('inspect_docx.py',dest,code=11)
 def test_13_missing_package_part(self):
  dest=self.d/'missing.docx';change_zip(self.source,dest,lambda p:p.pop('word/document.xml'));execute('inspect_docx.py',dest,code=11)
 def test_14_signed_document_rejected(self):
  dest=self.d/'signed.docx';change_zip(self.source,dest,lambda p:p.update({'_xmlsignatures/sig1.xml':b'<x/>'}));execute('inspect_docx.py',dest,code=13)
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(SkillExecution))
 out=ROOT/'output/skill';out.mkdir(parents=True,exist_ok=True)
 (out/'execution-tests.json').write_text(json.dumps({'pass':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'cases':RESULTS},ensure_ascii=False,indent=2))
 sys.exit(0 if result.wasSuccessful() else 1)
