import JSZip from 'jszip'
import type { ExtractedDocument, FormatChange, FormatResult, StructureAnalysis, StructureBlock } from './types'
import { OFFICIAL_STANDARD, typographyForRole } from '../rules/officialRules'
import { normalizeSemanticText, sha256 } from '../hash'
import {
  W_NS,
  firstChildByLocalName,
  getElementsByNamespace,
  getAllParagraphs,
  getWAttr,
  paragraphText,
  parseXml,
  removeChildrenByLocalName,
  serializeXml,
  setWAttr,
} from './xml'
import { applyPageNumbers } from './pageNumbers'

const mmToTwips = (mm: number) => Math.round((mm / 25.4) * 1440)
const ptToHalfPoints = (pt: number) => String(Math.round(pt * 2))
const ptToTwips = (pt: number) => String(Math.round(pt * 20))

function ensurePPr(p: Element): Element {
  const existing = firstChildByLocalName(p, 'pPr')
  if (existing) return existing
  const pPr = p.ownerDocument!.createElementNS(W_NS, 'w:pPr')
  p.insertBefore(pPr, p.firstChild)
  return pPr
}

function ensureRPr(r: Element): Element {
  const existing = firstChildByLocalName(r, 'rPr')
  if (existing) return existing
  const rPr = r.ownerDocument!.createElementNS(W_NS, 'w:rPr')
  r.insertBefore(rPr, r.firstChild)
  return rPr
}

function ensurePPrChild(pPr: Element, name: string): Element {
  const existing = firstChildByLocalName(pPr, name)
  if (existing) return existing
  const node = pPr.ownerDocument!.createElementNS(W_NS, `w:${name}`)
  pPr.appendChild(node)
  return node
}

function ensureRPrChild(rPr: Element, name: string): Element {
  const existing = firstChildByLocalName(rPr, name)
  if (existing) return existing
  const node = rPr.ownerDocument!.createElementNS(W_NS, `w:${name}`)
  rPr.appendChild(node)
  return node
}

function setParagraphLayout(
  p: Element,
  opts: {
    alignment?: string
    firstLineChars?: number
    leftChars?: number
    rightChars?: number
    beforePt?: number
    afterPt?: number
    linePt?: number
    pageBreakBefore?: boolean
    keepNext?: boolean
  },
) {
  const pPr = ensurePPr(p)
  if (opts.alignment) {
    const jc = ensurePPrChild(pPr, 'jc')
    setWAttr(jc, 'val', opts.alignment)
  }

  const ind = ensurePPrChild(pPr, 'ind')
  ;['firstLine', 'firstLineChars', 'hanging', 'hangingChars', 'left', 'leftChars', 'right', 'rightChars'].forEach((name) => {
    ind.removeAttributeNS(W_NS, name)
    ind.removeAttribute(`w:${name}`)
  })
  // Character indents are authoritative in Word; equivalent twips provide a
  // fallback for office renderers that ignore *Chars. Explicit zeros also
  // prevent a source paragraph style from leaking into title/recipient layout.
  for (const [name, chars] of [['firstLine', opts.firstLineChars ?? 0], ['left', opts.leftChars ?? 0], ['right', opts.rightChars ?? 0]] as const) {
    setWAttr(ind, name, String(chars * OFFICIAL_STANDARD.body.sizePt * 20))
    setWAttr(ind, `${name}Chars`, String(chars * 100))
  }

  const spacing = ensurePPrChild(pPr, 'spacing')
  setWAttr(spacing, 'before', ptToTwips(opts.beforePt ?? 0))
  setWAttr(spacing, 'after', ptToTwips(opts.afterPt ?? 0))
  if (opts.linePt !== undefined) {
    setWAttr(spacing, 'line', ptToTwips(opts.linePt))
    setWAttr(spacing, 'lineRule', 'exact')
  }

  if (opts.pageBreakBefore) ensurePPrChild(pPr, 'pageBreakBefore')
  else firstChildByLocalName(pPr, 'pageBreakBefore')?.remove()

  if (opts.keepNext) ensurePPrChild(pPr, 'keepNext')
  else firstChildByLocalName(pPr, 'keepNext')?.remove()
}

