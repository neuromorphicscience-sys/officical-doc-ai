import type { DocumentType, ExtractedParagraph, StructureAnalysis, StructureBlock } from '../docx/types'

const headingPatterns = [
  /^\s*[一二三四五六七八九十百]+、/u,
  /^\s*（[一二三四五六七八九十百]+）/u,
  /^\s*\d+[.．]/u,
  /^\s*（\d+）/u,
]

const datePattern = /(?:\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/u
const unnumberedHeadings = /^(?:总体要求|基本原则|工作目标|总体目标|主要任务|重点任务|工作安排|组织保障|工作要求|有关要求|下一步工作|其他事项|实施步骤|保障措施)(?:[：:]|$)/u

export function detectExplicitHeadingLevel(text: string): 1 | 2 | 3 | 4 | undefined {
  const index = headingPatterns.findIndex((pattern) => pattern.test(text))
  return index < 0 ? undefined : (index + 1) as 1 | 2 | 3 | 4
}

export function detectDate(text: string): string | undefined {
  return text.match(datePattern)?.[0]
}

function isDateParagraph(text: string): boolean {
  return /^\s*(?:成文日期[：:]\s*)?\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*$/u.test(text)
    || /^\s*(?:成文日期[：:]\s*)?\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s*$/u.test(text)
}

function chooseDocumentType(text: string, hint: DocumentType): Exclude<DocumentType, 'auto'> {
  if (hint !== 'auto') return hint
  if (/会议纪要/u.test(text)) return '会议纪要'
  if (/规章制度|管理办法|实施细则/u.test(text)) return '规章制度'
  if (/工作总结/u.test(text)) return '工作总结'
  if (/请示/u.test(text)) return '请示'
  if (/报告/u.test(text)) return '报告'
  if (/通知/u.test(text)) return '通知'
  if (/函/u.test(text)) return '函'
  return '其他'
}

function isIssuer(text: string): boolean {
  return text.length <= 28 && /(?:单位|学院|大学|中心|委员会|办公室|研究院|公司|局|部|处|馆|所|署|团体)$/u.test(text)
}

export function createDemoAnalysis(
  paragraphs: ExtractedParagraph[],
  documentTypeHint: DocumentType,
  demoReason: string,
): StructureAnalysis {
  const nonEmpty = paragraphs.filter((paragraph) => paragraph.text.trim())
  const combined = nonEmpty.map((paragraph) => paragraph.text).join('\n')
  const documentType = chooseDocumentType(combined, documentTypeHint)
  const roleById = new Map<number, StructureBlock>()
  const macroIds = new Set<number>()
  const addMacro = (id: number, role: StructureBlock['role'], confidence: number, rationale: string) => {
    macroIds.add(id)
    roleById.set(id, { id, role, confidence, rationale })
  }

  const date = nonEmpty.find((paragraph) => isDateParagraph(paragraph.text))
  if (date) addMacro(date.id, 'date', 0.92, '本地日期格式规则匹配')
  const recipient = nonEmpty.slice(0, 8).find((paragraph) => /^(?:各|致|送)[^。；;]{1,35}[：:]$/u.test(paragraph.text.trim()))
  if (recipient && !macroIds.has(recipient.id)) addMacro(recipient.id, 'recipient', 0.86, '本地主送机关格式规则匹配')

  const datePosition = date ? nonEmpty.findIndex((paragraph) => paragraph.id === date.id) : -1
  if (datePosition > 0) {
    const issuer = nonEmpty[datePosition - 1]
    if (isIssuer(issuer.text.trim()) && !macroIds.has(issuer.id)) {
      addMacro(issuer.id, 'issuer', 0.78, '本地署名词形规则匹配')
    }
  }

  for (const paragraph of nonEmpty) {
    const text = paragraph.text.trim()
    if (/^附件[：:]/u.test(text)) {
      addMacro(paragraph.id, 'attachment_note', 0.9, '本地附件说明规则匹配')
    } else if (/^附件(?:\s*\d+|[一二三四五六七八九十]+)?\s*[：:]?$/u.test(text)) {
      addMacro(paragraph.id, 'attachment_marker', 0.84, '本地附件标识规则匹配')
      const next = nonEmpty[nonEmpty.findIndex((item) => item.id === paragraph.id) + 1]
      if (next && !macroIds.has(next.id)) addMacro(next.id, 'attachment_title', 0.55, '附件标识后的下一段，演示猜测')
    } else if (/^[（(].{1,30}[）)]$/u.test(text) && /此件|联系人|联系电话/u.test(text)) {
      addMacro(paragraph.id, 'annotation', 0.86, '本地附注括号规则匹配')
    }
  }

  const title = nonEmpty.find((paragraph) => {
    const text = paragraph.text.trim()
    return text.length <= 48 && !macroIds.has(paragraph.id) && !detectExplicitHeadingLevel(text)
      && !isDateParagraph(text) && !/^(?:各|致|送)[^。；;]{1,35}[：:]$/u.test(text)
  })
  if (title) addMacro(title.id, 'title', 0.58, '按靠前且较短的段落进行演示猜测')

  const suggestions: NonNullable<StructureAnalysis['suggestions']> = []
  const headingSequence = [0, 0, 0, 0]
  const ordinal = ['一、', '（一）', '1. ', '（1）']
  for (const paragraph of nonEmpty) {
    if (macroIds.has(paragraph.id)) continue
    const text = paragraph.text.trim()
    const explicitLevel = detectExplicitHeadingLevel(text)
    const inferredLevel = unnumberedHeadings.test(text) ? 1 : undefined
    const level = explicitLevel ?? inferredLevel
    if (level) {
      headingSequence[level - 1] += 1
      roleById.set(paragraph.id, {
        id: paragraph.id,
        role: 'heading',
        level,
        confidence: explicitLevel ? 0.98 : 0.46,
        rationale: explicitLevel ? '本地显式序号规则匹配' : '本地关键词演示猜测，需人工复核',
      })
      if (!explicitLevel) {
        suggestions.push({
          paragraphId: paragraph.id,
          type: 'missing_heading_number',
          proposedText: `${ordinal[level - 1]}${text}`,
          reason: '本地关键词猜测为层级标题；仅提供编号建议，不会改写正文。',
        })
      }
      continue
    }
    roleById.set(paragraph.id, { id: paragraph.id, role: 'body', confidence: 0.45, rationale: '演示模式按正文保守处理' })
  }

  return {
    documentType,
    confidence: documentTypeHint === 'auto' ? (documentType === '其他' ? 0.38 : 0.54) : 0.62,
    blocks: nonEmpty.map((paragraph) => roleById.get(paragraph.id) ?? {
      id: paragraph.id,
      role: 'unknown',
      confidence: 0.25,
      rationale: '演示模式未识别此段，请人工确认',
    }),
    source: 'demo',
    demoReason,
    warnings: ['当前为演示模式，结构由本地规则猜测，不代表 DeepSeek 语义识别结果；请人工核对。'],
    suggestions,
  }
}
