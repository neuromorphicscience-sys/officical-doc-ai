export type DocumentTypeHint =
  | 'auto'
  | '通知'
  | '请示'
  | '报告'
  | '函'
  | '会议纪要'
  | '工作总结'
  | '规章制度'
  | '其他'

export interface InputParagraph {
  id: number
  text: string
  features?: {
    styleId?: string
    alignment?: string
    fontSizePt?: number
    eastAsiaFont?: string
    latinFont?: string
    boldRatio?: number
    inTable?: boolean
  }
}

export interface AnalyzeRequest {
  paragraphs: InputParagraph[]
  documentTypeHint: DocumentTypeHint
}

export interface MacroResult {
  documentType: Exclude<DocumentTypeHint, 'auto'>
  confidence: number
  roles: Array<{
    id: number
    role: 'title' | 'recipient' | 'attachment_note' | 'attachment_marker' | 'attachment_title' | 'issuer' | 'date' | 'annotation'
    confidence?: number
    rationale?: string
  }>
  warnings?: string[]
}

export interface BodyResult {
  blocks: Array<{
    id: number
    role: 'body' | 'heading' | 'unknown'
    level?: 1 | 2 | 3 | 4
    confidence?: number
    parentId?: number | null
    suggestedNumber?: string | null
    rationale?: string
  }>
  suggestions?: Array<{
    paragraphId: number
    type: 'missing_heading_number' | 'text_normalization' | 'review'
    proposedText?: string
    reason: string
  }>
  warnings?: string[]
}
