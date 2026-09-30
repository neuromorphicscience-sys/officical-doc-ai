"""Deterministic port of the accepted Web formatter; rules are bundled JSON."""
from common import *
from copy import deepcopy

STD=RULES['standard']
def twips(mm):return int(mm/25.4*1440+.5)
def typography(role,level=1):
    if role=='title':return STD['title']
    if role=='heading':return STD['heading'+str(level)]
    if role=='attachment_marker':return STD['heading1']
    return {**STD['body'],'bold':False}

def apply_block(p,b):
    role=b['role'];typ=typography(role,b.get('level',1));layout=RULES['layouts'][role];base=STD['page']['lineSpacingPt']
    for r in elements(p,'r'):
        pr=ensure(r,'rPr',True);font=ensure(pr,'rFonts')
        for key in ['asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme']:remove_attr(font,key)
        for key in ['ascii','hAnsi','cs']:attr(font,key,typ['latinFont'])
        attr(font,'eastAsia',typ['eastAsiaFont'])
        for key in ['sz','szCs']:attr(ensure(pr,key),'val',round(typ['sizePt']*2))
        attr(ensure(pr,'color'),'val','000000')
        for key in ['b','bCs']:attr(ensure(pr,key),'val',1 if typ.get('bold') else 0)
    pp=ensure(p,'pPr',True);attr(ensure(pp,'jc'),'val',layout['alignment']);ind=ensure(pp,'ind')
    for key in ['firstLine','firstLineChars','hanging','hangingChars','left','leftChars','right','rightChars']:remove_attr(ind,key)
    for key in ['firstLine','left','right']:
        chars=layout.get(key+'Chars',0);attr(ind,key,chars*STD['body']['sizePt']*20);attr(ind,key+'Chars',chars*100)
    spacing=ensure(pp,'spacing')
    for key,value in [('before',round(layout.get('beforeLines',0)*base*20)),('after',0),('line',round(base*20)),('lineRule','exact')]:attr(spacing,key,value)
    for key in ['pageBreakBefore','keepNext']:
        if layout.get(key):ensure(pp,key)
        elif child(pp,key) is not None:remove(child(pp,key))

def page_setup(doc):
    secs=elements(doc,'sectPr')
    if not secs:
        body=elements(doc,'body')
        if len(body)!=1:fail(11,'没有有效文档 body。')
        secs=[ensure(body[0],'sectPr')]
    doc.documentElement.setAttribute('xmlns:w',W)
    cfg=STD['page']
    for sec in secs:
        size=ensure(sec,'pgSz');attr(size,'w',twips(cfg['widthMm']));attr(size,'h',twips(cfg['heightMm']))
        # A4 portrait is the accepted page setup; remove contradictory landscape flag.
        remove_attr(size,'orient')
        mar=ensure(sec,'pgMar')
        for key in ['top','bottom','left','right']:attr(mar,key,twips(cfg['margin'+key.capitalize()+'Mm']))
        grid=ensure(sec,'docGrid');attr(grid,'type','lines');attr(grid,'linePitch',round(cfg['lineSpacingPt']*20))

def remove_page_fields(doc):
    for f in elements(doc,'fldSimple'):
        if re.search(r'\bPAGE\b',attr(f,'instr'),re.I):remove(f)
    for p in elements(doc,'p'):
        start=None;ispage=False;runs=children(p)
        for i,r in enumerate(runs):
            if r.localName!='r':continue
            fields=elements(r,'fldChar')
            if any(attr(f,'fldCharType')=='begin' for f in fields):start=i;ispage=False
            if start is not None and any(re.search(r'\bPAGE\b',text_node(t),re.I) for t in elements(r,'instrText')):ispage=True
            if start is not None and any(attr(f,'fldCharType')=='end' for f in fields):
                if ispage:
                    for n in runs[start:i+1]:remove(n)
                start=None;ispage=False

def number_run(doc,p,content,field=False):
    r=node(doc,'r');pr=ensure(r,'rPr');f=ensure(pr,'rFonts')
    for key in ['ascii','hAnsi','cs']:attr(f,key,STD['pageNumber']['latinFont'])
    attr(f,'eastAsia',STD['pageNumber']['eastAsiaFont'])
    for key in ['sz','szCs']:attr(ensure(pr,key),'val',STD['pageNumber']['sizePt']*2)
    t=node(doc,'t');t.appendChild(doc.createTextNode(content))
    if content.startswith(' ') or content.endswith(' '):t.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve')
    r.appendChild(t)
    if field:
        fld=node(doc,'fldSimple');attr(fld,'instr','PAGE');fld.appendChild(r);p.appendChild(fld)
    else:p.appendChild(r)

