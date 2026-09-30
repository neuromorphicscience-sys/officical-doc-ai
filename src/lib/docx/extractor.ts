import JSZip from 'jszip'
import type { ExtractedDocument, ExtractedParagraph, ParagraphFeatures } from './types'
import { W_NS, firstChildByLocalName, getAllParagraphs, getWAttr, paragraphText, parseXml } from './xml'

function isInsideTable(p: Element): boolean {
  let parent = p.parentElement
  while (parent) {
    if (parent.localName === 'tbl') return true
    parent = parent.parentElement
  }
  return false
}

function readParagraphFeatures(p: Element): ParagraphFeatures {
  const pPr = firstChildByLocalName(p, 'pPr')
  const pStyle = pPr ? firstChildByLocalName(pPr, 'pStyle') : undefined
  const jc = pPr ? firstChildByLocalName(pPr, 'jc') : undefined
  const runs = Array.from(p.children).filter((el) => el.localName === 'r')

  let boldRuns = 0
  let textRuns = 0
  const sizes: number[] = []
  let eastAsiaFont: string | undefined
  let latinFont: string | undefined

  for (const run of runs) {
    if (!(run.textContent ?? '').trim()) continue
    textRuns += 1
    const rPr = firstChildByLocalName(run, 'rPr')
    if (!rPr) continue
    if (firstChildByLocalName(rPr, 'b')) boldRuns += 1
    const sz = firstChildByLocalName(rPr, 'sz')
    const szVal = Number(getWAttr(sz, 'val'))
    if (Number.isFinite(szVal) && szVal > 0) sizes.push(szVal / 2)
    const fonts = firstChildByLocalName(rPr, 'rFonts')
    eastAsiaFont ||= getWAttr(fonts, 'eastAsia')
    latinFont ||= getWAttr(fonts, 'ascii') || getWAttr(fonts, 'hAnsi')
  }

  const avgSize = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : undefined

  return {
    styleId: getWAttr(pStyle, 'val'),
    alignment: getWAttr(jc, 'val'),
    fontSizePt: avgSize,
    eastAsiaFont,
    latinFont,
    boldRatio: textRuns ? boldRuns / textRuns : 0,
    inTable: isInsideTable(p),
  }
}

function estimatePages(paragraphs: ExtractedParagraph[]): number {
  // Standard body width is ~28 Chinese characters/line and 22 lines/page.
  // This is deliberately an estimate; Word is the authoritative paginator.
  let lines = 0
  for (const p of paragraphs) {
    if (!p.text.trim()) {
      lines += 1
      continue
    }
    const weighted = Array.from(p.text).reduce((sum, ch) => sum + (/[^\x00-\xff]/.test(ch) ? 1 : 0.5), 0)
    lines += Math.max(1, Math.ceil(weighted / 28))
  }
  return Math.max(1, Math.ceil(lines / 22))
}

export async function extractDocx(file: File): Promise<{ zip: JSZip; extracted: ExtractedDocument }> {
  if (!file.name.toLowerCase().endsWith('.docx')) throw new Error('仅支持 .docx 文件。')
  if (file.size > 50 * 1024 * 1024) throw new Error('文档超长或文件过大：当前版本最多读取 50 MB 的 DOCX。')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('不是有效的 DOCX：缺少 word/document.xml。')

  const xml = await entry.async('string')
  const doc = parseXml(xml)
  const nodes = getAllParagraphs(doc)
  const paragraphs: ExtractedParagraph[] = nodes.map((p, id) => ({
    id,
    text: paragraphText(p),
    features: readParagraphFeatures(p),
  }))

  // Keep empty paragraphs in the paragraph list for stable ID mapping, but semantic text is line based.
  const text = paragraphs.map((p) => p.text).join('\n')
  return {
    zip,
    extracted: {
      fileName: file.name,
      paragraphs,
      text,
      estimatedPages: estimatePages(paragraphs),
    },
  }
}
