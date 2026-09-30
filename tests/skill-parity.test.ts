import { describe,it,expect } from 'vitest'
import { readFileSync,mkdirSync,existsSync,unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import JSZip from 'jszip'
import { extractDocx } from '../src/lib/docx/extractor'
import { formatDocx } from '../src/lib/docx/formatter'
import { parseStructureAnalysis } from '../src/lib/ai/types'
import { OFFICIAL_STANDARD } from '../src/lib/rules/officialRules'
import { parseXml, W_NS,getElementsByNamespace,getWAttr } from '../src/lib/docx/xml'

const skill='skill/official-docx-formatter'
const cases=['demo','01-uniform','02-numbering','03-unnumbered','04-attachments','05-long','06-letter','07-table','08-image']
const out='output/skill-parity';mkdirSync(out,{recursive:true})
function python(args:string[]){
 if(process.platform==='win32'){
  const root=process.cwd().replace(/^([A-Za-z]):/,(_,drive)=>`/mnt/${drive.toLowerCase()}`).replaceAll('\\','/')
  execFileSync('wsl.exe',['-d','Ubuntu-22.04','--cd',root,'--','python3','-B',...args],{timeout:30000})
 }else execFileSync('python3',['-B',...args],{timeout:30000})
}
function canonical(n:Element):unknown {
 const attrs=Array.from(n.attributes).map(a=>[a.namespaceURI,a.localName,a.value]).filter(a=>a[0]!=='http://www.w3.org/2000/xmlns/').sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
 return [n.namespaceURI,n.localName,attrs,Array.from(n.children).map(canonical)]
}
function projection(doc:XMLDocument){
 const parts=['pPr','rPr','pgSz','pgMar','docGrid']
 return Object.fromEntries(parts.map(name=>[name,getElementsByNamespace(doc,W_NS,name).map(canonical)]))
}
async function footers(zip:JSZip){
 const result:Record<string,unknown>[]=[]
 for(const name of Object.keys(zip.files).filter(n=>/word\/footerOfficial/.test(n)&&n.endsWith('.xml')).sort()){
  const doc=parseXml(await zip.file(name)!.async('string'))
  result.push({type:name.includes('Even')?'even':name.includes('First')?'first':'odd',text:getElementsByNamespace(doc,W_NS,'t').map(t=>t.textContent),fields:getElementsByNamespace(doc,W_NS,'fldSimple').map(n=>getWAttr(n,'instr')),pPr:getElementsByNamespace(doc,W_NS,'pPr').map(canonical),rPr:getElementsByNamespace(doc,W_NS,'rPr').map(canonical)})
 }
 return result
}
describe('skill: host AST and Python/Web deterministic parity',()=>{
 it('bundled numeric and typography rules equal the unchanged Web rules',()=>{
  expect(JSON.parse(readFileSync(`${skill}/references/formatting-rules.json`,'utf8')).standard).toEqual(OFFICIAL_STANDARD)
 })
 for(const name of cases)it(`${name}: same AST produces matching layout, fonts, page fields and text hash`,async()=>{
  const input=name==='demo'?'demo/乱格式办公通知示例.docx':`demo/cases/${name}.docx`
  const ast=JSON.parse(readFileSync(`tests/skill-asts/${name}.json`,'utf8'))
  // happy-dom rejects valid single-quoted XML declarations. Normalize only the
  // in-memory Web test input; the Skill processes the untouched original DOCX.
  const normalized=await JSZip.loadAsync(readFileSync(input))
  for(const part of Object.keys(normalized.files).filter(n=>/\.xml$|\.rels$/.test(n))){
   const text=await normalized.file(part)!.async('string');normalized.file(part,text.replace(/^<\?xml[^?]+\?>/,declaration=>declaration.replaceAll("'",'"')))
  }
  const {zip,extracted}=await extractDocx(new File([await normalized.generateAsync({type:'uint8array'})],name+'.docx'))
  // Same shared core fields pass the production schema; no network request is used.
  const analysis=parseStructureAnalysis(ast,new Set(extracted.paragraphs.filter(p=>p.text.trim()).map(p=>p.id)))
  const web=await formatDocx(zip,extracted,analysis)
  const destination=`${out}/${name}.docx`,report=`${out}/${name}.json`
  for(const p of [destination,report])if(existsSync(p))unlinkSync(p)
  python([`${skill}/scripts/format_docx.py`,input,'--ast',`tests/skill-asts/${name}.json`,'--out',destination,'--report',report])
  const py=await JSZip.loadAsync(readFileSync(destination),{checkCRC32:true})
  const webZip=await JSZip.loadAsync(await web.blob.arrayBuffer())
  const pydoc=parseXml(await py.file('word/document.xml')!.async('string'));const webdoc=parseXml(await webZip.file('word/document.xml')!.async('string'))
  expect(projection(pydoc)).toEqual(projection(webdoc))
  expect(await footers(py)).toEqual(await footers(webZip))
  const pyreport=JSON.parse(readFileSync(report,'utf8'));expect(pyreport.beforeSHA256).toBe(web.beforeHash);expect(pyreport.afterSHA256).toBe(web.afterHash);expect(pyreport.originalCharacters).toBe(web.originalCharacters)
 },30000)
})
