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
  if (paragraphs.some(paragraph => paragraph.text.length > 8000)) throw new Error('单个段落超过 8000 字符，请在 Word 中分段后重试。')
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
    const code = typeof data === 'object' && data !== null && 'error' in data ? String(data.error) : ''
    const messages: Record<string, string> = {
      rate_limited: 'AI 请求较频繁，请等待一分钟后重试。',
      analysis_failed: 'AI 分析失败或超时，请稍后重试；也可拆分较长文档。',
      invalid_ai_json: 'AI 返回的结构数据无效，请重试；原始文件未被修改。',
      document_too_large: '文档超过支持范围，请拆分后重试。',
      payload_too_large: '文档请求过大，请拆分文档后重试。',
      server_misconfigured: 'AI 服务暂不可用，请稍后重试或检查代理服务配置。',
      forbidden_origin: '当前站点未获 AI 服务访问许可，请使用正式生产网站。',
      invalid_request: '文档结构未通过 AI 服务校验，请检查单段长度或重新另存文档后重试。',
    }
    throw new Error(messages[code] || detail)
  }
  return parseStructureAnalysis(data, new Set(payload.paragraphs.map((paragraph) => paragraph.id)))
}
