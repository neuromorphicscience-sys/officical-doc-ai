#!/usr/bin/env python3
"""Usage: format_docx.py INPUT.docx --ast structure.json --out NEW.docx [--report report.json] [--reviewed]"""
from common import *
from ooxml import apply_block,page_setup,page_numbers
from zipfile import ZIP_DEFLATED

def run():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input');p.add_argument('--ast',required=True);p.add_argument('--out',required=True);p.add_argument('--report');p.add_argument('--reviewed',action='store_true');a=p.parse_args()
    paths=[Path(x).resolve() for x in [a.input,a.ast,a.out]+([a.report] if a.report else [])]
    if len(paths)!=len(set(paths)):fail(40,'输入、AST、输出和报告必须使用不同路径。')
    if paths[2].suffix.lower()!='.docx':fail(40,'输出必须为 .docx。')
    if paths[2].exists() or (a.report and Path(a.report).exists()):fail(40,'输出或报告已存在，请使用新文件名。')
    parts,infos,original=load(a.input);doc=parse(parts['word/document.xml']);before=dict(parts)
    blocks,warnings=check_ast(read_json(a.ast),doc,digest(Path(a.input).read_bytes()),a.reviewed)
    page_setup(doc);applied=[]
    for i,para in enumerate(elements(doc,'p')):
        if i in blocks and paragraph_text(para).strip():apply_block(para,blocks[i]);applied.append({'id':i,'role':blocks[i]['role'],'level':blocks[i].get('level')})
    add_pages=estimate(original)>1;page_numbers(parts,doc,read_json(a.ast)['documentType'],add_pages)
    parts['word/document.xml']=xml(doc)
    result=compare(a.input,a.out,(before,infos,original),(parts,infos,parse(parts['word/document.xml'])))
    memory=BytesIO();known=set()
    with ZipFile(memory,'w',compression=ZIP_DEFLATED,compresslevel=6) as z:
        for info in infos:z.writestr(info,parts[info.filename]);known.add(info.filename)
        for name,data in parts.items():
            if name not in known:z.writestr(name,data)
    with ZipFile(BytesIO(memory.getvalue())) as z:
        if z.testzip():fail(30,'重新打包的 DOCX CRC 验证失败。')
    result.update({'output':str(paths[2]),'rulesVersion':RULES['version'],'appliedBlocks':applied,'pageNumbersAdded':add_pages,'estimatedPages':estimate(original),'warnings':warnings+['规范字体依赖本机安装；最终分页以 Word 为准。']})
    write_new(a.out,memory.getvalue())
    if a.report:write_new(a.report,json_bytes(result))
    return result
if __name__=='__main__':main(run)
