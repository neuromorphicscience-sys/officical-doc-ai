"""Offline OOXML utilities. Python standard library only; no service dependency."""
import argparse, hashlib, json, math, re, sys, zlib
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, BadZipFile
from io import BytesIO
from xml.dom import minidom, Node
from posixpath import dirname, normpath, join
from urllib.parse import unquote

W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL='http://schemas.openxmlformats.org/package/2006/relationships'
CT='http://schemas.openxmlformats.org/package/2006/content-types'
ROOT=Path(__file__).resolve().parents[1]
RULES=json.loads((ROOT/'references/formatting-rules.json').read_text(encoding='utf-8'))
ROLES={'title','recipient','body','heading','attachment_note','attachment_marker','attachment_title','issuer','date','annotation','unknown'}
TYPES={'通知','请示','报告','函','会议纪要','工作总结','规章制度','其他'}
class Failure(Exception):
    def __init__(self,code,message,details=None): self.code=code;self.message=message;self.details=details

def fail(code,message,details=None): raise Failure(code,message,details)
def main(fn):
    try: print(json.dumps(fn(),ensure_ascii=False,indent=2))
    except Failure as e:
        print(json.dumps({'ok':False,'errorCode':e.code,'message':e.message,'details':e.details},ensure_ascii=False),file=sys.stderr);sys.exit(e.code)
    except (OSError,ValueError,KeyError,TypeError) as e:
        print(json.dumps({'ok':False,'errorCode':40,'message':str(e)},ensure_ascii=False),file=sys.stderr);sys.exit(40)
def read_json(path):
    try: return json.loads(Path(path).read_text(encoding='utf-8-sig'))
    except (ValueError,UnicodeError) as e: fail(20,'JSON 无效：'+str(e))
def write_new(path,data):
    p=Path(path)
    if p.exists(): fail(40,'输出路径已存在，请选择新文件名。',str(p))
    p.parent.mkdir(parents=True,exist_ok=True)
    created=False
    try:
        with p.open('xb') as f: created=True;f.write(data)
    except OSError:
        if created: p.unlink(missing_ok=True)
        raise
    return str(p.resolve())
