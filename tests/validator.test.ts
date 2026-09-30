import { describe, expect, it } from 'vitest'
import { validateAnalysis } from '../src/lib/docx/validator'
import type { ExtractedDocument, StructureAnalysis } from '../src/lib/docx/types'

const extracted: ExtractedDocument = {
  fileName: 'test.docx',
  text: '标题\n一、总体要求\n正文',
  estimatedPages: 1,
  paragraphs: [
    { id: 0, text: '标题', features: { inTable: false } },
    { id: 1, text: '一、总体要求', features: { inTable: false } },
    { id: 2, text: '正文', features: { inTable: false } },
  ],
}

describe('validateAnalysis', () => {
  it('accepts a consistent explicit heading level and complete AST', () => {
    const analysis: StructureAnalysis = {
      documentType: '通知',
      confidence: 0.9,
      blocks: [
        { id: 0, role: 'title' },
        { id: 1, role: 'heading', level: 1 },
        { id: 2, role: 'body' },
      ],
    }
    expect(validateAnalysis(extracted, analysis).some((issue) => issue.code === 'HEADING_RULE_CONFLICT')).toBe(false)
    expect(validateAnalysis(extracted, analysis).some((issue) => issue.code === 'MISSING_BLOCK')).toBe(false)
  })

  it('blocks formatting when explicit numbering conflicts with the AI level', () => {
    const analysis: StructureAnalysis = {
      documentType: '通知',
      confidence: 0.9,
      blocks: [
        { id: 0, role: 'title' },
        { id: 1, role: 'heading', level: 2 },
        { id: 2, role: 'body' },
      ],
    }
    expect(validateAnalysis(extracted, analysis).find((issue) => issue.code === 'HEADING_RULE_CONFLICT')?.severity).toBe('error')
  })

  it('reports missing roles and low confidence instead of silently accepting partial AI output', () => {
    const issues = validateAnalysis(extracted, {
      documentType: '通知',
      confidence: 0.42,
      blocks: [{ id: 0, role: 'title', confidence: 0.4 }],
    })
    expect(issues.some((issue) => issue.code === 'MISSING_BLOCK' && issue.paragraphId === 1)).toBe(true)
    expect(issues.some((issue) => issue.code === 'LOW_DOCUMENT_CONFIDENCE')).toBe(true)
    expect(issues.some((issue) => issue.code === 'LOW_BLOCK_CONFIDENCE')).toBe(true)
  })
})
