import type { AnalyzeRequest, BodyResult, InputParagraph, MacroResult } from './schema'

interface Env {
  DEEPSEEK_API_KEY: string
  DEEPSEEK_MODEL?: string
  ALLOWED_ORIGINS?: string
}

const MAX_PARAGRAPHS = 1200
const MAX_TOTAL_CHARS = 120_000
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

function allowedOrigins(env: Env): Set<string> {
  return new Set((env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean))
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin') || ''
  const allowed = allowedOrigins(env)
  if (!origin || !allowed.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS,GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

function assertOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin')
  if (!origin || !allowedOrigins(env).has(origin)) throw new Error('ORIGIN_NOT_ALLOWED')
}

function sanitizeRequest(value: unknown): AnalyzeRequest {
  if (!value || typeof value !== 'object') throw new Error('INVALID_REQUEST')
  const raw = value as Partial<AnalyzeRequest>
  if (!Array.isArray(raw.paragraphs)) throw new Error('INVALID_PARAGRAPHS')
  if (raw.paragraphs.length > MAX_PARAGRAPHS) throw new Error('TOO_MANY_PARAGRAPHS')

  const paragraphs: InputParagraph[] = raw.paragraphs.map((p, index) => {
    if (!p || typeof p !== 'object') throw new Error(`INVALID_PARAGRAPH_${index}`)
    const q = p as InputParagraph
    if (!Number.isInteger(q.id) || typeof q.text !== 'string') throw new Error(`INVALID_PARAGRAPH_${index}`)
    return {
      id: q.id,
      text: q.text.slice(0, 8000),
      features: q.features
        ? {
            styleId: q.features.styleId?.slice(0, 100),
            alignment: q.features.alignment?.slice(0, 30),
            fontSizePt: q.features.fontSizePt,
            eastAsiaFont: q.features.eastAsiaFont?.slice(0, 100),
            latinFont: q.features.latinFont?.slice(0, 100),
            boldRatio: q.features.boldRatio,
            inTable: Boolean(q.features.inTable),
          }
        : undefined,
    }
  })

  const chars = paragraphs.reduce((sum, p) => sum + p.text.length, 0)
  if (chars > MAX_TOTAL_CHARS) throw new Error('DOCUMENT_TOO_LARGE')
  const allowedHints = new Set(['auto', '通知', '请示', '报告', '函', '会议纪要', '工作总结', '规章制度', '其他'])
  const documentTypeHint = allowedHints.has(String(raw.documentTypeHint)) ? (raw.documentTypeHint as AnalyzeRequest['documentTypeHint']) : 'auto'
  return { paragraphs, documentTypeHint }
}

async function deepseekJson<T>(env: Env, system: string, user: string, maxTokens = 8000): Promise<T> {
  const model = env.DEEPSEEK_MODEL || 'deepseek-chat'
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: maxTokens,
        }),
      })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(`DeepSeek HTTP ${response.status}: ${detail.slice(0, 500)}`)
      }
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const content = payload.choices?.[0]?.message?.content?.trim()
      if (!content) throw new Error('DeepSeek returned empty JSON content')
      return JSON.parse(content) as T
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('DeepSeek JSON request failed')
}

const macroSystem = `你是“公文文档结构恢复器”的第一阶段。你只做语义结构识别，不修改任何原文，不决定字体或版式。
输入来自 DOCX 的连续段落。原始字体、字号、加粗、对齐等可能全部错误，只能作为弱证据；必须优先根据全文语义、上下文和公文惯例判断。

任务：
1. 判断公文类型：通知、请示、报告、函、会议纪要、工作总结、规章制度、其他。
2. 识别宏观角色：title（标题）、recipient（主送机关）、attachment_note（正文中的附件说明）、attachment_marker（另页附件开头“附件”及顺序号）、attachment_title（附件标题）、issuer（发文单位署名）、date（成文日期）、annotation（附注）。
3. 不要在本阶段把普通正文和层级标题逐段分类；第二阶段处理。
4. ID 必须来自输入，不得虚构。不要输出空段落。
5. 如果用户传入非 auto 类型提示，把它视为强提示，但若内容明显冲突可纠正并在 warnings 说明。

必须只输出合法 json，格式：
{
  "documentType": "通知",
  "confidence": 0.95,
  "roles": [
    {"id": 0, "role": "title", "confidence": 0.99, "rationale": "..."}
  ],
  "warnings": []
}`

const bodySystem = `你是“公文文档结构恢复器”的第二阶段。你只负责把剩余正文段落恢复为 body 或 heading，并判断 heading 层级，不修改任何原文。
原始格式可能从头到尾完全相同，因此字体/字号/加粗只允许作为弱证据。必须利用连续上下文、主题组织关系和标题语义判断层级。

命题方给出的结构层次序数规范是：一级“一、”，二级“（一）”，三级“1.”，四级“（1）”。如果原文已有这些规范序号，它们是强证据；如果原文没有序号，也必须根据语义恢复合理层级。

规则：
- role 只能是 body、heading、unknown。
- heading 时 level 必须为 1/2/3/4。
- 不得虚构段落 ID。
- 不得把主标题、主送机关、附件、落款、日期再次纳入；这些 ID 会在输入中列为 excludedIds。
- 如果判断某标题缺少规范序号，可以给 suggestedNumber，但这只是建议，不会自动写入原文。
- parentId 只在有把握时给出，否则为 null。

必须只输出合法 json，格式：
{
  "blocks": [
    {"id": 3, "role": "heading", "level": 1, "confidence": 0.92, "parentId": null, "suggestedNumber": "一、", "rationale": "..."},
    {"id": 4, "role": "body", "confidence": 0.99, "parentId": 3}
  ],
  "suggestions": [
    {"paragraphId": 3, "type": "missing_heading_number", "proposedText": "一、总体要求", "reason": "语义上是一级标题且原文缺少序号"}
  ],
  "warnings": []
}`