def json_bytes(data): return (json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
def parse(data):
    if b'<!doctype' in data.replace(b'\0',b'').lower() or b'<!entity' in data.replace(b'\0',b'').lower(): fail(11,'不接受含 DTD/实体声明的 XML。')
    try: return minidom.parseString(data)
    except Exception as e: fail(11,'DOCX XML 无效：'+str(e))
def xml(doc): return doc.toxml(encoding='utf-8')
def elements(parent,name,ns=W): return list(parent.getElementsByTagNameNS(ns,name))
def children(parent,name=None,ns=W):
    return [c for c in parent.childNodes if c.nodeType==Node.ELEMENT_NODE and c.namespaceURI==ns and (name is None or c.localName==name)]
def child(parent,name): return next(iter(children(parent,name)),None)
def node(doc,name): return doc.createElementNS(W,'w:'+name)
def ensure(parent,name,first=False):
    found=child(parent,name)
    if found is not None:return found
    n=node(parent.ownerDocument,name)
    if first and parent.firstChild:parent.insertBefore(n,parent.firstChild)
    else:parent.appendChild(n)
    return n
def attr(n,key,value=None):
    if n is None:return ''
    if value is None:return n.getAttributeNS(W,key) or n.getAttribute('w:'+key)
    if n.hasAttributeNS(W,key):n.removeAttributeNS(W,key)
    n.setAttributeNS(W,'w:'+key,str(value))
def remove_attr(n,key):
    if n.hasAttributeNS(W,key):n.removeAttributeNS(W,key)
def remove(n): n.parentNode.removeChild(n)
def text_node(n):return ''.join(c.data if c.nodeType in (Node.TEXT_NODE,Node.CDATA_SECTION_NODE) else text_node(c) for c in n.childNodes)
def paragraph_text(p):
    def walk(n):
        if n.nodeType!=Node.ELEMENT_NODE:return ''
        if n.localName=='t':return text_node(n)
        if n.localName=='tab':return '\t'
        if n.localName in ('br','cr'):return '\n'
        return ''.join(walk(c) for c in n.childNodes)
    return ''.join(walk(c) for c in p.childNodes)
def paragraph_texts(doc):return [paragraph_text(p) for p in elements(doc,'p')]
def semantic_text(doc):return '\n'.join(paragraph_texts(doc)).replace('\r\n','\n').replace('\r','\n')
def digest(data):return hashlib.sha256(data).hexdigest()
def text_hash(doc):return digest(semantic_text(doc).encode('utf-8'))
def utf16_length(text):return len(text.encode('utf-16-le'))//2

def load(path):
    p=Path(path)
    if p.suffix.lower()!='.docx':fail(10,'仅支持 .docx。')
    if not p.exists():fail(10,'输入文件不存在。')
    if not 0<p.stat().st_size<=50*1024*1024:fail(12,'文件为空或超过 50 MB。')
    try:
        with ZipFile(p) as z:
            names=z.namelist()
            if len(names)!=len(set(names)):fail(11,'DOCX 包含重复 ZIP 成员。')
            if len(names)>10000 or sum(i.file_size for i in z.infolist())>200*1024*1024:fail(12,'解压大小超过 200 MB 或成员过多。')
            for n in names:
                if n.startswith('/') or '\\' in n or '..' in PurePosixPath(n).parts:fail(11,'DOCX 包含不安全的部件路径。')
            if any(n.lower().startswith('_xmlsignatures/') or n.lower().endswith('vbaproject.bin') for n in names):fail(13,'不支持修改含宏或数字签名的包。')
            infos=z.infolist();parts={i.filename:z.read(i) for i in infos}
    except (BadZipFile,RuntimeError,EOFError,zlib.error,NotImplementedError) as e:fail(10,'DOCX 已损坏、被加密或使用不支持的压缩格式，请在 Word 中重新另存。',str(e))
    for required in ('[Content_Types].xml','_rels/.rels','word/document.xml'):
        if required not in parts:fail(11,'DOCX 缺少 '+required)
    doc=parse(parts['word/document.xml'])
    if doc.documentElement.namespaceURI!=W or doc.documentElement.localName!='document':fail(11,'DOCX 主体无效。')
    if not semantic_text(doc).strip():fail(10,'文档没有可识别正文。')
    validate_package(parts)
    return parts,infos,doc

def resolve_part(base,target):
    path=unquote(target.split('#',1)[0])
    if not path:return base
    result=normpath(join(dirname(base),path)) if not path.startswith('/') else path[1:]
    if result.startswith('../') or ':' in result or '\\' in result:fail(11,'关系指向非法部件路径。')
    return result

def validate_package(parts):
    xmlcount=0
    for name,data in parts.items():
        if not name.endswith(('.xml','.rels')):continue
        tree=parse(data);xmlcount+=1
        if name.endswith('.rels'):
            base='' if name=='_rels/.rels' else name.replace('/_rels/','/').removesuffix('.rels')
            ids=set()
            for r in elements(tree,'Relationship',REL):
                rid=r.getAttribute('Id')
                if not rid or rid in ids:fail(11,'重复或缺失关系 ID。',name)
                ids.add(rid)
                if r.getAttribute('TargetMode')!='External' and resolve_part(base,r.getAttribute('Target')) not in parts:fail(11,'关系目标缺失。',name)
        if name=='[Content_Types].xml':
            for n in elements(tree,'Override',CT):
                if n.getAttribute('PartName').lstrip('/') not in parts:fail(11,'Content Types 引用缺失部件。')
    return xmlcount

def estimate(doc):
    lines=sum(max(1,math.ceil(sum(1 if ord(c)>255 else .5 for c in t)/28)) for t in paragraph_texts(doc))
    return max(1,math.ceil(lines/22))
def inside(n,name):
    p=n.parentNode
    while p:
        if getattr(p,'namespaceURI',None)==W and getattr(p,'localName',None)==name:return True
        p=p.parentNode
    return False

def inspect(path):
    parts,infos,doc=load(path);paragraphs=[]
    for i,p in enumerate(elements(doc,'p')):
        pr=child(p,'pPr');runs=children(p,'r');sizes=[];fonts=[]
        for r in runs:
            rp=child(r,'rPr')
            if rp is not None:
                sz=attr(child(rp,'sz'),'val')
                if sz.isdigit():sizes.append(int(sz)/2)
                font=attr(child(rp,'rFonts'),'eastAsia')
                if font:fonts.append(font)
        paragraphs.append({'id':i,'text':paragraph_text(p),'features':{'styleId':attr(child(pr,'pStyle'),'val') if pr else '', 'alignment':attr(child(pr,'jc'),'val') if pr else '', 'inTable':inside(p,'tbl'),'inTextBox':inside(p,'txbxContent'),'fontSizePt':sum(sizes)/len(sizes) if sizes else None,'eastAsiaFont':fonts[0] if fonts else None}})
    return {'ok':True,'fileName':Path(path).name,'inputSHA256':digest(Path(path).read_bytes()),'textSHA256':text_hash(doc),'characters':utf16_length(semantic_text(doc)),'estimatedPages':estimate(doc),'paragraphs':paragraphs,'tables':len(elements(doc,'tbl')),'images':len([n for n in parts if n.startswith('word/media/') and not n.endswith('/')]),'warnings':['页数为估算；最终分页及字体以目标办公环境为准。']+(['复杂对象只保留，不承诺内部智能重排。'] if any(elements(doc,n) for n in ['txbxContent','ins','del','object']) else [])}

def explicit_level(text):
    t=text.strip()
    for level,pattern in [(1,r'^[一二三四五六七八九十百]+、'),(2,r'^（[一二三四五六七八九十百]+）'),(3,r'^[0-9]+[.．]'),(4,r'^（[0-9]+）')]:
        if re.match(pattern,t):return level
    return None

def check_ast(ast,doc,input_hash,reviewed=False):
    def confidence(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x) and 0<=x<=1
    if not isinstance(ast,dict) or ast.get('documentType') not in TYPES or not confidence(ast.get('confidence')):fail(20,'AST 的文种或置信度无效。')
    if ast.get('inputSHA256')!=input_hash:fail(30,'AST 不对应当前输入文件，请重新 inspect。')
    if ast.get('source') not in ['host-agent','deepseek','demo']:fail(20,'AST 缺少合法来源标记。')
    if not isinstance(ast.get('blocks'),list):fail(20,'AST blocks 必须是数组。')
    if set(ast)-{'documentType','confidence','blocks','source','inputSHA256','model','requestId','demoReason','warnings','suggestions'}:fail(20,'AST 含协议外字段；不接受自定义排版参数。')
    if not isinstance(ast.get('warnings',[]),list) or any(not isinstance(w,str) for w in ast.get('warnings',[])):fail(20,'warnings 必须是字符串数组。')
    for key in ['model','requestId','demoReason']:
        if key in ast and not isinstance(ast[key],str):fail(20,key+' 必须为字符串。')
    texts=paragraph_texts(doc);blocks={};warnings=list(ast.get('warnings',[]))
    for b in ast['blocks']:
        if not isinstance(b,dict) or set(b)-{'id','role','level','confidence','rationale','parentId','suggestedNumber'}:fail(20,'段落 AST 字段无效；不得提供字体、字号或替换文字。')
        i=b.get('id');role=b.get('role')
        if type(i)!=int or not 0<=i<len(texts) or i in blocks or role not in ROLES:fail(20,'段落 ID 重复/越界或角色无效。')
        if role=='heading' and (type(b.get('level'))!=int or b['level'] not in [1,2,3,4]):fail(20,'标题层级必须为 1–4。')
        if role!='heading' and 'level' in b:fail(20,'非标题段落不能带 level。')
        if 'confidence' in b and not confidence(b['confidence']):fail(20,'段落置信度无效。')
        if b.get('parentId') is not None and (type(b['parentId'])!=int or not 0<=b['parentId']<len(texts) or b['parentId']==i):fail(20,'parentId 无效。')
        if 'rationale' in b and not isinstance(b['rationale'],str):fail(20,'rationale 必须为字符串。')
        if b.get('suggestedNumber') is not None and not isinstance(b['suggestedNumber'],str):fail(20,'suggestedNumber 必须为字符串或 null。')
        if role=='unknown':fail(21,'存在待确认角色，请先由宿主 Agent 核对结构。',i)
        if b.get('confidence',1)<.65:warnings.append('段落 '+str(i)+' 置信度低于 65%。')
        level=explicit_level(texts[i])
        if level and (role!='heading' or b.get('level')!=level):fail(21,'语义角色与显式编号冲突，请先修正。',i)
        blocks[i]=b
    suggestions=ast.get('suggestions',[])
    if not isinstance(suggestions,list):fail(20,'suggestions 必须是数组。')
    for sg in suggestions:
        if not isinstance(sg,dict) or set(sg)-{'paragraphId','type','reason','proposedText'} or type(sg.get('paragraphId'))!=int or sg['paragraphId'] not in blocks or sg.get('type') not in ['missing_heading_number','text_normalization','review'] or not isinstance(sg.get('reason'),str) or ('proposedText' in sg and not isinstance(sg['proposedText'],str)):fail(20,'suggestions 格式无效。')
    if any(t.strip() and i not in blocks for i,t in enumerate(texts)):fail(20,'AST 未覆盖全部非空段落。')
    if ast['confidence']<.65:warnings.append('文种置信度低于 65%。')
    if sum(b['role']=='title' for b in blocks.values())!=1:warnings.append('主标题不是唯一段落，请核对。')
    if warnings and not reviewed:fail(21,'需要核对；确认已核对后可传 --reviewed。',warnings)
    return blocks,warnings

def content_tree(n):
    if n.nodeType in (Node.TEXT_NODE,Node.CDATA_SECTION_NODE):return n.data if n.data.strip() else None
    if n.nodeType!=Node.ELEMENT_NODE:return None
    if n.namespaceURI==W and n.localName in ['pPr','rPr','sectPr']:return None
    attrs=sorted((a.namespaceURI or '',a.localName or a.name,a.value) for a in n.attributes.values() if a.namespaceURI!='http://www.w3.org/2000/xmlns/' and a.name!='xmlns')
    kids=[content_tree(c) for c in n.childNodes];return (n.namespaceURI,n.localName,attrs,[x for x in kids if x is not None])

def compare(original,output,parts_before=None,parts_after=None):
    a,_,ad=load(original) if parts_before is None else parts_before
    b,_,bd=load(output) if parts_after is None else parts_after
    if paragraph_texts(ad)!=paragraph_texts(bd):fail(30,'正文段落或字符发生变化。')
    protected=[n for n in a if n.startswith(('word/media/','word/header','word/footer','word/embeddings/'))]
    for name in protected:
        if a[name]!=b.get(name):fail(30,'原始媒体或页眉页脚部件发生变化。',name)
    if content_tree(ad.documentElement)!=content_tree(bd.documentElement):fail(30,'格式属性之外的文档结构、图形引用或内容发生变化。')
    if len(elements(ad,'tbl'))!=len(elements(bd,'tbl')):fail(30,'表格数量发生变化。')
    if set(a)-set(b):fail(30,'原始包部件丢失。')
    allowed={'word/document.xml','word/_rels/document.xml.rels','word/settings.xml','[Content_Types].xml'}
    for name in set(a)-allowed:
        if a[name]!=b[name]:fail(30,'格式化修改了不允许修改的原始部件。',name)
    count=validate_package(b)
    return {'ok':True,'contentPreserved':True,'beforeSHA256':text_hash(ad),'afterSHA256':text_hash(bd),'originalCharacters':utf16_length(semantic_text(ad)),'outputCharacters':utf16_length(semantic_text(bd)),'addedCharacters':0,'deletedCharacters':0,'modifiedCharacters':0,'xmlPartsValid':count,'contentStructurePreserved':True,'tablesPreserved':len(elements(ad,'tbl')),'protectedPartsByteIdentical':len(protected),'packagePartsPreserved':len(a)}
