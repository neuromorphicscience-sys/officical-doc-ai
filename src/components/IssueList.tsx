import type { ValidationIssue } from '../lib/docx/validator'

export default function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) {
    return (
      <section className="card issue-card clean">
        <div className="issue-card-icon">✓</div>
        <div><span className="eyebrow">AUTOMATIC VALIDATION</span><h3>未发现结构冲突</h3><p>显式序号规则与 AI 语义判断未检测到阻断性矛盾。</p></div>
      </section>
    )
  }

  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.filter((issue) => issue.severity === 'warning').length
  return (
    <section className="card issue-card">
      <div className="card-title-row">
        <div><div className="eyebrow">AUTOMATIC VALIDATION</div><h3>结构冲突与检查项</h3></div>
        <div className="issue-counts"><span className="danger">{errors} 错误</span><span>{warnings} 检查</span></div>
      </div>
      <div className="issue-list">
        {issues.map((issue, i) => (
          <div className={`issue ${issue.severity}`} key={`${issue.code}-${i}`}>
            <span className="issue-badge">{issue.severity === 'error' ? '错误' : issue.severity === 'warning' ? '检查' : '提示'}</span>
            <span>{issue.message}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
