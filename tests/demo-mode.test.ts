import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeStructure } from '../src/lib/ai/client'
import { setProxyUrl } from '../src/lib/config'

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('explicit offline demo mode', () => {
  it('uses local rules when no Worker endpoint is configured and makes no network request', async () => {
    vi.stubEnv('VITE_AI_ENDPOINT', '')
    vi.stubEnv('VITE_AI_PROXY_URL', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeStructure([
      { id: 0, text: '关于加强安全工作的通知', features: { inTable: false } },
      { id: 1, text: '一、总体要求', features: { inTable: false } },
    ], 'auto')

    expect(result.source).toBe('demo')
    expect(result.documentType).toBe('通知')
    expect(result.warnings?.[0]).toContain('演示模式')
    expect(result.blocks.find((block) => block.id === 1)?.level).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses an explicitly labeled demo result when the Worker cannot be reached', async () => {
    setProxyUrl('https://unreachable.example.workers.dev')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await analyzeStructure([{ id: 0, text: '关于工作的通知', features: { inTable: false } }], 'auto')
    expect(result.source).toBe('demo')
    expect(result.demoReason).toContain('Worker 无法连接')
    expect(result.warnings?.[0]).toContain('不代表 DeepSeek')
  })

  it('uses demo mode when the configured Worker route returns a non-JSON 404 page', async () => {
    setProxyUrl('https://worker.example.workers.dev')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 404,
      ok: false,
      json: vi.fn().mockRejectedValue(new SyntaxError('not JSON')),
    } as unknown as Response))

    const result = await analyzeStructure([{ id: 0, text: '关于工作的通知', features: { inTable: false } }], 'auto')
    expect(result.source).toBe('demo')
    expect(result.demoReason).toContain('Worker 地址或接口路径无效')
  })

  it('shows a clear document-length error before either local or remote analysis', async () => {
    const result = analyzeStructure([
      { id: 0, text: 'x'.repeat(120_001), features: { inTable: false } },
    ], 'auto')
    await expect(result).rejects.toThrow('文档超长')
  })
})
