import JSZip from 'jszip'

export type FixtureKind = 'basic-notice' | 'uniform-notice' | 'mixed-heading-levels' | 'attachments-and-signature' | 'table-and-image'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l8sAAAAASUVORK5CYII='

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function paragraph(text: string, uniform = false): string {
  const pPr = uniform ? '<w:pPr><w:pStyle w:val="Normal"/></w:pPr>' : ''
  const rPr = uniform ? '<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="宋体"/><w:sz w:val="20"/></w:rPr>' : ''
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

function tableParagraph(text: string): string {
  return `<w:tbl><w:tblPr/><w:tblGrid/><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`
}

function pictureParagraph(): string {
  return `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="fixture"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rIdImage"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

function fixtureParagraphs(kind: FixtureKind): { body: string; texts: string[] } {
  if (kind === 'basic-notice') {
    const texts = ['关于做好期末工作的通知', '各有关单位：', '为进一步做好本学期期末工作，现将有关事项通知如下。', '总体要求', '各单位应按时完成相关工作。']
    return { body: texts.map((text) => paragraph(text)).join(''), texts }
  }
  if (kind === 'uniform-notice') {
    const texts = ['关于加强安全工作的通知', '各学院：', '现将有关工作要求通知如下。', '总体要求', '加强安全教育，认真落实工作责任。', '组织保障', '请各单位做好记录并及时反馈。']
    return { body: texts.map((text) => paragraph(text, true)).join(''), texts }
  }
  if (kind === 'mixed-heading-levels') {
    const texts = ['工作安排', '一、总体要求', '（一）加强统筹', '1.制定计划', '（1）明确责任人', '按时完成工作。']
    return { body: texts.map((text) => paragraph(text)).join(''), texts }
  }
  if (kind === 'attachments-and-signature') {
    const lead = ['关于报送工作材料的通知', '各有关部门：', ...Array.from({ length: 36 }, (_, index) => `请按要求完成第${index + 1}项工作安排，并做好过程记录与材料归档。`)]
    const tail = ['附件：材料清单', '附件1：工作情况表', '某某学院', '2026年9月30日', '（联系人：张老师）']
    const texts = [...lead, ...tail]
    return { body: texts.map((text) => paragraph(text)).join(''), texts }
  }
  const texts = ['会议材料', '表格内内容', '图片说明']
  return {
    body: `${paragraph(texts[0])}${tableParagraph(texts[1])}${paragraph(texts[2])}${pictureParagraph()}`,
    texts,
  }
}

export async function createDocxFixture(kind: FixtureKind): Promise<File> {
  const zip = new JSZip()
  const { body } = fixtureParagraphs(kind)
  const hasFooter = kind === 'attachments-and-signature'
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${hasFooter ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)
  const footerReference = hasFooter ? '<w:footerReference w:type="default" r:id="rIdFooter"/>' : ''
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}<w:sectPr>${footerReference}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr></w:body></w:document>`)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${kind === 'table-and-image' ? '<Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pixel.png"/>' : ''}${hasFooter ? '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : ''}</Relationships>`)
  zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8"?><w:settings xmlns:w="${W}"/>`)
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`)
  if (hasFooter) zip.file('word/footer1.xml', `<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="${W}"><w:p><w:r><w:t>保留的自定义页脚</w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`)
  if (kind === 'table-and-image') zip.file('word/media/pixel.png', Uint8Array.from(atob(PNG), (char) => char.charCodeAt(0)))
  const data = await zip.generateAsync({ type: 'uint8array' })
  return new File([data], `${kind}.docx`, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

export const fixtureImageBytes = Uint8Array.from(atob(PNG), (char) => char.charCodeAt(0))
