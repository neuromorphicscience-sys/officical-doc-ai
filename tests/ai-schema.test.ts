import { describe, expect, it } from 'vitest'
import { parseStructureAnalysis } from '../src/lib/ai/types'

const ids = new Set([0, 1])

describe('AI response JSON schema validation', () => {
  it('accepts a valid AST and marks it as a real DeepSeek response', () => {
    const parsed = parseStructureAnalysis({
      documentType: '通知',
      confidence: 0.9,
      model: 'deepseek-chat',
      blocks: [
        { id: 0, role: 'title', confidence: 0.95 },
        { id: 1, role: 'heading', level: 1, confidence: 0.9, parentId: null },
      ],
      suggestions: [],
      warnings: [],
    }, ids)
    expect(parsed.source).toBe('deepseek')
    expect(parsed.blocks[1].level).toBe(1)
  })

  it.each([
    [{ documentType: '通知', confidence: 0.9, blocks: [{ id: 0, role: 'heading', level: 5 }] }, /层级必须是 1 到 4/],
    [{ documentType: 'made-up', confidence: 0.9, blocks: [] }, /documentType/],
    [{ documentType: '通知', confidence: 1.1, blocks: [] }, /confidence/],
    [{ documentType: '通知', confidence: 0.9, blocks: [{ id: 99, role: 'body' }] }, /段落 ID 不存在/],
    [{ documentType: '通知', confidence: 0.9, blocks: [{ id: 0, role: 'body' }, { id: 0, role: 'body' }] }, /重复标注/],
    [null, /顶层必须是对象/],
  ])('rejects invalid or out-of-contract responses', (value, message) => {
    expect(() => parseStructureAnalysis(value, ids)).toThrow(message)
  })
})