function setRunTypography(p: Element, eastAsiaFont: string, latinFont: string, sizePt: number, bold: boolean) {
  const runs = getElementsByNamespace(p, W_NS, 'r')
  for (const run of runs) {
    const rPr = ensureRPr(run)
    const fonts = ensureRPrChild(rPr, 'rFonts')
    for (const name of ['asciiTheme', 'hAnsiTheme', 'eastAsiaTheme', 'cstheme']) { fonts.removeAttributeNS(W_NS, name); fonts.removeAttribute(`w:${name}`) }
    setWAttr(fonts, 'ascii', latinFont)
    setWAttr(fonts, 'hAnsi', latinFont)
    setWAttr(fonts, 'eastAsia', eastAsiaFont)
    setWAttr(fonts, 'cs', latinFont)

    const sz = ensureRPrChild(rPr, 'sz')
    const szCs = ensureRPrChild(rPr, 'szCs')
    setWAttr(sz, 'val', ptToHalfPoints(sizePt))
    setWAttr(szCs, 'val', ptToHalfPoints(sizePt))

    const color = ensureRPrChild(rPr, 'color')
    setWAttr(color, 'val', '000000')

    if (bold) {
      const b = ensureRPrChild(rPr, 'b')
      setWAttr(b, 'val', '1')
      const bCs = ensureRPrChild(rPr, 'bCs')
      setWAttr(bCs, 'val', '1')
    } else {
      setWAttr(ensureRPrChild(rPr, 'b'), 'val', '0')
      setWAttr(ensureRPrChild(rPr, 'bCs'), 'val', '0')
    }
  }
}

function applyBlockFormat(p: Element, block: StructureBlock, changes: FormatChange[]) {
  const std = OFFICIAL_STANDARD
  const baseLine = std.page.lineSpacingPt
  const record = (description: string) => changes.push({ paragraphId: block.id, category: block.role, description })
  const typography = typographyForRole(block.role, block.level ?? 1)
  if (typography) setRunTypography(p, typography.eastAsiaFont, typography.latinFont, typography.sizePt, typography.bold)

  if (block.role === 'title') {
    setParagraphLayout(p, { alignment: 'center', linePt: baseLine })
    record('标题：二号方正小标宋_GBK、居中、不加粗')
    return
  }

  if (block.role === 'heading') {
    const level = block.level ?? 1
    const cfg = level === 1 ? std.heading1 : level === 2 ? std.heading2 : level === 3 ? std.heading3 : std.heading4
    setParagraphLayout(p, { alignment: 'left', linePt: baseLine, keepNext: true })
    record(`第 ${level} 级标题：${cfg.eastAsiaFont}、三号`)
    return
  }

  if (block.role === 'recipient') {
    setParagraphLayout(p, { alignment: 'left', linePt: baseLine })
    record('主送机关：三号仿宋、顶格')
    return
  }

  if (block.role === 'attachment_note') {
    setParagraphLayout(p, { alignment: 'left', leftChars: 2, beforePt: baseLine, linePt: baseLine })
    record('附件说明：正文下空一行、左空二字')
    return
  }

  if (block.role === 'attachment_marker') {
    setParagraphLayout(p, { alignment: 'left', pageBreakBefore: true, linePt: baseLine })
    record('附件标识：另面排版、三号黑体顶格')
    return
  }

  if (block.role === 'attachment_title') {
    setParagraphLayout(p, { alignment: 'center', beforePt: baseLine, linePt: baseLine })
    record('附件标题：版心第三行居中')
    return
  }

  if (block.role === 'issuer') {
    setParagraphLayout(p, { alignment: 'right', rightChars: 4, beforePt: baseLine * 2, linePt: baseLine })
    record('发文单位署名：与正文间隔并按落款区域排版')
    return
  }

  if (block.role === 'date') {
    setParagraphLayout(p, { alignment: 'right', rightChars: 4, linePt: baseLine })
    record('成文日期：右空四字区域排版')
    return
  }

  if (block.role === 'annotation') {
    setParagraphLayout(p, { alignment: 'left', leftChars: 2, linePt: baseLine })
    record('附注：居左空二字')
    return
  }

  if (block.role === 'body') {
    setParagraphLayout(p, { alignment: 'both', firstLineChars: 2, linePt: baseLine })
    record('正文：三号仿宋、两端对齐、首行缩进2字符、28.8磅行距')
  }
}

