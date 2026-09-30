import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { extractDocx } from '../src/lib/docx/extractor'
import { formatDocx } from '../src/lib/docx/formatter'
import { detectDate, detectExplicitHeadingLevel, createDemoAnalysis } from '../src/lib/rules/heuristics'
import { normalizeSemanticText } from '../src/lib/hash'
import type { StructureAnalysis } from '../src/lib/docx/types'
import { createDocxFixture, fixtureImageBytes, type FixtureKind } from './fixtures'

async function analyzeFixture(file: File, kind: FixtureKind): Promise<{ zip: JSZip; text: string; analysis: StructureAnalysis }> {
  const { zip, extracted } = await extractDocx(file)
  if (kind === 'uniform-notice') {
    const demo = createDemoAnalysis(extracted.paragraphs, 'auto', 'fixture has no configured AI endpoint')
    return { zip, text: extracted.text, analysis: demo }
  }

  const blocks = extracted.paragraphs.filter((paragraph) => paragraph.text.trim()).map((paragraph, index, rows) => {
    const text = paragraph.text.trim()
    if (index === 0) return { id: paragraph.id, role: 'title' as const, confidence: 0.98 }
    if (/^(?:各|致|送).+[：:]$/u.test(text)) return { id: paragraph.id, role: 'recipient' as const, confidence: 0.95 }
    const level = detectExplicitHeadingLevel(text)
    if (level) return { id: paragraph.id, role: 'heading' as const, level, confidence: 0.99 }
    if (/^附件[：:]/u.test(text)) return { id: paragraph.id, role: 'attachment_note' as const, confidence: 0.98 }
    if (/^附件\s*\d+\s*[：:]?$/u.test(text)) return { id: paragraph.id, role: 'attachment_marker' as const, confidence: 0.98 }
    if (/^附件\d+[：:]/u.test(text)) return { id: paragraph.id, role: 'attachment_title' as const, confidence: 0.95 }
    if (detectDate(text) && text.length < 24) return { id: paragraph.id, role: 'date' as const, confidence: 0.99 }
    if (/联系人：|此件/u.test(text)) return { id: paragraph.id, role: 'annotation' as const, confidence: 0.9 }
    if (index > 0 && rows[index + 1] && /(?:学院|大学|中心|办公室)$/u.test(text) && detectDate(rows[index + 1].text)) {
      return { id: paragraph.id, role: 'issuer' as const, confidence: 0.95 }
    }
    return { id: paragraph.id, role: 'body' as const, confidence: 0.99 }
  })
  return {
    zip,
    text: extracted.text,
    analysis: { documentType: '通知', confidence: 0.98, source: 'deepseek', blocks },
  }
}

async function formatFixture(kind: FixtureKind, documentType: StructureAnalysis['documentType'] = '通知') {
  const file = await createDocxFixture(kind)
  const { zip, extracted } = await extractDocx(file)
  if (documentType === '函') {
    const documentXml = await zip.file('word/document.xml')!.async('string')
    const relsXml = await zip.file('word/_rels/document.xml.rels')!.async('string')
    const contentTypesXml = await zip.file('[Content_Types].xml')!.async('string')
    zip.file('word/document.xml', documentXml.replace('<w:pgSz', '<w:footerReference w:type="first" r:id="rIdLetterFirst"/><w:pgSz'))
    zip.file('word/_rels/document.xml.rels', relsXml.replace('</Relationships>', '<Relationship Id="rIdLetterFirst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footerFirst.xml"/></Relationships>'))
    zip.file('[Content_Types].xml', contentTypesXml.replace('</Types>', '<Override PartName="/word/footerFirst.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'))
    zip.file('word/footerFirst.xml', `<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>函首页保留内容</w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`)
  }
  const { analysis: detected } = await analyzeFixture(file, kind)
  const analysis = { ...detected, documentType }
  const result = await formatDocx(zip, extracted, analysis)
  const outputZip = await JSZip.loadAsync(await result.blob.arrayBuffer())
  const outputFile = new File([await result.blob.arrayBuffer()], file.name, { type: file.type })
  const formatted = await extractDocx(outputFile)
  return { file, extracted, analysis, result, outputZip, formatted: formatted.extracted }
}

