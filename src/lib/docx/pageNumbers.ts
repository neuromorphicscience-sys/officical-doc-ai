import JSZip from 'jszip'
import type { StructureAnalysis } from './types'
import {
  CONTENT_TYPES_NS,
  PKG_REL_NS,
  R_NS,
  W_NS,
  firstChildByLocalName,
  getAllParagraphs,
  parseXml,
  serializeXml,
  setWAttr,
} from './xml'

const FOOTER_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer'
const FOOTER_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml'

function footerXml(alignment: 'left' | 'right', indentSide: 'left' | 'right'): string {
  const ind = indentSide === 'left' ? 'w:leftChars="100"' : 'w:rightChars="100"'
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${W_NS}" xmlns:r="${R_NS}">
  <w:p>
    <w:pPr><w:jc w:val="${alignment}"/><w:ind ${ind}/></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t xml:space="preserve">— </w:t></w:r>
    <w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>
    <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t xml:space="preserve"> —</w:t></w:r>
  </w:p>
</w:ftr>`
}

function blankFooterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p/></w:ftr>`
}

function nextRelationshipIds(relsDoc: XMLDocument, count: number): string[] {
  const ids = Array.from(relsDoc.documentElement.children)
    .map((el) => el.getAttribute('Id') ?? '')
    .map((id) => Number(id.replace(/^rId/, '')))
    .filter(Number.isFinite)
  let n = Math.max(0, ...ids) + 1
  return Array.from({ length: count }, () => `rId${n++}`)
}

function addRelationship(relsDoc: XMLDocument, id: string, target: string) {
  const rel = relsDoc.createElementNS(PKG_REL_NS, 'Relationship')
  rel.setAttribute('Id', id)
  rel.setAttribute('Type', FOOTER_REL)
  rel.setAttribute('Target', target)
  relsDoc.documentElement.appendChild(rel)
}

function ensureContentTypeOverride(ctDoc: XMLDocument, partName: string) {
  const existing = Array.from(ctDoc.documentElement.children).find(
    (el) => el.localName === 'Override' && el.getAttribute('PartName') === partName,
  )
  if (existing) return
  const node = ctDoc.createElementNS(CONTENT_TYPES_NS, 'Override')
  node.setAttribute('PartName', partName)
  node.setAttribute('ContentType', FOOTER_CONTENT_TYPE)
  ctDoc.documentElement.appendChild(node)
}

function ensureEvenOdd(settingsDoc: XMLDocument) {
  if (Array.from(settingsDoc.documentElement.children).some((el) => el.localName === 'evenAndOddHeaders')) return
  settingsDoc.documentElement.appendChild(settingsDoc.createElementNS(W_NS, 'w:evenAndOddHeaders'))
}

function setFooterRef(sectPr: Element, type: 'default' | 'even' | 'first', rid: string) {
  const old = Array.from(sectPr.children).find(
    (el) => el.localName === 'footerReference' && (el.getAttributeNS(W_NS, 'type') ?? el.getAttribute('w:type')) === type,
  )
  old?.remove()
  const node = sectPr.ownerDocument!.createElementNS(W_NS, 'w:footerReference')
  setWAttr(node, 'type', type)
  node.setAttributeNS(R_NS, 'r:id', rid)
  const firstNonRef = Array.from(sectPr.children).find((el) => !['headerReference', 'footerReference'].includes(el.localName))
  if (firstNonRef) sectPr.insertBefore(node, firstNonRef)
  else sectPr.appendChild(node)
}

export async function applyPageNumbers(
  zip: JSZip,
  documentDoc: XMLDocument,
  analysis: StructureAnalysis,
  shouldAdd: boolean,
): Promise<void> {
  if (!shouldAdd) return

  const relEntry = zip.file('word/_rels/document.xml.rels')
  const ctEntry = zip.file('[Content_Types].xml')
  if (!relEntry || !ctEntry) throw new Error('DOCX 缺少关系或 Content Types 文件，无法安全添加页码。')

  const relsDoc = parseXml(await relEntry.async('string'))
  const ctDoc = parseXml(await ctEntry.async('string'))
  let settingsDoc: XMLDocument
  const settingsEntry = zip.file('word/settings.xml')
  if (settingsEntry) settingsDoc = parseXml(await settingsEntry.async('string'))
  else settingsDoc = parseXml(`<?xml version="1.0" encoding="UTF-8"?><w:settings xmlns:w="${W_NS}"/>`)

  const [oddRid, evenRid, firstRid] = nextRelationshipIds(relsDoc, 3)
  const suffix = Date.now().toString(36)
  const oddName = `footerOfficialOdd-${suffix}.xml`
  const evenName = `footerOfficialEven-${suffix}.xml`
  const firstName = `footerOfficialFirst-${suffix}.xml`

  zip.file(`word/${oddName}`, footerXml('right', 'right'))
  zip.file(`word/${evenName}`, footerXml('left', 'left'))
  zip.file(`word/${firstName}`, blankFooterXml())
  addRelationship(relsDoc, oddRid, oddName)
  addRelationship(relsDoc, evenRid, evenName)
  addRelationship(relsDoc, firstRid, firstName)
  ensureContentTypeOverride(ctDoc, `/word/${oddName}`)
  ensureContentTypeOverride(ctDoc, `/word/${evenName}`)
  ensureContentTypeOverride(ctDoc, `/word/${firstName}`)
  ensureEvenOdd(settingsDoc)

  const sectPrs = Array.from(documentDoc.getElementsByTagNameNS(W_NS, 'sectPr'))
  for (const sectPr of sectPrs) {
    setFooterRef(sectPr, 'default', oddRid)
    setFooterRef(sectPr, 'even', evenRid)
    if (analysis.documentType === '函') {
      setFooterRef(sectPr, 'first', firstRid)
      if (!firstChildByLocalName(sectPr, 'titlePg')) {
        const titlePg = sectPr.ownerDocument!.createElementNS(W_NS, 'w:titlePg')
        const afterRefs = Array.from(sectPr.children).find((el) => !['headerReference', 'footerReference'].includes(el.localName))
        if (afterRefs) sectPr.insertBefore(titlePg, afterRefs)
        else sectPr.appendChild(titlePg)
      }
    }
  }

  // A document can have no explicit sectPr only if malformed. Avoid silently inventing one here.
  if (!sectPrs.length && getAllParagraphs(documentDoc).length) {
    throw new Error('DOCX 未发现节属性（sectPr），无法安全添加页码。')
  }

  zip.file('word/_rels/document.xml.rels', serializeXml(relsDoc))
  zip.file('[Content_Types].xml', serializeXml(ctDoc))
  zip.file('word/settings.xml', serializeXml(settingsDoc))
}
