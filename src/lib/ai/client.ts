import { getProxyUrl } from '../config'
import type { DocumentType, ExtractedParagraph, StructureAnalysis } from '../docx/types'
import { parseStructureAnalysis, type AnalyzeRequest } from './types'
import { createDemoAnalysis } from '../rules/heuristics'

export async function analyzeStructure(
  paragraphs: ExtractedParagraph[],
  documentTypeHint: DocumentType,
  signal?: AbortSignal,
): Promise<StructureAnalysis> {
  const totalCharacters = paragraphs.reduce((sum, paragraph) => sum + paragraph.text.length, 0)
  if (paragraphs.length > 1200 || totalCharacters > 120_000) {
    throw new Error('文档超长：演示和 DeepSeek 模式最多处理 1200 个段落、12 万字符。')
  }
  const base = getProxyUrl()
  if (!base) return createDemoAnalysis(paragraphs, documentTypeHint, '尚未配置 DeepSeek Worker，已使用本地演示规则。')

  const payload: AnalyzeRequest = {
    paragraphs: paragraphs.filter((paragraph) => paragraph.text.trim()),
    documentTypeHint,
  }
  let response: Response
  try {
    response = await fetch(`${base}/v1/structure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: signal ?? AbortSignal.timeout(45_000),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return createDemoAnalysis(paragraphs, documentTypeHint, `Worker 无法连接（${message}），已使用本地演示规则。`)
  }

  if (response.status === 404) {
    return createDemoAnalysis(paragraphs, documentTypeHint, 'Worker 地址或接口路径无效，已使用本地演示规则。')
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error(`AI 服务返回了不可解析的响应（HTTP ${response.status}）。`)
  }
  if (!response.ok) {
    const detail = typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string'
      ? data.detail
      : typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `AI 服务请求失败（HTTP ${response.status}）。`
    throw new Error(detail)
  }
  return parseStructureAnalysis(data, new Set(payload.paragraphs.map((paragraph) => paragraph.id)))
}
