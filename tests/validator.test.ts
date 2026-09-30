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
  it('accepts a consistent explicit heading level', () => {
    const analysis: StructureAnalysis = {
      documentType: '通知',
      confidence: 0.9,
      blocks: [
        { id: 0, role: 'title' },
        { id: 1, role: 'heading', level: 1 },
        { id: 2, role: 'body' },
      ],
    }
    expect(validateAnalysis(extracted, analysis).some((i) => i.code === 'HEADING_RULE_CONFLICT')).toBe(false)
  })

  it('flags a conflict between explicit numbering and AI level', () => {
    const analysis: StructureAnalysis = {
      documentType: '通知',
      confidence: 0.9,
      blocks: [
        { id: 0, role: 'title' },
        { id: 1, role: 'heading', level: 2 },
        { id: 2, role: 'body' },
      ],
    }
    expect(validateAnalysis(extracted, analysis).some((i) => i.code === 'HEADING_RULE_CONFLICT')).toBe(true)
  })
})
