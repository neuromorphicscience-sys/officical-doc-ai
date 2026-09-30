export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
export const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
export const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'

export function parseXml(xml: string): XMLDocument {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parserError = doc.getElementsByTagName('parsererror')[0]
  if (parserError) throw new Error(`DOCX XML 解析失败：${parserError.textContent ?? 'unknown error'}`)
  return doc
}

export function serializeXml(doc: XMLDocument): string {
  return new XMLSerializer().serializeToString(doc)
}

export function firstChildByLocalName(parent: Element, localName: string): Element | undefined {
  return Array.from(parent.children).find((el) => el.localName === localName)
}

export function childrenByLocalName(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((el) => el.localName === localName)
}

export function ensureChild(parent: Element, localName: string, beforeLocalNames: string[] = []): Element {
  const existing = firstChildByLocalName(parent, localName)
  if (existing) return existing
  const node = parent.ownerDocument!.createElementNS(W_NS, `w:${localName}`)
  const before = Array.from(parent.children).find((el) => beforeLocalNames.includes(el.localName))
  if (before) parent.insertBefore(node, before)
  else parent.appendChild(node)
  return node
}

export function setWAttr(el: Element, name: string, value: string) {
  el.setAttributeNS(W_NS, `w:${name}`, value)
}

export function getWAttr(el: Element | undefined, name: string): string | undefined {
  if (!el) return undefined
  return el.getAttributeNS(W_NS, name) ?? el.getAttribute(`w:${name}`) ?? undefined
}

export function removeChildrenByLocalName(parent: Element, localNames: string[]) {
  for (const child of Array.from(parent.children)) {
    if (localNames.includes(child.localName)) child.remove()
  }
}

export function paragraphText(p: Element): string {
  let out = ''
  const walk = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    if (el.localName === 't') out += el.textContent ?? ''
    else if (el.localName === 'tab') out += '\t'
    else if (el.localName === 'br' || el.localName === 'cr') out += '\n'
    else Array.from(el.childNodes).forEach(walk)
  }
  Array.from(p.childNodes).forEach(walk)
  return out
}

export function getAllParagraphs(doc: XMLDocument): Element[] {
  return getElementsByNamespace(doc, W_NS, 'p')
}

export function getElementsByNamespace(root: XMLDocument | Element, namespaceUri: string, localName: string): Element[] {
  const namespaced = Array.from(root.getElementsByTagNameNS(namespaceUri, localName))
  if (namespaced.length) return namespaced
  // Some lightweight DOM implementations used by tests do not implement namespace lookup.
  return Array.from(root.getElementsByTagName('*'))
    .filter((element) => element.localName === localName && element.namespaceURI === namespaceUri)
}