describe('generated DOCX fixtures and OOXML formatter', () => {
  it('reads and formats a basic notification while preserving every body character', async () => {
    const output = await formatFixture('basic-notice')
    expect(output.extracted.paragraphs.map((paragraph) => paragraph.text)).toHaveLength(5)
    expect(output.result.contentPreserved).toBe(true)
    expect(output.result.beforeHash).toBe(output.result.afterHash)
    expect(output.result.originalCharacters).toBe(output.result.outputCharacters)
    expect(output.result.addedCharacters + output.result.deletedCharacters + output.result.modifiedCharacters).toBe(0)
    expect(normalizeSemanticText(output.formatted.text)).toBe(normalizeSemanticText(output.extracted.text))
  })

  it('handles a uniform-style notice without Word heading styles and clearly marks heuristic output as a demo', async () => {
    const output = await formatFixture('uniform-notice')
    expect(output.analysis.source).toBe('demo')
    expect(output.analysis.warnings?.[0]).toContain('演示模式')
    expect(output.analysis.blocks.some((block) => block.role === 'heading')).toBe(true)
    expect(output.result.contentPreserved).toBe(true)
    expect(output.formatted.text).toBe(output.extracted.text)
  })

  it('recognizes all four explicit numbering levels and applies their format roles', async () => {
    const output = await formatFixture('mixed-heading-levels')
    expect(output.analysis.blocks.filter((block) => block.role === 'heading').map((block) => block.level)).toEqual([1, 2, 3, 4])
    expect(output.result.changes.filter((change) => change.category === 'heading')).toHaveLength(4)
    expect(output.result.contentPreserved).toBe(true)
  })

  it('formats attachment notes, issuer, full Arabic date and note while adding page numbers only when the estimate exceeds one page', async () => {
    const output = await formatFixture('attachments-and-signature')
    expect(output.extracted.estimatedPages).toBeGreaterThan(1)
    expect(output.result.changes.map((change) => change.category)).toContain('attachment_note')
    expect(output.result.changes.map((change) => change.category)).toContain('issuer')
    expect(output.result.changes.map((change) => change.category)).toContain('date')
    expect(output.result.changes.map((change) => change.category)).toContain('annotation')
    const oddName = Object.keys(output.outputZip.files).find((name) => /footerOfficialOdd-.*\.xml$/u.test(name))
    const evenName = Object.keys(output.outputZip.files).find((name) => /footerOfficialEven-.*\.xml$/u.test(name))
    expect(oddName).toBeDefined()
    expect(evenName).toBeDefined()
    expect(await output.outputZip.file('word/footer1.xml')!.async('string')).toContain('保留的自定义页脚')
    expect(await output.outputZip.file(oddName!)!.async('string')).toContain('保留的自定义页脚')
    expect(await output.outputZip.file(evenName!)!.async('string')).toContain('保留的自定义页脚')
    expect(await output.outputZip.file(oddName!)!.async('string')).toContain('PAGE')
    expect((await output.outputZip.file(oddName!)!.async('string')).match(/PAGE/gu)).toHaveLength(1)
    expect(output.formatted.text).toBe(output.extracted.text)
  })

  it('keeps table paragraphs and image media intact in the source OOXML package', async () => {
    const output = await formatFixture('table-and-image')
    expect(output.extracted.paragraphs.find((paragraph) => paragraph.text === '表格内内容')?.features.inTable).toBe(true)
    expect(output.outputZip.file('word/media/pixel.png')).not.toBeNull()
    expect(await output.outputZip.file('word/media/pixel.png')!.async('uint8array')).toEqual(fixtureImageBytes)
    expect(await output.outputZip.file('word/styles.xml')!.async('string')).toContain('styleId="Normal"')
    expect(output.formatted.text).toBe(output.extracted.text)
  })

  it('leaves the first-page footer blank for a multi-page letter and numbers later pages', async () => {
    const output = await formatFixture('attachments-and-signature', '函')
    const documentXml = await output.outputZip.file('word/document.xml')!.async('string')
    const firstRelationship = documentXml.match(/<w:footerReference[^>]*w:type="first"[^>]*r:id="([^"]+)"/u)?.[1]
    expect(documentXml).toContain('w:titlePg')
    expect(firstRelationship).toBeDefined()
    const relationships = await output.outputZip.file('word/_rels/document.xml.rels')!.async('string')
    const escapedId = firstRelationship!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const target = relationships.match(new RegExp(`<Relationship[^>]*Id="${escapedId}"[^>]*Target="([^"]+)"`, 'u'))?.[1]
    expect(target).toBeDefined()
    const firstFooter = await output.outputZip.file(`word/${target}`)!.async('string')
    expect(firstFooter).not.toContain('PAGE')
    expect(firstFooter).toContain('函首页保留内容')
    expect(Object.keys(output.outputZip.files).some((name) => /footerOfficialOdd-.*\.xml$/u.test(name))).toBe(true)
  })
})
