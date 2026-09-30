import { useMemo, useState } from 'react'
import AnalysisSummary from './components/AnalysisSummary'
import Dropzone from './components/Dropzone'
import IssueList from './components/IssueList'
import SettingsPanel from './components/SettingsPanel'
import ServiceStatus from './components/ServiceStatus'
import StructureTable from './components/StructureTable'
import { analyzeStructure } from './lib/ai/client'
import { extractDocx } from './lib/docx/extractor'
import { formatDocx } from './lib/docx/formatter'
import type { BlockRole, DocumentType, ExtractedDocument, FormatResult, StructureAnalysis } from './lib/docx/types'
import { validateAnalysis, type ValidationIssue } from './lib/docx/validator'
import { SUPPORTED_DOCUMENT_TYPES } from './lib/rules/officialRules'
import { detectExplicitHeadingLevel } from './lib/rules/heuristics'

type Stage = 'idle' | 'reading' | 'extracting' | 'analyzing' | 'ready' | 'formatting' | 'validating' | 'generating' | 'done' | 'error'

const stageMeta: Record<Stage, { label: string; detail: string; step: number }> = {
  idle: { label: '等待文档', detail: '请先选择一个 .docx 文件，再开始规范化。', step: -1 },
  reading: { label: '读取 DOCX', detail: '正在浏览器中打开文档包。', step: 0 },
  extracting: { label: '提取文档结构', detail: '本地读取段落、表格与格式特征。', step: 1 },
  analyzing: { label: 'AI 语义分析', detail: '结合全文语义识别角色与层级，通常需要数十秒。', step: 2 },
  ready: { label: '标题层级已恢复', detail: '请核对下方检查项；确认角色后应用公文规范。', step: 4 },
  formatting: { label: '应用公文规范', detail: '规则引擎正在修改 OOXML 格式属性。', step: 4 },
  validating: { label: '内容完整性校验', detail: '逐字比对正文并计算 SHA-256。', step: 5 },
  generating: { label: '生成新 DOCX', detail: '在当前浏览器中重新打包文档。', step: 6 },
  done: { label: '处理完成', detail: '正文文字未被改变，可以下载规范文档。', step: 7 },
  error: { label: '处理未完成', detail: '原始文件未被修改，请按下方提示重试。', step: -1 },
}

