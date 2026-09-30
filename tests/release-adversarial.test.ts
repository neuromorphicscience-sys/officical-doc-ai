import { describe, expect, it } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { extractDocx } from '../src/lib/docx/extractor'
import { formatDocx } from '../src/lib/docx/formatter'
import { createDemoAnalysis } from '../src/lib/rules/heuristics'
import { validateAnalysis } from '../src/lib/docx/validator'
import { parseXml, W_NS, getElementsByNamespace, getWAttr } from '../src/lib/docx/xml'

// These tests isolate deterministic OOXML behavior. Real DeepSeek semantics are
// independently exercised against production by scripts/release/production-e2e.cjs.
const cases = ['01-uniform','02-numbering','03-unnumbered','04-attachments','05-long','06-letter','07-table','08-image','09-ambiguous']
const fixture = (name: string) => new File([new Uint8Array(readFileSync(`demo/cases/${name}.docx`))], `${name}.docx`)
const outputs = 'output/release-docx'
mkdirSync(outputs, { recursive: true })

describe('release: ten adversarial DOCX cases', () => {
  for (const name of cases) it(`${name}: preserves text, package references and original media`, async () => {
    const { zip, extracted } = await extractDocx(fixture(name))
    const analysis = createDemoAnalysis(extracted.paragraphs, name === '06-letter' ? '函' : 'auto', 'Deterministic fixture validation only')
    if (name === '03-unnumbered') {
      // Explicit test AST; never represented as a real model response.
      for (const block of analysis.blocks) if (['总体要求','主要任务','组织保障'].includes(extracted.paragraphs[block.id].text)) {
        block.role = 'heading'; block.level = 1
      }
    }
    if (name === '09-ambiguous') {
      analysis.source = 'deepseek' // controlled low-confidence contract simulation, not a network call
      analysis.confidence = .5
      analysis.blocks[3] = { id: 3, role: 'unknown', confidence: .3 }
      expect(validateAnalysis(extracted, analysis).map(x => x.code)).toEqual(expect.arrayContaining(['LOW_BLOCK_CONFIDENCE','LOW_DOCUMENT_CONFIDENCE','UNKNOWN_ROLE']))
    }
    const originalParts = new Map(await Promise.all(Object.keys(zip.files).filter(n => /word\/(media\/|header\d|footer\d)/.test(n) && !zip.files[n].dir).map(async n => [n, await zip.file(n)!.async('uint8array')] as const)))
    const result = await formatDocx(zip, extracted, analysis)
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    writeFileSync(`${outputs}/${name}_规范版.docx`, bytes)
    const output = await JSZip.loadAsync(bytes, { checkCRC32: true })
    const reloaded = await extractDocx(new File([bytes], `${name}.docx`))
    expect(reloaded.extracted.text).toBe(extracted.text)
    expect(result.beforeHash).toBe(result.afterHash)
    expect(result.originalCharacters).toBe(result.outputCharacters)
    expect(result.addedCharacters + result.deletedCharacters + result.modifiedCharacters).toBe(0)
    for (const [part, data] of originalParts) expect(await output.file(part)!.async('uint8array')).toEqual(data)
    const document = parseXml(await output.file('word/document.xml')!.async('string'))
    expect(document.documentElement.localName).toBe('document')
    expect(getElementsByNamespace(document, W_NS, 'tbl').length).toBe(name === '07-table' ? 1 : 0)
    for (const part of Object.keys(output.files).filter(n => /\.xml$|\.rels$/.test(n))) {
      const doc = parseXml(await output.file(part)!.async('string'))
      expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
      if (part.endsWith('.rels')) {
        const prefix = part.replace(/_rels\/[^/]*\.rels$/, '')
        for (const rel of Array.from(doc.getElementsByTagName('Relationship'))) {
          if (rel.getAttribute('TargetMode') === 'External') continue
          const target = rel.getAttribute('Target')!
          const resolved = target.startsWith('/') ? target.slice(1) : new URL(target, `https://package.test/${prefix}`).pathname.slice(1)
          expect(output.file(decodeURI(resolved)), `${part} -> ${target}`).not.toBeNull()
        }
      }
    }
    const contentTypes = parseXml(await output.file('[Content_Types].xml')!.async('string'))
    for (const node of Array.from(contentTypes.getElementsByTagName('Override'))) expect(output.file(node.getAttribute('PartName')!.slice(1))).not.toBeNull()
    if (name === '02-numbering') expect(analysis.blocks.filter(b => b.role === 'heading').map(b => b.level)).toEqual([1,2,3,4])
    if (name === '03-unnumbered') {
      expect(reloaded.extracted.paragraphs.some(p => p.text === '总体要求')).toBe(true)
      expect(result.changes.filter(c => c.category === 'heading')).toHaveLength(3)
    }
    if (name === '06-letter') {
      expect(getElementsByNamespace(document, W_NS, 'titlePg')).toHaveLength(1)
      const refs=Array.from(getElementsByNamespace(document, W_NS,'footerReference'))
      const first=refs.find(r=>getWAttr(r,'type') === 'first')!
      expect(first).toBeDefined()
      const rels=parseXml(await output.file('word/_rels/document.xml.rels')!.async('string'))
      const id=first.getAttribute('r:id')
      const rel=Array.from(rels.getElementsByTagName('Relationship')).find(r=>r.getAttribute('Id')===id)!
      const footer=await output.file(`word/${rel.getAttribute('Target')}`)!.async('string')
      expect(footer).not.toMatch(/w:instr="PAGE"/)
    }
  })
  it('10-corrupt: rejects a broken ZIP with a recoverable Chinese error', async () => {
    await expect(extractDocx(fixture('10-corrupt'))).rejects.toThrow('DOCX 文件已损坏')
  })
})

