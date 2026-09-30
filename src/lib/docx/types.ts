export type DocumentType =
  | 'auto'
  | '通知'
  | '请示'
  | '报告'
  | '函'
  | '会议纪要'
  | '工作总结'
  | '规章制度'
  | '其他'

export type BlockRole =
  | 'title'
  | 'recipient'
  | 'body'
  | 'heading'
  | 'attachment_note'
  | 'attachment_marker'
  | 'attachment_title'
  | 'issuer'
  | 'date'
  | 'annotation'
  | 'unknown'

export interface ParagraphFeatures {
  styleId?: string
  alignment?: string
  fontSizePt?: number
  eastAsiaFont?: string
  latinFont?: string
  boldRatio?: number
  inTable: boolean
}

export interface ExtractedParagraph {
  id: number
  text: string
  features: ParagraphFeatures
}

export interface ExtractedDocument {
  fileName: string
  paragraphs: ExtractedParagraph[]
  text: string
  estimatedPages: number
}

export interface StructureBlock {
  id: number
  role: BlockRole
  level?: 1 | 2 | 3 | 4
  confidence?: number
  parentId?: number | null
  suggestedNumber?: string | null
  rationale?: string
}

export interface StructureAnalysis {
  documentType: Exclude<DocumentType, 'auto'>
  confidence: number
  blocks: StructureBlock[]
  source?: 'deepseek' | 'demo'
  demoReason?: string
  model?: string
  warnings?: string[]
  suggestions?: Array<{
    paragraphId: number
    type: 'missing_heading_number' | 'text_normalization' | 'review'
    proposedText?: string
    reason: string
  }>
}

export interface FormatChange {
  paragraphId?: number
  category: string
  description: string
}

export interface FormatResult {
  blob: Blob
  changes: FormatChange[]
  beforeHash: string
  afterHash: string
  contentPreserved: boolean
  originalCharacters: number
  outputCharacters: number
  addedCharacters: number
  deletedCharacters: number
  modifiedCharacters: number
}
