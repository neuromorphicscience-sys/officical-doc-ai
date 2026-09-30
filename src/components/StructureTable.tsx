import type { BlockRole, ExtractedDocument, StructureAnalysis } from '../lib/docx/types'

interface Props {
  extracted: ExtractedDocument
  analysis: StructureAnalysis
  onBlockChange?: (id: number, role: BlockRole, level?: 1 | 2 | 3 | 4) => void
}

const roleText: Record<string, string> = {
  title: '标题', recipient: '主送机关', body: '正文', heading: '层级标题', attachment_note: '附件说明',
  attachment_marker: '附件标识', attachment_title: '附件标题', issuer: '发文单位', date: '成文日期',
  annotation: '附注', unknown: '待确认',
}

const editableRoles: Array<{ value: BlockRole; label: string }> = [
  { value: 'title', label: '标题' },
  { value: 'recipient', label: '主送机关' },
  { value: 'body', label: '正文' },
  { value: 'heading', label: '层级标题' },
  { value: 'attachment_note', label: '附件说明' },
  { value: 'attachment_marker', label: '附件标识' },
  { value: 'attachment_title', label: '附件标题' },
  { value: 'issuer', label: '发文单位' },
  { value: 'date', label: '成文日期' },
  { value: 'annotation', label: '附注' },
  { value: 'unknown', label: '待确认' },
]

export default function StructureTable({ extracted, analysis, onBlockChange }: Props) {
  const blockMap = new Map(analysis.blocks.map((b) => [b.id, b]))
  const rows = extracted.paragraphs.filter((p) => p.text.trim())

  return (
    <section className="card structure-card">
      <div className="card-title-row">
        <div><div className="eyebrow">DOCUMENT AST</div><h3>段落语义映射</h3></div>
        <span className="count-badge">{rows.length} 段</span>
      </div>
      <p className="muted-copy">这里展示模型恢复出的逻辑结构。原文样式可能错误，因此最终角色主要依据全文语义与上下文确定。</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>段落</th><th>原文</th><th>语义角色</th><th>置信度</th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const block = blockMap.get(p.id)
              const role = block ? roleText[block.role] ?? block.role : '未返回'
              const confidence = block?.confidence !== undefined ? Math.round(block.confidence * 100) : undefined
              return (
                <tr key={p.id}>
                  <td><span className="paragraph-id">P{p.id}</span></td>
                  <td className="text-cell" title={p.text}>{p.text}</td>
                  <td>
                    {onBlockChange ? (
                      <div className="role-editor">
                        <select
                          aria-label={`段落 P${p.id} 的角色`}
                          value={block?.role ?? 'unknown'}
                          onChange={(event) => {
                            const nextRole = event.target.value as BlockRole
                            onBlockChange(p.id, nextRole, nextRole === 'heading' ? block?.level ?? 1 : undefined)
                          }}
                        >
                          {editableRoles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        {block?.role === 'heading' && (
                          <select
                            aria-label={`段落 P${p.id} 的标题层级`}
                            value={block.level ?? 1}
                            onChange={(event) => onBlockChange(p.id, 'heading', Number(event.target.value) as 1 | 2 | 3 | 4)}
                          >
                            {[1, 2, 3, 4].map((level) => <option key={level} value={level}>{level}级</option>)}
                          </select>
                        )}
                      </div>
                    ) : (
                      <span className={`role-pill role-${block?.role ?? 'unknown'}`}>{block?.role === 'heading' ? `${block.level ?? 1}级标题` : role}</span>
                    )}
                  </td>
                  <td>{confidence !== undefined ? <span className="confidence-cell"><i style={{ width: `${confidence}%` }} /><b>{confidence}%</b></span> : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