describe('release: output safety and recovery', () => {
  it('rejects empty files, missing document.xml, and empty document text', async () => {
    await expect(extractDocx(new File([], 'empty.docx'))).rejects.toThrow('文件为空')
    const missing = new JSZip(); missing.file('placeholder.txt', 'synthetic')
    await expect(extractDocx(new File([await missing.generateAsync({type:'uint8array'})], 'missing.docx'))).rejects.toThrow('缺少 word/document.xml')
    missing.file('word/document.xml', `<w:document xmlns:w="${W_NS}"><w:body><w:p/></w:body></w:document>`)
    await expect(extractDocx(new File([await missing.generateAsync({type:'uint8array'})], 'empty-text.docx'))).rejects.toThrow('没有可识别')
  })
  it('blocks integrity mismatch instead of generating a corrupted result', async () => {
    const {zip,extracted} = await extractDocx(fixture('01-uniform'))
    const analysis = createDemoAnalysis(extracted.paragraphs,'auto','test')
    zip.file('word/document.xml', (await zip.file('word/document.xml')!.async('string')).replace('各学院','另一个学院'))
    await expect(formatDocx(zip,extracted,analysis)).rejects.toThrow('正文与已分析版本不一致')
  })
  it('writes equivalent twip indents and explicitly disables inherited bold and theme fonts', async () => {
    const {zip,extracted} = await extractDocx(fixture('01-uniform'))
    zip.file('word/document.xml', (await zip.file('word/document.xml')!.async('string')).replace('w:ascii="Microsoft YaHei"', 'w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia" w:ascii="Microsoft YaHei"'))
    const result = await formatDocx(zip,extracted,createDemoAnalysis(extracted.paragraphs,'auto','test'))
    const output=await JSZip.loadAsync(await result.blob.arrayBuffer())
    const doc=parseXml(await output.file('word/document.xml')!.async('string'))
    const paras=getElementsByNamespace(doc,W_NS,'p')
    const bodyIndent=getElementsByNamespace(paras[2],W_NS,'ind')[0]
    expect(getWAttr(bodyIndent,'firstLine')).toBe('640')
    expect(getWAttr(bodyIndent,'firstLineChars')).toBe('200')
    expect(getWAttr(getElementsByNamespace(paras[0],W_NS,'ind')[0],'firstLine')).toBe('0')
    expect(getWAttr(getElementsByNamespace(paras[0],W_NS,'b')[0],'val')).toBe('0')
    expect(getWAttr(getElementsByNamespace(paras[0],W_NS,'rFonts')[0],'eastAsiaTheme')).toBeUndefined()
  })
  it('propagates generation failure so the UI can offer retry', async () => {
    const {zip,extracted} = await extractDocx(fixture('01-uniform'))
    zip.generateAsync = (() => Promise.reject(new Error('生成失败：存储空间不足'))) as typeof zip.generateAsync
    await expect(formatDocx(zip,extracted,createDemoAnalysis(extracted.paragraphs,'auto','test'))).rejects.toThrow('生成失败')
  })
})