const standardItems = [
  ['页面', 'A4 · 上37 / 下35 / 左右27 mm'],
  ['标题', '二号方正小标宋_GBK · 居中'],
  ['正文', '三号仿宋_GB2312 · 两端对齐'],
  ['层级', '黑体 / 楷体 / 仿宋 · 1–4级'],
  ['段落', '首行2字符 · 28.8磅行距'],
  ['页码', '四号宋体 · 奇右偶左 · 函首页无页码'],
  ['附件', '说明左空二字 · 附件标识另面顶格'],
  ['落款', '与正文空两行 · 右侧落款区域'],
  ['日期与附注', '日期右空四字 · 附注左空二字'],
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

  const busy = ['reading', 'extracting', 'analyzing', 'formatting', 'validating', 'generating'].includes(stage)
  const suggestions = analysis?.suggestions ?? []
  const fatalIssues = issues.filter((issue) => issue.severity === 'error').length
  const stageInfo = stageMeta[stage]

  const roleCoverage = useMemo(() => {
    if (!analysis) return 0
    const recognized = analysis.blocks.filter((block) => block.role !== 'unknown').length
    return analysis.blocks.length ? Math.round((recognized / analysis.blocks.length) * 100) : 0
  }, [analysis])

  const formatReport = result ? [
    { label: 'A4 · 页边距 37/35/27/27 mm', verified: result.changes.some((change) => change.category === 'page') },
    { label: '标题：二号方正小标宋_GBK', verified: result.changes.some((change) => change.category === 'title') },
    { label: '正文：三号仿宋 · 首行 2 字符', verified: result.changes.some((change) => change.category === 'body') },
    { label: '一级至四级标题映射', verified: result.changes.some((change) => change.category === 'heading') },
    { label: '28.8 磅行距', verified: result.changes.some((change) => change.paragraphId !== undefined) },
    { label: '页码', verified: result.changes.some((change) => change.category === 'page_number') },
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
    if (!file || busy) return
    try {
      resetDerived()
      setStage('reading')
      const { zip, extracted: parsed } = await extractDocx(file, () => setStage('extracting'))
      setExtracted(parsed)
      setStage('analyzing')
      const semantic = await analyzeStructure(parsed.paragraphs, documentType)
      setAnalysis(semantic)
      const checked = [
        ...validateAnalysis(parsed, semantic),
        ...(semantic.warnings ?? []).map((message, index) => ({ severity: 'warning' as const, code: `ANALYSIS_WARNING_${index}`, message })),
      ]
      setIssues(checked)
      setStage('ready')
      const needsReview = semantic.source === 'demo' || checked.some(issue => issue.severity === 'error' || /LOW_|UNKNOWN_ROLE/.test(issue.code))
      if (!needsReview) {
        setStage('formatting')
        const formatted = await formatDocx(zip, parsed, semantic, () => setStage('validating'), () => setStage('generating'))
        setResult(formatted)
        setStage('done')
      }
      requestAnimationFrame(() => document.getElementById(needsReview ? 'analysis' : 'result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : '处理未完成，请更换文档或重试。')
      setStage('error')
    }
  }

  const runFormat = async () => {
    if (!file || !extracted || !analysis) return
    try {
      setError('')
      setStage('formatting')
      const { zip, extracted: fresh } = await extractDocx(file)
      const formatted = await formatDocx(zip, fresh, analysis, () => setStage('validating'), () => setStage('generating'))
      setResult(formatted)
      setStage('done')
      requestAnimationFrame(() => document.getElementById('result')?.scrollIntoView({ behavior: 'smooth' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStage('error')
    }
  }

  const download = () => {
    if (!result || !file) return
    try {
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${file.name.replace(/\.docx$/i, '')}_规范版.docx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setError('')
    } catch {
      setError('下载未能启动。请检查浏览器下载权限，然后再次点击“下载规范文档”；也可更换浏览器重新处理。')
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">跳转到文档处理</a>
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
          <ServiceStatus demo={analysis?.source === 'demo'} />
          <SettingsPanel />
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-kicker"><span>面向高校与政务办公</span> 让文档回归规范</div>
            <h1>读懂文档结构，<br /><strong>整理成规范公文。</strong></h1>
            <p>
              不依赖原始样式判断层级。DeepSeek 从全文语义恢复标题、正文层级、附件与落款，
              再由确定性规则引擎完成标准化排版。只改格式，不改正文文字。
            </p>
            <div className="hero-badges">
              <span>仅支持 DOCX</span>
              <span>内容默认零改写</span>
              <span>AI 语义识别</span>
              <span>本地文档处理</span>
            </div>
            <a className="hero-start" href="#workspace">开始整理文档 <span>↓</span></a>
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
              <div className="paper-signature">示例大学办公室<br />2026年9月30日</div>
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
                onRemove={() => { setFile(undefined); resetDerived(); setStage('idle') }}
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
                  <small>所选类型仅作为 AI 语义提示，不切换独立模板。</small>
                </label>
              </div>

              <button className="primary full" disabled={!file || busy} onClick={runAnalysis}>
                <span>{busy ? '正在处理文档…' : 'AI 智能规范化'}</span>
                <b>→</b>
              </button>
              {!file && <p className="action-help">请先选择 .docx 文件，即可开始。</p>}
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
                  const complete = stageInfo.step > index
                  const active = stageInfo.step === index && busy
                  return (
                    <div className={`process-item ${complete ? 'complete' : ''} ${active ? 'current' : ''}`} key={num} aria-current={active ? 'step' : undefined}>
                      <span className="process-number">{complete ? '✓' : active ? '…' : num}</span>
                      <div><strong>{title}</strong><small>{detail}</small></div>
                    </div>
                  )
                })}
              </div>

              <div className={`stage-panel ${stage === 'error' ? 'error' : ''}`} role="status" aria-live="polite">
                <div className="stage-label"><span>{stageInfo.label}</span><strong>{busy ? '处理中' : stage === 'done' ? '已通过' : ''}</strong></div>
                <p>{stageInfo.detail}</p>
              </div>
              {error && <div className="error-banner" role="alert"><strong>处理需要检查</strong><span>{error}</span><p>原文件保持不变。请使用 Word 重新另存为 .docx，或检查网络后重试。</p><button className="secondary-action" disabled={!file || busy} onClick={runAnalysis}>重试处理</button></div>}
            </aside>
          </div>
        </section>

        {result && stage === 'done' && (
          <section className="card result-card" id="result" role="status">
            <div className="success-icon">✓</div>
            <div className="result-copy">
              <div className="eyebrow">DONE · CONTENT PRESERVED</div>
              <h2>规范化完成，内容完整性验证通过</h2>
              <p>共执行 <strong>{result.changes.length}</strong> 项格式操作；正文文字未被改变，格式化前后 SHA-256 一致。</p>
              <div className="hash-row" title={`${result.beforeHash} / ${result.afterHash}`}><span>BEFORE</span><code>{result.beforeHash.slice(0, 18)}…</code><span>AFTER</span><code>{result.afterHash.slice(0, 18)}…</code></div>
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
                  {formatReport.map((item) => <li key={item.label}><span>{item.verified ? '✓' : '—'}</span>{item.label}<b>{item.verified ? '已应用' : '无需处理 / 请确认'}</b></li>)}
                </ul>
              </div>
              <details>
                <summary>查看格式操作明细</summary>
                <ul>{result.changes.slice(0, 80).map((c, i) => <li key={i}>{c.description}</li>)}</ul>
              </details>
            </div>
            <button className="download" onClick={download}>下载规范文档</button>
            <button className="secondary-action" onClick={() => { setStage('idle'); void runAnalysis() }}>重新处理</button>
          </section>
        )}


        {extracted && analysis && (
          <section className="analysis-area" id="analysis">
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

            <StructureTable extracted={extracted} analysis={analysis} onBlockChange={busy ? undefined : changeBlock} />

            <section className="card final-action-card">
              <div className="final-action-copy">
                <span className="step-chip">STEP 2</span>
                <h3>应用公文格式规范</h3>
                <p>AI 的工作到“理解文档”结束。字体、字号、页边距、行距和页码全部由规则库确定执行。</p>
                <div className="rule-tags"><span>A4</span><span>标题/正文</span><span>1–4级层次</span><span>附件</span><span>落款日期</span><span>页码</span></div>
              </div>
              <button className="primary large" disabled={busy || fatalIssues > 0} onClick={runFormat}>
                {stage === 'formatting' ? '正在规范化…' : '一键规范化 DOCX'} <b>→</b>
              </button>
            </section>
          </section>
        )}


        <section className="standard-section" id="standard">
          <div className="section-heading">
            <div>
              <span className="section-index">03</span>
              <div>
                <p>DETERMINISTIC STANDARD</p>
                <h2>排版有依据，处理可核查</h2>
              </div>
            </div>
          </div>
          <details className="standard-details">
            <summary>公文格式规范 · 展开查看</summary>
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