function applyPageSetup(doc: XMLDocument, changes: FormatChange[]) {
  const std = OFFICIAL_STANDARD.page
  const sectPrs = getElementsByNamespace(doc, W_NS, 'sectPr')
  for (const sectPr of sectPrs) {
    let pgSz = firstChildByLocalName(sectPr, 'pgSz')
    if (!pgSz) {
      pgSz = doc.createElementNS(W_NS, 'w:pgSz')
      sectPr.appendChild(pgSz)
    }
    setWAttr(pgSz, 'w', String(mmToTwips(std.widthMm)))
    setWAttr(pgSz, 'h', String(mmToTwips(std.heightMm)))

    let pgMar = firstChildByLocalName(sectPr, 'pgMar')
    if (!pgMar) {
      pgMar = doc.createElementNS(W_NS, 'w:pgMar')
      sectPr.appendChild(pgMar)
    }
    setWAttr(pgMar, 'top', String(mmToTwips(std.marginTopMm)))
    setWAttr(pgMar, 'bottom', String(mmToTwips(std.marginBottomMm)))
    setWAttr(pgMar, 'left', String(mmToTwips(std.marginLeftMm)))
    setWAttr(pgMar, 'right', String(mmToTwips(std.marginRightMm)))

    let grid = firstChildByLocalName(sectPr, 'docGrid')
    if (!grid) {
      grid = doc.createElementNS(W_NS, 'w:docGrid')
      sectPr.appendChild(grid)
    }
    setWAttr(grid, 'type', 'lines')
    setWAttr(grid, 'linePitch', ptToTwips(std.lineSpacingPt))
  }
  changes.push({ category: 'page', description: '页面：A4，上37mm、下35mm、左27mm、右27mm，正文基准行距28.8磅' })
}

function ensureAllIdsHaveBlocks(paragraphCount: number, analysis: StructureAnalysis): Map<number, StructureBlock> {
  const map = new Map<number, StructureBlock>()
  for (const block of analysis.blocks) {
    if (Number.isInteger(block.id) && block.id >= 0 && block.id < paragraphCount && !map.has(block.id)) map.set(block.id, block)
  }
  return map
}

export async function formatDocx(
  zip: JSZip,
  extracted: ExtractedDocument,
  analysis: StructureAnalysis,
  onIntegrityCheck?: () => void,
  onGenerating?: () => void,
): Promise<FormatResult> {
  const documentEntry = zip.file('word/document.xml')
  if (!documentEntry) throw new Error('DOCX 缺少 word/document.xml。')
  const doc = parseXml(await documentEntry.async('string'))
  const paragraphs = getAllParagraphs(doc)
  if (paragraphs.length !== extracted.paragraphs.length) {
    throw new Error('DOCX 段落结构在分析后发生变化，无法安全对应 AI 角色；请重新处理原文件。')
  }
  const blocks = ensureAllIdsHaveBlocks(paragraphs.length, analysis)
  const changes: FormatChange[] = []
  const beforeText = normalizeSemanticText(extracted.text)
  const currentText = normalizeSemanticText(paragraphs.map(paragraphText).join('\n'))
  if (currentText !== beforeText) throw new Error('DOCX 正文与已分析版本不一致，已阻止格式化。')
  const beforeHash = await sha256(beforeText)

  applyPageSetup(doc, changes)

  for (let id = 0; id < paragraphs.length; id += 1) {
    const block = blocks.get(id)
    if (!block || block.role === 'unknown') continue
    // Empty paragraphs are retained for structural fidelity and are not reclassified as content.
    if (!paragraphText(paragraphs[id]).trim()) continue
    applyBlockFormat(paragraphs[id], block, changes)
  }

  const shouldAddPageNumbers = extracted.estimatedPages > 1
  await applyPageNumbers(zip, doc, analysis, shouldAddPageNumbers)
  if (shouldAddPageNumbers) {
    changes.push({ category: 'page_number', description: analysis.documentType === '函' ? '页码：奇右偶左，函首页不加页码' : '页码：奇右偶左，格式为“— 1 —”' })
  }

  zip.file('word/document.xml', serializeXml(doc))

  onIntegrityCheck?.()
  const afterDoc = parseXml(serializeXml(doc))
  const afterText = normalizeSemanticText(getAllParagraphs(afterDoc).map(paragraphText).join('\n'))
  const afterHash = await sha256(afterText)
  const contentPreserved = beforeHash === afterHash
  if (!contentPreserved) throw new Error('内容完整性校验失败：格式化过程意外改变了正文字符，已阻止输出。')

  onGenerating?.()
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return {
    blob,
    changes,
    beforeHash,
    afterHash,
    contentPreserved,
    originalCharacters: beforeText.length,
    outputCharacters: afterText.length,
    addedCharacters: 0,
    deletedCharacters: 0,
    modifiedCharacters: 0,
  }
}
