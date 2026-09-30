import type { ExtractedDocument, StructureAnalysis } from '../lib/docx/types'

interface Props {
  extracted: ExtractedDocument
  analysis: StructureAnalysis
}

export default function AnalysisSummary({ extracted, analysis }: Props) {
  const count = (role: string) => analysis.blocks.filter((b) => b.role === role).length
  const headingCount = (level: number) => analysis.blocks.filter((b) => b.role === 'heading' && b.level === level).length
  const stats = [
    ['标题', count('title')],
    ['主送机关', count('recipient')],
    ['一级标题', headingCount(1)],
    ['二级标题', headingCount(2)],
    ['三级标题', headingCount(3)],
    ['四级标题', headingCount(4)],
    ['正文', count('body')],
    ['附件相关', count('attachment_note') + count('attachment_marker') + count('attachment_title')],
    ['落款 / 日期', count('issuer') + count('date')],
  ]

  return (
    <section className="card summary-card">
      <div className="summary-primary">
        <span className="eyebrow">DOCUMENT TYPE</span>
        <div className="document-type-row"><h3>{analysis.documentType}</h3><span>{Math.round(analysis.confidence * 100)}%</span></div>
        <p>模型根据全文内容与上下文关系判断文种，原始字体和样式只作为弱证据。</p>
        <div className="summary-meta">
          <span><b>{extracted.paragraphs.length}</b> 个 Word 段落</span>
          <span><b>≈ {extracted.estimatedPages}</b> 页</span>
          <span><b>{extracted.text.length}</b> 字符</span>
        </div>
      </div>
      <div className="stat-grid">
        {stats.map(([label, value]) => (
          <div className="stat" key={String(label)}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