function compactParagraphs(paragraphs: InputParagraph[]) {
  return paragraphs
    .filter((p) => p.text.trim())
    .map((p) => ({ id: p.id, text: p.text, features: p.features }))
}

function clampConfidence(value: unknown, fallback = 0.5): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

function normalizeMacro(raw: MacroResult, validIds: Set<number>, fallbackType: AnalyzeRequest['documentTypeHint']): MacroResult {
  const allowedTypes = new Set(['通知', '请示', '报告', '函', '会议纪要', '工作总结', '规章制度', '其他'])
  const allowedRoles = new Set(['title', 'recipient', 'attachment_note', 'attachment_marker', 'attachment_title', 'issuer', 'date', 'annotation'])
  const documentType = allowedTypes.has(raw.documentType) ? raw.documentType : fallbackType !== 'auto' ? fallbackType : '其他'
  const seen = new Set<number>()
  const roles = (Array.isArray(raw.roles) ? raw.roles : []).filter((item) => {
    if (!validIds.has(item.id) || !allowedRoles.has(item.role) || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
  return { documentType: documentType as MacroResult['documentType'], confidence: clampConfidence(raw.confidence), roles, warnings: raw.warnings || [] }
}

function normalizeBody(raw: BodyResult, validIds: Set<number>, excluded: Set<number>): BodyResult {
  const seen = new Set<number>()
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : []).filter((item) => {
    if (!validIds.has(item.id) || excluded.has(item.id) || seen.has(item.id)) return false
    if (!['body', 'heading', 'unknown'].includes(item.role)) return false
    if (item.role === 'heading' && ![1, 2, 3, 4].includes(Number(item.level))) return false
    seen.add(item.id)
    return true
  })
  return {
    blocks: blocks.map((x) => ({ ...x, confidence: clampConfidence(x.confidence) })),
    suggestions: Array.isArray(raw.suggestions) ? raw.suggestions.filter((s) => validIds.has(s.paragraphId)) : [],
    warnings: raw.warnings || [],
  }
}

async function analyze(req: AnalyzeRequest, env: Env) {
  const compact = compactParagraphs(req.paragraphs)
  const validIds = new Set(compact.map((p) => p.id))
  const macroRaw = await deepseekJson<MacroResult>(
    env,
    macroSystem,
    `documentTypeHint=${req.documentTypeHint}\nparagraphs=${JSON.stringify(compact)}`,
    6000,
  )
  const macro = normalizeMacro(macroRaw, validIds, req.documentTypeHint)
  const excluded = new Set(macro.roles.map((r) => r.id))
  const bodyInput = compact.filter((p) => !excluded.has(p.id))
  const bodyRaw = await deepseekJson<BodyResult>(
    env,
    bodySystem,
    `documentType=${macro.documentType}\nexcludedIds=${JSON.stringify([...excluded])}\nparagraphs=${JSON.stringify(bodyInput)}`,
    10000,
  )
  const body = normalizeBody(bodyRaw, validIds, excluded)

  // Any remaining non-empty paragraph is conservatively treated as body rather than silently dropped.
  const bodySeen = new Set(body.blocks.map((b) => b.id))
  for (const p of bodyInput) {
    if (!bodySeen.has(p.id)) body.blocks.push({ id: p.id, role: 'body', confidence: 0.35, rationale: 'AI 未返回该段，系统按正文保守兜底' })
  }

  const blocks = [
    ...macro.roles.map((r) => ({ id: r.id, role: r.role, confidence: clampConfidence(r.confidence), rationale: r.rationale })),
    ...body.blocks,
  ].sort((a, b) => a.id - b.id)

  return {
    documentType: macro.documentType,
    confidence: macro.confidence,
    blocks,
    suggestions: body.suggestions || [],
    warnings: [...(macro.warnings || []), ...(body.warnings || [])],
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request, env)
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin') || ''
      if (!origin || !allowedOrigins(env).has(origin)) return new Response(null, { status: 403 })
      return new Response(null, { status: 204, headers })
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'official-doc-ai-proxy' }, 200, headers)
    }

    if (request.method !== 'POST' || url.pathname !== '/v1/structure') return json({ error: 'not_found' }, 404, headers)

    try {
      assertOrigin(request, env)
      if (!env.DEEPSEEK_API_KEY) return json({ error: 'server_misconfigured', detail: 'DEEPSEEK_API_KEY is not configured.' }, 500, headers)
      const length = Number(request.headers.get('Content-Length') || 0)
      if (length > 2_000_000) return json({ error: 'payload_too_large' }, 413, headers)

      const req = sanitizeRequest(await request.json())
      const result = await analyze(req, env)
      const requestId = crypto.randomUUID()
      return json({ ...result, requestId }, 200, { ...headers, 'Cache-Control': 'no-store' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message === 'ORIGIN_NOT_ALLOWED') return json({ error: 'forbidden_origin' }, 403, headers)
      if (message.includes('TOO_MANY') || message.includes('DOCUMENT_TOO_LARGE')) return json({ error: 'document_too_large', detail: message }, 413, headers)
      if (message.startsWith('INVALID_')) return json({ error: 'invalid_request', detail: message }, 400, headers)
      return json({ error: 'analysis_failed', detail: message.slice(0, 800) }, 502, headers)
    }
  },
}
