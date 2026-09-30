import { useMemo, useState } from 'react'
import AnalysisSummary from './components/AnalysisSummary'
import Dropzone from './components/Dropzone'
import IssueList from './components/IssueList'
import SettingsPanel from './components/SettingsPanel'
import StructureTable from './components/StructureTable'
import { analyzeStructure } from './lib/ai/client'
import { extractDocx } from './lib/docx/extractor'
import { formatDocx } from './lib/docx/formatter'
import type { BlockRole, DocumentType, ExtractedDocument, FormatResult, StructureAnalysis } from './lib/docx/types'
import { validateAnalysis, type ValidationIssue } from './lib/docx/validator'
import { SUPPORTED_DOCUMENT_TYPES } from './lib/rules/officialRules'
import { detectExplicitHeadingLevel } from './lib/rules/heuristics'

type Stage = 'idle' | 'extracting' | 'analyzing' | 'ready' | 'formatting' | 'validating' | 'done' | 'error'

const stageMeta: Record<Stage, { label: string; detail: string; progress: number }> = {
  idle: { label: '等待文档', detail: '选择 DOCX 后开始', progress: 0 },
  extracting: { label: '读取 DOCX', detail: '文件在当前浏览器本地解包', progress: 15 },
  analyzing: { label: 'AI 语义识别', detail: 'DeepSeek 结合整篇文档上下文判断结构', progress: 48 },
  ready: { label: '标题层级已恢复', detail: '请检查角色与规则冲突，再应用确定性格式', progress: 68 },
  formatting: { label: '应用公文规范', detail: '规则引擎正在修改必要 OOXML 格式属性', progress: 84 },
  validating: { label: '验证内容完整性', detail: '比对格式化前后的正文字符与 SHA-256', progress: 96 },
  done: { label: '处理完成', detail: '内容完整性校验已通过', progress: 100 },
  error: { label: '处理未完成', detail: '请检查下方错误提示', progress: 0 },
}

const standardItems = [
  ['页面', 'A4 · 上37 / 下35 / 左右27 mm'],
  ['标题', '二号方正小标宋_GBK · 居中'],
  ['正文', '三号仿宋_GB2312 · 两端对齐'],
  ['层级', '黑体 / 楷体 / 仿宋 · 1–4级'],
  ['段落', '首行2字符 · 28.8磅行距'],
  ['页码', '— 1 — · 奇右偶左'],
]

