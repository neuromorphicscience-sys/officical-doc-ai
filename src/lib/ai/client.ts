import { getProxyUrl } from '../config'
import type { DocumentType, ExtractedParagraph, StructureAnalysis } from '../docx/types'
import type { AnalyzeRequest, AnalyzeResponse } from './types'

export async function analyzeStructure(
  paragraphs: ExtractedParagraph[],
  documentTypeHint: DocumentType,
  signal?: AbortSignal,
): Promise<StructureAnalysis> {
  const base = getProxyUrl()
  if (!base) throw new Error('尚未配置 DeepSeek 安全代理地址。请在“AI 服务设置”中填写 Cloudflare Worker URL。')

  const payload: AnalyzeRequest = { paragraphs, documentTypeHint }
  const response = await fetch(`${base}/v1/structure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  let data: AnalyzeResponse | { error?: string; detail?: string }
  try {
    data = await response.json()
  } catch {
    throw new Error(`AI 服务返回了不可解析的响应（HTTP ${response.status}）。`)
  }
  if (!response.ok) {
    const err = data as { error?: string; detail?: string }
    throw new Error(err.detail || err.error || `AI 服务请求失败（HTTP ${response.status}）。`)
  }
  return data as AnalyzeResponse
}
