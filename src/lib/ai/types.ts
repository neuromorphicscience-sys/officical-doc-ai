import type { DocumentType, ExtractedParagraph, StructureAnalysis } from '../docx/types'

export interface AnalyzeRequest {
  paragraphs: ExtractedParagraph[]
  documentTypeHint: DocumentType
}

export interface AnalyzeResponse extends StructureAnalysis {
  requestId?: string
  model?: string
}