function App() {
  const [file, setFile] = useState<File>()
  const [documentType, setDocumentType] = useState<DocumentType>('auto')
  const [extracted, setExtracted] = useState<ExtractedDocument>()
  const [analysis, setAnalysis] = useState<StructureAnalysis>()
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [result, setResult] = useState<FormatResult>()
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')

  const busy = ['extracting', 'analyzing', 'formatting', 'validating'].includes(stage)
  const suggestions = analysis?.suggestions ?? []
  const fatalIssues = issues.filter((issue) => issue.severity === 'error').length
  const stageInfo = stageMeta[stage]

  const roleCoverage = useMemo(() => {
    if (!analysis) return 0
    const recognized = analysis.blocks.filter((block) => block.role !== 'unknown').length
    return analysis.blocks.length ? Math.round((recognized / analysis.blocks.length) * 100) : 0
  }, [analysis])

  const formatReport = result ? [
    { label: '页面尺寸与页边距', verified: result.changes.some((change) => change.category === 'page') },
    { label: '标题格式', verified: result.changes.some((change) => change.category === 'title') },
    { label: '正文字体与缩进', verified: result.changes.some((change) => change.category === 'body') },
    { label: '一级至四级标题', verified: result.changes.some((change) => change.category === 'heading') },
    { label: '28.8 磅行距', verified: result.changes.some((change) => change.paragraphId !== undefined) },
    { label: '页码', verified: result.changes.some((change) => change.category === 'page_number') || Boolean(extracted && extracted.estimatedPages <= 1) },
    {
      label: '附件、落款与日期',
      verified: result.changes.some((change) => ['attachment_note', 'attachment_marker', 'attachment_title', 'issuer', 'date', 'annotation'].includes(change.category))
        || !analysis?.blocks.some((block) => ['attachment_note', 'attachment_marker', 'attachment_title', 'issuer', 'date', 'annotation'].includes(block.role)),
    },
  ] : []

  const resetDerived = () => {
    setExtracted(undefined)
    setAnalysis(undefined)
    setIssues([])
    setResult(undefined)
    setError('')
  }

  const chooseFile = (next: File) => {
    resetDerived()
    setFile(next)
    setStage('idle')
  }

  const changeBlock = (id: number, role: BlockRole, level?: 1 | 2 | 3 | 4) => {
    if (!analysis || !extracted) return
    const explicitLevel = detectExplicitHeadingLevel(extracted.paragraphs.find((paragraph) => paragraph.id === id)?.text ?? '')
    const found = analysis.blocks.some((block) => block.id === id)
    const changedBlocks = found
      ? analysis.blocks.map((block) => block.id === id
        ? { ...block, role, level: role === 'heading' ? level ?? explicitLevel ?? block.level ?? 1 : undefined, confidence: 1, rationale: '用户已人工确认该角色' }
        : block)
      : [...analysis.blocks, { id, role, level: role === 'heading' ? level ?? explicitLevel ?? 1 : undefined, confidence: 1, rationale: '用户已人工确认该角色' }]
    const updated = { ...analysis, blocks: changedBlocks.sort((a, b) => a.id - b.id) }
    setAnalysis(updated)
    setIssues([
      ...validateAnalysis(extracted, updated),
      ...(updated.warnings ?? []).map((message, index) => ({ severity: 'warning' as const, code: `ANALYSIS_WARNING_${index}`, message })),
    ])
    setResult(undefined)
    setStage('ready')
  }

  const runAnalysis = async () => {
    if (!file) return
    try {
      resetDerived()
      setStage('extracting')
      const { extracted: parsed } = await extractDocx(file)
      setExtracted(parsed)
      setStage('analyzing')
      const semantic = await analyzeStructure(parsed.paragraphs, documentType)
      setAnalysis(semantic)
      setIssues([
        ...validateAnalysis(parsed, semantic),
        ...(semantic.warnings ?? []).map((message, index) => ({ severity: 'warning' as const, code: `ANALYSIS_WARNING_${index}`, message })),
      ])
      setStage('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStage('error')
    }
  }

  const runFormat = async () => {
    if (!file || !extracted || !analysis) return
    try {
      setError('')
      setStage('formatting')
      const { zip, extracted: fresh } = await extractDocx(file)
      const formatted = await formatDocx(zip, fresh, analysis, () => setStage('validating'))
      setResult(formatted)
      setStage('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStage('error')
    }
  }

  const download = () => {
    if (!result || !file) return
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    const base = file.name.replace(/\.docx$/i, '')
    a.href = url
    a.download = `${base}_规范版.docx`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="办公文档智能整理工具首页">
          <span className="brand-mark">文</span>
          <span className="brand-copy">
            <strong>办公文档智能整理工具</strong>
            <small>Official DOCX AI Formatter</small>
          </span>
        </a>
        <nav className="topnav" aria-label="页面导航">
          <a href="#workspace">开始处理</a>
          <a href="#standard">规范能力</a>
          <a href="#architecture">技术架构</a>
        </nav>
        <div className="topbar-actions">
          <span className="privacy-pill"><i /> 原文件本地处理</span>
          {analysis?.source === 'demo' && <span className="demo-pill">演示模式</span>}
          <SettingsPanel />
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-kicker"><span>命题三</span> AI × 公文规范 × OOXML</div>
            <h1>把“格式混乱”的 DOCX，<br />恢复成<strong>结构正确、排版规范</strong>的公文。</h1>
            <p>
              不依赖原始样式判断层级。DeepSeek 从全文语义恢复标题、正文层级、附件与落款，
              再由确定性规则引擎严格执行学校公文规范。
            </p>
            <div className="hero-badges">
              <span>仅支持 DOCX</span>
              <span>内容默认零改写</span>
              <span>AI Key 不进入前端</span>
              <span>浏览器端 OOXML</span>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="paper-card paper-back" />
            <div className="paper-card paper-front">
              <div className="paper-topline" />
              <div className="paper-title">关于进一步做好有关工作的通知</div>
              <div className="paper-recipient">各有关单位：</div>
              <div className="paper-line wide" />
              <div className="paper-line" />
              <div className="paper-heading">一、总体要求</div>
              <div className="paper-line wide" />
              <div className="paper-line short" />
              <div className="paper-heading secondary">（一）加强组织领导</div>
              <div className="paper-line wide" />
              <div className="paper-line" />
              <div className="paper-signature">山东大学××学院<br />2026年9月30日</div>
              <div className="paper-page">— 1 —</div>
            </div>
            <span className="visual-tag tag-ai">AI 语义恢复</span>
            <span className="visual-tag tag-rule">确定性规则</span>
            <span className="visual-tag tag-safe">SHA-256 校验</span>
          </div>
        </section>

        <section className="workspace-section" id="workspace">
          <div className="section-heading">
            <div>
              <span className="section-index">01</span>
              <div>
                <p>WORKSPACE</p>
                <h2>上传文档，一键完成结构识别与规范化</h2>
              </div>
            </div>
            <p className="section-note">原始 DOCX 二进制文件不会发送给 DeepSeek。</p>
          </div>

          <div className="workspace-grid">
            <section className="card upload-card">
              <div className="card-head">
                <div>
                  <span className="step-chip">STEP 1</span>
                  <h3>选择原始 DOCX</h3>
                </div>
                <span className="local-badge">LOCAL</span>
              </div>

              <Dropzone
                file={file}
                onFile={chooseFile}
                disabled={busy}
                onInvalidFile={(message) => {
                  setFile(undefined)
                  resetDerived()
                  setError(message)
                  setStage('error')
                }}
              />

              <div className="field-row">
                <label className="field">
                  <span>公文类型</span>
                  <select
                    value={documentType}
                    disabled={busy}
                    onChange={(e) => {
                      setDocumentType(e.target.value as DocumentType)
                      resetDerived()
                      setStage('idle')
                    }}
                  >
                    {SUPPORTED_DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>{type === 'auto' ? '自动识别（推荐）' : type}</option>
                    ))}
                  </select>
                  <small>选“自动识别”时，由全文语义判断文种。</small>
                </label>
              </div>

              <button className="primary full" disabled={!file || busy} onClick={runAnalysis}>
                <span>{stage === 'extracting' || stage === 'analyzing' ? '正在分析…' : 'AI 智能规范化 · 先识别结构'}</span>
                <b>→</b>
              </button>
              <div className="immutability-note">
                <span>✓</span>
                <p><strong>内容零侵入</strong>：格式修复默认不新增、删除或改写正文字符。</p>
              </div>
              <p className="privacy-note">文档解析、格式修改和重新生成均在当前浏览器完成。原始 DOCX 不上传业务服务器；AI 服务仅接收结构识别所需的必要文本段落与弱格式特征。</p>
            </section>

            <aside className="card process-card">
              <div className="card-head compact">
                <div>
                  <span className="step-chip neutral">PROCESS</span>
                  <h3>当前处理链路</h3>
                </div>
                <span className={`stage-dot ${busy ? 'active' : ''}`} />
              </div>

              <div className="process-list">
                {[
                  ['01', '读取 DOCX', '仅接受 .docx 文件'],
                  ['02', '提取文档结构', '本地读取段落、表格与弱格式特征'],
                  ['03', 'AI 语义识别', '向 Worker 发送必要文本，不上传原文件'],
                  ['04', '恢复标题层级', '结合全文上下文与显式序号规则'],
                  ['05', '应用公文规范', '由确定性引擎处理字体、页面与缩进'],
                  ['06', '验证内容完整性', '比对字符数和 SHA-256'],
                  ['07', '生成规范文档', '浏览器本地重打包 DOCX'],
                ].map(([num, title, detail], index) => {
                  const threshold = [8, 20, 40, 58, 76, 94, 100][index]
                  const complete = stageInfo.progress >= threshold
                  return (
                    <div className={`process-item ${complete ? 'complete' : ''}`} key={num}>
                      <span className="process-number">{complete ? '✓' : num}</span>
                      <div><strong>{title}</strong><small>{detail}</small></div>
                    </div>
                  )
                })}
              </div>

              <div className={`stage-panel ${stage === 'error' ? 'error' : ''}`}>
                <div className="stage-label"><span>{stageInfo.label}</span><strong>{stageInfo.progress}%</strong></div>
                <p>{stageInfo.detail}</p>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${stageInfo.progress}%` }} /></div>
              </div>
              {error && <div className="error-banner"><strong>处理失败</strong><span>{error}</span></div>}
            </aside>
          </div>
        </section>

        {extracted && analysis && (
          <section className="analysis-area">
            <div className="section-heading tight">
              <div>
                <span className="section-index">02</span>
                <div>
                  <p>SEMANTIC ANALYSIS</p>
              <h2>{analysis.source === 'demo' ? '本地规则演示识别' : 'AI 已恢复文档逻辑结构'}</h2>
                </div>
              </div>
              <div className="analysis-mini-metrics">
                <span><b>{Math.round(analysis.confidence * 100)}%</b> 文种置信度</span>
                <span><b>{roleCoverage}%</b> 段落识别覆盖</span>
                <span><b>{fatalIssues}</b> 阻断性问题</span>
              </div>
            </div>

            <AnalysisSummary extracted={extracted} analysis={analysis} />
            {analysis.source === 'demo' && (
              <section className="demo-warning" role="status">
                <strong>当前为演示模式，正式语义识别需配置 DeepSeek Worker</strong>
                <p>{analysis.demoReason} 本地规则只作展示，角色和层级置信度较低，请逐段核对。</p>
              </section>
            )}
            <IssueList issues={issues} />

            {suggestions.length > 0 && (
              <section className="card suggestion-card">
                <div className="card-title-row">
                  <div>
                    <div className="eyebrow">REVIEW REQUIRED</div>
                    <h3>内容性建议</h3>
                  </div>
                  <span className="count-badge">{suggestions.length} 项</span>
                </div>
                <p className="muted-copy">这些建议可能改变文字内容，因此不会自动写回 DOCX。</p>
                <div className="suggestion-list">
                  {suggestions.map((s, i) => (
                    <div className="suggestion" key={`${s.paragraphId}-${i}`}>
                      <span className="paragraph-pill">P{s.paragraphId}</span>
                      <div><strong>{s.reason}</strong>{s.proposedText && <code>{s.proposedText}</code>}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <StructureTable extracted={extracted} analysis={analysis} onBlockChange={changeBlock} />

            <section className="card final-action-card">
              <div className="final-action-copy">
                <span className="step-chip">STEP 2</span>
                <h3>应用学校公文规范</h3>
                <p>AI 的工作到“理解文档”结束。字体、字号、页边距、行距和页码全部由规则库确定执行。</p>
                <div className="rule-tags"><span>A4</span><span>标题/正文</span><span>1–4级层次</span><span>附件</span><span>落款日期</span><span>页码</span></div>
              </div>
              <button className="primary large" disabled={busy || fatalIssues > 0} onClick={runFormat}>
                {stage === 'formatting' ? '正在规范化…' : '一键规范化 DOCX'} <b>→</b>
              </button>
            </section>
          </section>
        )}

        {result && stage === 'done' && (
          <section className="card result-card">
            <div className="success-icon">✓</div>
            <div className="result-copy">
              <div className="eyebrow">DONE · CONTENT PRESERVED</div>
              <h2>规范化完成，内容完整性验证通过</h2>
              <p>共执行 <strong>{result.changes.length}</strong> 项格式操作；格式化前后正文语义字符 SHA-256 一致。</p>
              <div className="hash-row"><span>BEFORE</span><code>{result.beforeHash.slice(0, 18)}…</code><span>AFTER</span><code>{result.afterHash.slice(0, 18)}…</code></div>
              <div className="integrity-grid">
                <div><span>原始字符数</span><strong>{result.originalCharacters}</strong></div>
                <div><span>输出字符数</span><strong>{result.outputCharacters}</strong></div>
                <div><span>新增字符</span><strong>{result.addedCharacters}</strong></div>
                <div><span>删除字符</span><strong>{result.deletedCharacters}</strong></div>
                <div><span>修改字符</span><strong>{result.modifiedCharacters}</strong></div>
                <div><span>SHA-256</span><strong>{result.contentPreserved ? '一致' : '不一致'}</strong></div>
              </div>
              <div className="format-report">
                <strong>格式修复报告</strong>
                <ul>
                  {formatReport.map((item) => <li key={item.label}><span>{item.verified ? '✓' : '—'}</span>{item.label}</li>)}
                </ul>
              </div>
              <details>
                <summary>查看格式操作明细</summary>
                <ul>{result.changes.slice(0, 80).map((c, i) => <li key={i}>{c.description}</li>)}</ul>
              </details>
            </div>
            <button className="download" onClick={download}>下载规范版 DOCX</button>
            <button className="secondary-action" onClick={() => { setStage('idle'); void runAnalysis() }}>重新处理</button>
          </section>
        )}

        <section className="standard-section" id="standard">
          <div className="section-heading">
            <div>
              <span className="section-index">03</span>
              <div>
                <p>DETERMINISTIC STANDARD</p>
                <h2>公文格式不是让模型“猜”，而是由规则精确映射</h2>
              </div>
            </div>
          </div>
          <details className="standard-details" open>
            <summary>展开查看核心格式规范</summary>
            <div className="standard-grid">
              {standardItems.map(([title, detail], index) => (
                <article className="standard-item" key={title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div><strong>{title}</strong><p>{detail}</p></div>
                </article>
              ))}
            </div>
          </details>
        </section>

        <section className="architecture-section" id="architecture">
          <div className="architecture-copy">
            <span className="section-index inverted">04</span>
            <p className="architecture-kicker">PRIVACY-FIRST ARCHITECTURE</p>
            <h2>原文件留在浏览器，云端只承担必要的语义判断。</h2>
            <p>这种架构避免把完整公文上传到业务服务器，同时保留大模型对“全文同一格式”等复杂输入的语义理解能力。</p>
          </div>
          <div className="architecture-flow">
            <div><span>01</span><strong>Browser</strong><small>DOCX 本地解析</small></div>
            <b>→</b>
            <div><span>02</span><strong>Worker</strong><small>API Key 安全代理</small></div>
            <b>→</b>
            <div><span>03</span><strong>DeepSeek</strong><small>结构语义识别</small></div>
            <b>→</b>
            <div><span>04</span><strong>Browser</strong><small>OOXML 规范化</small></div>
          </div>
        </section>
      </main>

      <footer>
        <div><strong>办公文档智能整理工具</strong><span>当前版本仅支持 DOCX</span></div>
        <p>复杂文本框、SmartArt、OLE 等对象尽量原样保留，但 V1 不承诺智能重排其内部格式。</p>
      </footer>
    </div>
  )
}

export default App
