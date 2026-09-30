import type { ExtractedDocument, StructureAnalysis } from './types'

export interface ValidationIssue {
  severity: 'info' | 'warning' | 'error'
  code: string
  message: string
  paragraphId?: number
}

const explicitHeading = [
  /^\s*[一二三四五六七八九十百]+、/,
  /^\s*（[一二三四五六七八九十百]+）/,
  /^\s*\d+[.．]/,
  /^\s*（\d+）/,
]

export function validateAnalysis(extracted: ExtractedDocument, analysis: StructureAnalysis): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const ids = new Set<number>()

  for (const block of analysis.blocks) {
    if (ids.has(block.id)) {
      issues.push({ severity: 'error', code: 'DUPLICATE_BLOCK', message: `段落 ${block.id} 出现重复结构标注。`, paragraphId: block.id })
    }
    ids.add(block.id)
    if (block.id < 0 || block.id >= extracted.paragraphs.length) {
      issues.push({ severity: 'error', code: 'OUT_OF_RANGE', message: `AI 返回了不存在的段落 ID ${block.id}。`, paragraphId: block.id })
    }
    if (block.role === 'heading' && !block.level) {
      issues.push({ severity: 'warning', code: 'HEADING_NO_LEVEL', message: `段落 ${block.id} 被识别为标题但没有层级，将按一级标题处理。`, paragraphId: block.id })
    }
  }

  const titleCount = analysis.blocks.filter((b) => b.role === 'title').length
  if (titleCount === 0) issues.push({ severity: 'warning', code: 'NO_TITLE', message: '未识别到公文标题，建议人工检查。' })
  if (titleCount > 1) issues.push({ severity: 'warning', code: 'MULTI_TITLE', message: `识别到 ${titleCount} 个标题段落，建议确认主标题范围。` })

  for (const p of extracted.paragraphs) {
    if (!p.text.trim()) continue
    const block = analysis.blocks.find((b) => b.id === p.id)
    const ruleLevel = explicitHeading.findIndex((r) => r.test(p.text)) + 1
    if (ruleLevel && block?.role === 'heading' && block.level && block.level !== ruleLevel) {
      issues.push({
        severity: 'warning',
        code: 'HEADING_RULE_CONFLICT',
        message: `段落 ${p.id} 的显式序号更像 ${ruleLevel} 级标题，但 AI 判断为 ${block.level} 级。`,
        paragraphId: p.id,
      })
    }
  }

  if (extracted.estimatedPages > 1) {
    issues.push({ severity: 'info', code: 'PAGE_NUMBER_ESTIMATE', message: `浏览器估算约 ${extracted.estimatedPages} 页，将添加奇偶页页码；最终分页以 Word 渲染为准。` })
  }

  if (analysis.documentType === '其他') {
    issues.push({ severity: 'warning', code: 'UNKNOWN_DOC_TYPE', message: '公文类型未能可靠归类，将主要应用统一基础公文规范。' })
  }
  return issues
}