def page_numbers(parts,doc,kind,enabled):
    if not enabled:return
    if 'word/_rels/document.xml.rels' not in parts:fail(11,'缺少主体关系，不能安全生成页码。')
    rels=parse(parts['word/_rels/document.xml.rels']);ct=parse(parts['[Content_Types].xml'])
    settings=parse(parts.get('word/settings.xml',f'<w:settings xmlns:w="{W}"/>'.encode()))
    rels.documentElement.setAttribute('xmlns',REL);ct.documentElement.setAttribute('xmlns',CT);settings.documentElement.setAttribute('xmlns:w',W)
    empty=f'<w:ftr xmlns:w="{W}" xmlns:r="{R}"><w:p/></w:ftr>'.encode()
    def reference(sec,type):return next((n for n in children(sec,'footerReference') if attr(n,'type')==type),None)
    def source(sec,type):
        ref=reference(sec,type)
        if ref is None:return None
        rid=ref.getAttributeNS(R,'id');rel=next((r for r in elements(rels,'Relationship',REL) if r.getAttribute('Id')==rid),None)
        if rel is None or rel.getAttribute('TargetMode')=='External' or rel.getAttribute('Type')!=R+'/footer':fail(11,'页脚关系无效。')
        path=resolve_part('word/document.xml',rel.getAttribute('Target'))
        if path not in parts:fail(11,'页脚部件缺失。')
        return path
    def add(source_path,type,align,index):
        footer=parse(parts[source_path] if source_path else empty);footer.documentElement.setAttribute('xmlns:w',W);remove_page_fields(footer)
        if type!='First':
            p=node(footer,'p');pr=ensure(p,'pPr');attr(ensure(pr,'jc'),'val',align);attr(ensure(pr,'ind'),align+'Chars',100)
            for content,field in [('— ',False),('1',True),(' —',False)]:number_run(footer,p,content,field)
            footer.documentElement.appendChild(p)
        name=f'footerOfficial{type}-skill-s{index+1}.xml';suffix=1
        while 'word/'+name in parts:name=f'footerOfficial{type}-skill-s{index+1}-{suffix}.xml';suffix+=1
        parts['word/'+name]=xml(footer)
        if source_path:
            old_rel=dirname(source_path)+'/_rels/'+PurePosixPath(source_path).name+'.rels'
            if old_rel in parts:
                # Rebase relationships when the source footer lives outside word/.
                clone=parse(parts[old_rel])
                for rel in elements(clone,'Relationship',REL):
                    if rel.getAttribute('TargetMode')!='External':rel.setAttribute('Target','/'+resolve_part(source_path,rel.getAttribute('Target')))
                parts['word/_rels/'+name+'.rels']=xml(clone)
        used={r.getAttribute('Id') for r in elements(rels,'Relationship',REL)};i=1
        while 'rId'+str(i) in used:i+=1
        rid='rId'+str(i);r=rels.createElementNS(REL,'Relationship');r.setAttribute('Id',rid);r.setAttribute('Type',R+'/footer');r.setAttribute('Target',name);rels.documentElement.appendChild(r)
        override=ct.createElementNS(CT,'Override');override.setAttribute('PartName','/word/'+name);override.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml');ct.documentElement.appendChild(override)
        return rid
    def set_ref(sec,type,rid):
        old=reference(sec,type)
        if old is not None:remove(old)
        ref=node(doc,'footerReference');attr(ref,'type',type);ref.setAttributeNS(R,'r:id',rid)
        # Use a local declaration if the source used another namespace prefix.
        ref.setAttribute('xmlns:r',R)
        before=next((n for n in children(sec) if n.localName not in ['headerReference','footerReference']),None)
        sec.insertBefore(ref,before)
    inherited_default=None;inherited_even=None
    for index,sec in enumerate(elements(doc,'sectPr')):
        d=source(sec,'default');e=source(sec,'even')
        if d:inherited_default=d
        if e:inherited_even=e
        d=d or inherited_default;e=e or inherited_even or d
        set_ref(sec,'default',add(d,'Odd','right',index));set_ref(sec,'even',add(e,'Even','left',index))
        if kind=='函' and index==0:
            set_ref(sec,'first',add(source(sec,'first'),'First','right',index));ensure(sec,'titlePg')
    if child(settings.documentElement,'evenAndOddHeaders') is None:ensure(settings.documentElement,'evenAndOddHeaders')
    # Keep package/settings relationships valid if the input omitted settings.
    if 'word/settings.xml' not in parts:
        used={r.getAttribute('Id') for r in elements(rels,'Relationship',REL)};i=1
        while 'rId'+str(i) in used:i+=1
        r=rels.createElementNS(REL,'Relationship')
        for k,v in [('Id','rId'+str(i)),('Type',R+'/settings'),('Target','settings.xml')]:r.setAttribute(k,v)
        rels.documentElement.appendChild(r)
        n=ct.createElementNS(CT,'Override');n.setAttribute('PartName','/word/settings.xml');n.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml');ct.documentElement.appendChild(n)
    parts['word/_rels/document.xml.rels']=xml(rels);parts['[Content_Types].xml']=xml(ct);parts['word/settings.xml']=xml(settings)
