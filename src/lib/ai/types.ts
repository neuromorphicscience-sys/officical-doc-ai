import type { DocumentType, ExtractedParagraph, StructureAnalysis, StructureBlock } from '../docx/types'

export interface AnalyzeRequest {
  paragraphs: ExtractedParagraph[]
  documentTypeHint: DocumentType
}

export interface AnalyzeResponse extends StructureAnalysis {
  requestId?: string
}

const documentTypes = new Set(['通知', '请示', '报告', '函', '会议纪要', '工作总结', '规章制度', '其他'])
const roles = new Set(['title', 'recipient', 'body', 'heading', 'attachment_note', 'attachment_marker', 'attachment_title', 'issuer', 'date', 'annotation', 'unknown'])
const suggestionTypes = new Set(['missing_heading_number', 'text_normalization', 'review'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

export function parseStructureAnalysis(value: unknown, validIds: ReadonlySet<number>): AnalyzeResponse {
  if (!isRecord(value)) throw new Error('AI 返回 JSON 无效：顶层必须是对象。')
  if (typeof value.documentType !== 'string' || !documentTypes.has(value.documentType)) {
    throw new Error('AI 返回 JSON 无效：documentType 不在允许范围内。')
  }
  if (!isConfidence(value.confidence)) throw new Error('AI 返回 JSON 无效：confidence 必须在 0 到 1 之间。')
  if (!Array.isArray(value.blocks)) throw new Error('AI 返回 JSON 无效：blocks 必须是数组。')

  const seen = new Set<number>()
  const blocks: StructureBlock[] = value.blocks.map((item, index) => {
    if (!isRecord(item) || !Number.isInteger(item.id) || !validIds.has(item.id as number)) {
      throw new Error(`AI 返回 JSON 无效：blocks[${index}] 的段落 ID 不存在。`)
    }
    const id = item.id as number
    if (seen.has(id)) throw new Error(`AI 返回 JSON 无效：段落 ${id} 被重复标注。`)
    seen.add(id)
    if (typeof item.role !== 'string' || !roles.has(item.role)) {
      throw new Error(`AI 返回 JSON 无效：段落 ${id} 的 role 不合法。`)
    }
    const role = item.role as StructureBlock['role']
    let level: StructureBlock['level']
    if (role === 'heading') {
      if (![1, 2, 3, 4].includes(Number(item.level)) || !Number.isInteger(item.level)) {
        throw new Error(`AI 返回 JSON 无效：段落 ${id} 的标题层级必须是 1 到 4。`)
      }
      level = item.level as StructureBlock['level']
    } else if (item.level !== undefined) {
      throw new Error(`AI 返回 JSON 无效：非标题段落 ${id} 不能带 level。`)
    }
    if (item.confidence !== undefined && !isConfidence(item.confidence)) {
      throw new Error(`AI 返回 JSON 无效：段落 ${id} 的 confidence 不合法。`)
    }
    if (item.parentId !== undefined && item.parentId !== null && (!Number.isInteger(item.parentId) || !validIds.has(item.parentId as number))) {
      throw new Error(`AI 返回 JSON 无效：段落 ${id} 的 parentId 不存在。`)
    }
    if (item.rationale !== undefined && typeof item.rationale !== 'string') {
      throw new Error(`AI 返回 JSON 无效：段落 ${id} 的 rationale 必须是字符串。`)
    }
    if (item.suggestedNumber !== undefined && item.suggestedNumber !== null && typeof item.suggestedNumber !== 'string') {
      throw new Error(`AI 返回 JSON 无效：段落 ${id} 的 suggestedNumber 必须是字符串。`)
    }
    return {
      id,
      role,
      ...(level ? { level } : {}),
      ...(item.confidence === undefined ? {} : { confidence: item.confidence as number }),
      ...(item.parentId === undefined ? {} : { parentId: item.parentId as number | null }),
      ...(item.suggestedNumber === undefined ? {} : { suggestedNumber: item.suggestedNumber as string | null }),
      ...(item.rationale === undefined ? {} : { rationale: item.rationale as string }),
    }
  })

  if (value.warnings !== undefined && (!Array.isArray(value.warnings) || value.warnings.some((item) => typeof item !== 'string'))) {
    throw new Error('AI 返回 JSON 无效：warnings 必须是字符串数组。')
  }
  if (value.suggestions !== undefined && !Array.isArray(value.suggestions)) {
    throw new Error('AI 返回 JSON 无效：suggestions 必须是数组。')
  }
  const suggestions = (value.suggestions ?? []).map((item, index) => {
    if (!isRecord(item) || !Number.isInteger(item.paragraphId) || !validIds.has(item.paragraphId as number)
      || typeof item.type !== 'string' || !suggestionTypes.has(item.type) || typeof item.reason !== 'string'
      || (item.proposedText !== undefined && typeof item.proposedText !== 'string')) {
      throw new Error(`AI 返回 JSON 无效：suggestions[${index}] 不符合接口结构。`)
    }
    return {
      paragraphId: item.paragraphId as number,
      type: item.type as NonNullable<StructureAnalysis['suggestions']>[number]['type'],
      reason: item.reason,
      ...(item.proposedText === undefined ? {} : { proposedText: item.proposedText as string }),
    }
  })

  return {
    documentType: value.documentType as AnalyzeResponse['documentType'],
    confidence: value.confidence,
    blocks,
    source: 'deepseek',
    ...(typeof value.model === 'string' ? { model: value.model } : {}),
    ...(typeof value.requestId === 'string' ? { requestId: value.requestId } : {}),
    warnings: (value.warnings ?? []) as string[],
    suggestions,
  }
}
