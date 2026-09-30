import JSZip from 'jszip'
import type { StructureAnalysis } from './types'
import {
  CONTENT_TYPES_NS,
  PKG_REL_NS,
  R_NS,
  W_NS,
  firstChildByLocalName,
  getElementsByNamespace,
  getWAttr,
  parseXml,
  serializeXml,
  setWAttr,
} from './xml'

const FOOTER_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer'
const FOOTER_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

function emptyFooterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p/></w:ftr>`
}

function appendRun(doc: XMLDocument, paragraph: Element, content: string, field = false) {
  const run = doc.createElementNS(W_NS, 'w:r')
  const runProperties = doc.createElementNS(W_NS, 'w:rPr')
  const fonts = doc.createElementNS(W_NS, 'w:rFonts')
  setWAttr(fonts, 'ascii', 'Times New Roman')
  setWAttr(fonts, 'hAnsi', 'Times New Roman')
  setWAttr(fonts, 'eastAsia', '宋体')
  setWAttr(fonts, 'cs', 'Times New Roman')
  runProperties.appendChild(fonts)
  const size = doc.createElementNS(W_NS, 'w:sz')
  setWAttr(size, 'val', '28')
  runProperties.appendChild(size)
  const sizeComplex = doc.createElementNS(W_NS, 'w:szCs')
  setWAttr(sizeComplex, 'val', '28')
  runProperties.appendChild(sizeComplex)
  run.appendChild(runProperties)
  const text = doc.createElementNS(W_NS, 'w:t')
  if (content.startsWith(' ') || content.endsWith(' ')) text.setAttributeNS(XML_NS, 'xml:space', 'preserve')
  text.textContent = content
  run.appendChild(text)
  if (field) {
    const fieldNode = doc.createElementNS(W_NS, 'w:fldSimple')
    setWAttr(fieldNode, 'instr', 'PAGE')
    fieldNode.appendChild(run)
    paragraph.appendChild(fieldNode)
  } else {
    paragraph.appendChild(run)
  }
}

function appendPageNumber(doc: XMLDocument, alignment: 'left' | 'right', indentSide: 'left' | 'right') {
  const paragraph = doc.createElementNS(W_NS, 'w:p')
  const properties = doc.createElementNS(W_NS, 'w:pPr')
  const justify = doc.createElementNS(W_NS, 'w:jc')
  setWAttr(justify, 'val', alignment)
  properties.appendChild(justify)
  const indent = doc.createElementNS(W_NS, 'w:ind')
  setWAttr(indent, indentSide === 'left' ? 'leftChars' : 'rightChars', '100')
  properties.appendChild(indent)
  paragraph.appendChild(properties)
  appendRun(doc, paragraph, '— ')
  appendRun(doc, paragraph, '1', true)
  appendRun(doc, paragraph, ' —')
  doc.documentElement.appendChild(paragraph)
}

function removePageFields(doc: XMLDocument) {
  for (const field of getElementsByNamespace(doc, W_NS, 'fldSimple')) {
    if (/\bPAGE\b/iu.test(getWAttr(field, 'instr') ?? '')) field.remove()
  }

  for (const paragraph of getElementsByNamespace(doc, W_NS, 'p')) {
    const children = Array.from(paragraph.children)
    let fieldStart = -1
    let isPageField = false
    for (let index = 0; index < children.length; index += 1) {
      const run = children[index]
      if (run.localName !== 'r') continue
      const fieldCharacters = getElementsByNamespace(run, W_NS, 'fldChar')
      if (fieldCharacters.some((character) => getWAttr(character, 'fldCharType') === 'begin')) {
        fieldStart = index
        isPageField = false
      }
      if (fieldStart >= 0 && getElementsByNamespace(run, W_NS, 'instrText')
        .some((instruction) => /\bPAGE\b/iu.test(instruction.textContent ?? ''))) {
        isPageField = true
      }
      if (fieldStart >= 0 && fieldCharacters.some((character) => getWAttr(character, 'fldCharType') === 'end')) {
        if (isPageField) {
          for (const fieldRun of children.slice(fieldStart, index + 1)) fieldRun.remove()
          index = fieldStart - 1
        }
        fieldStart = -1
        isPageField = false
      }
    }
  }
}

function footerReference(sectPr: Element, type: 'default' | 'even' | 'first'): Element | undefined {
  return Array.from(sectPr.children).find((element) =>
    element.localName === 'footerReference' && getWAttr(element, 'type') === type,
  )
}

function relationshipForReference(sectPr: Element, type: 'default' | 'even' | 'first', relsDoc: XMLDocument): Element | undefined {
  const ref = footerReference(sectPr, type)
  const relationshipId = ref?.getAttributeNS(R_NS, 'id') ?? ref?.getAttribute('r:id')
  if (!relationshipId) return undefined
  return Array.from(relsDoc.documentElement.children).find((element) => element.getAttribute('Id') === relationshipId)
}

function relationshipPartPath(target: string): string {
  const url = new URL(target, 'https://ooxml.invalid/word/document.xml')
  const path = decodeURIComponent(url.pathname).replace(/^\//, '')
  if (!path || path.split('/').some((segment) => segment === '..')) throw new Error('DOCX 页脚关系指向了无效文件路径。')
  return path
}

function sourcePartPath(relationship: Element | undefined): string | undefined {
  if (!relationship) return undefined
  if (relationship.getAttribute('Type') !== FOOTER_REL || relationship.getAttribute('TargetMode') === 'External') {
    throw new Error('DOCX 页脚关系格式无效，已停止修改。')
  }
  return relationshipPartPath(relationship.getAttribute('Target') ?? '')
}

function nextRelationshipId(relsDoc: XMLDocument): string {
  const ids = Array.from(relsDoc.documentElement.children)
    .map((element) => Number((element.getAttribute('Id') ?? '').replace(/^rId/, '')))
    .filter(Number.isFinite)
  return `rId${Math.max(0, ...ids) + 1}`
}

function nextFooterPartName(zip: JSZip, type: 'Odd' | 'Even' | 'First', sectionIndex: number): string {
  const suffix = Date.now().toString(36)
  let candidate = `footerOfficial${type}-${suffix}-s${sectionIndex + 1}.xml`
  let index = 1
  while (zip.file(`word/${candidate}`)) candidate = `footerOfficial${type}-${suffix}-s${sectionIndex + 1}-${index++}.xml`
  return candidate
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
    (element) => element.localName === 'Override' && element.getAttribute('PartName') === partName,
  )
  if (existing) return
  const node = ctDoc.createElementNS(CONTENT_TYPES_NS, 'Override')
  node.setAttribute('PartName', partName)
  node.setAttribute('ContentType', FOOTER_CONTENT_TYPE)
  ctDoc.documentElement.appendChild(node)
}

async function addFooterPartFromXml(
  zip: JSZip,
  relsDoc: XMLDocument,
  ctDoc: XMLDocument,
  originalXml: string | undefined,
  originalPartPath: string | undefined,
  type: 'Odd' | 'Even' | 'First',
  alignment: 'left' | 'right',
  sectionIndex: number,
  indentSide: 'left' | 'right',
): Promise<string> {
  const partName = nextFooterPartName(zip, type, sectionIndex)
  const partPath = `word/${partName}`
  if (originalPartPath && !zip.file(originalPartPath)) throw new Error('DOCX 页脚引用的内容文件不存在，已停止修改。')
  const cloneDoc = parseXml(originalXml ?? emptyFooterXml())
  removePageFields(cloneDoc)
  if (type !== 'First') appendPageNumber(cloneDoc, alignment, indentSide)
  zip.file(partPath, serializeXml(cloneDoc))

  if (originalPartPath) {
    const sourceName = originalPartPath.split('/').at(-1)!
    const clonedRelsPath = `word/_rels/${partName}.rels`
    const originalRelsPath = `word/_rels/${sourceName}.rels`
    const originalRels = zip.file(originalRelsPath)
    if (originalRels) zip.file(clonedRelsPath, await originalRels.async('string'))
  }

  const rid = nextRelationshipId(relsDoc)
  addRelationship(relsDoc, rid, partName)
  ensureContentTypeOverride(ctDoc, `/${partPath}`)
  return rid
}

function setFooterRef(sectPr: Element, type: 'default' | 'even' | 'first', rid: string) {
  footerReference(sectPr, type)?.remove()
  const node = sectPr.ownerDocument!.createElementNS(W_NS, 'w:footerReference')
  setWAttr(node, 'type', type)
  node.setAttributeNS(R_NS, 'r:id', rid)
  const firstNonRef = Array.from(sectPr.children).find((element) => !['headerReference', 'footerReference'].includes(element.localName))
  if (firstNonRef) sectPr.insertBefore(node, firstNonRef)
  else sectPr.appendChild(node)
}

function ensureEvenOdd(settingsDoc: XMLDocument) {
  if (Array.from(settingsDoc.documentElement.children).some((element) => element.localName === 'evenAndOddHeaders')) return
  settingsDoc.documentElement.appendChild(settingsDoc.createElementNS(W_NS, 'w:evenAndOddHeaders'))
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
  const settingsEntry = zip.file('word/settings.xml')
  const settingsDoc = settingsEntry
    ? parseXml(await settingsEntry.async('string'))
    : parseXml(`<?xml version="1.0" encoding="UTF-8"?><w:settings xmlns:w="${W_NS}"/>`)

  const sectPrs = getElementsByNamespace(documentDoc, W_NS, 'sectPr')
  if (!sectPrs.length && getElementsByNamespace(documentDoc, W_NS, 'p').length) {
    throw new Error('DOCX 未发现节属性（sectPr），无法安全添加页码。')
  }

  let inheritedDefault: string | undefined
  let inheritedEven: string | undefined
  for (const [sectionIndex, sectPr] of sectPrs.entries()) {
    const defaultRel = relationshipForReference(sectPr, 'default', relsDoc)
    const explicitDefault = sourcePartPath(defaultRel)
    if (explicitDefault) inheritedDefault = explicitDefault
    const defaultSource = explicitDefault ?? inheritedDefault

    const evenRel = relationshipForReference(sectPr, 'even', relsDoc)
    const explicitEven = sourcePartPath(evenRel)
    if (explicitEven) inheritedEven = explicitEven
    const evenSource = explicitEven ?? inheritedEven ?? defaultSource

    const oddXml = defaultSource ? await zip.file(defaultSource)?.async('string') : undefined
    const evenXml = evenSource ? await zip.file(evenSource)?.async('string') : undefined
    const oddRid = await addFooterPartFromXml(zip, relsDoc, ctDoc, oddXml, defaultSource, 'Odd', 'right', sectionIndex, 'right')
    const evenRid = await addFooterPartFromXml(zip, relsDoc, ctDoc, evenXml ?? oddXml, evenSource ?? defaultSource, 'Even', 'left', sectionIndex, 'left')
    setFooterRef(sectPr, 'default', oddRid)
    setFooterRef(sectPr, 'even', evenRid)

    if (analysis.documentType === '函' && sectionIndex === 0) {
      const firstRelationship = relationshipForReference(sectPr, 'first', relsDoc)
      const firstSource = sourcePartPath(firstRelationship)
      const firstXml = firstSource ? await zip.file(firstSource)?.async('string') : undefined
      const firstRid = await addFooterPartFromXml(zip, relsDoc, ctDoc, firstXml, firstSource, 'First', 'right', sectionIndex, 'right')
      setFooterRef(sectPr, 'first', firstRid)
      if (!firstChildByLocalName(sectPr, 'titlePg')) {
        const titlePg = sectPr.ownerDocument!.createElementNS(W_NS, 'w:titlePg')
        const afterRefs = Array.from(sectPr.children).find((element) => !['headerReference', 'footerReference'].includes(element.localName))
        if (afterRefs) sectPr.insertBefore(titlePg, afterRefs)
        else sectPr.appendChild(titlePg)
      }
    }
  }

  ensureEvenOdd(settingsDoc)
  zip.file('word/_rels/document.xml.rels', serializeXml(relsDoc))
  zip.file('[Content_Types].xml', serializeXml(ctDoc))
  zip.file('word/settings.xml', serializeXml(settingsDoc))
}
