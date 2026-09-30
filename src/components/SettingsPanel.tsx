import { useEffect, useState } from 'react'
import { getProxyUrl, setProxyUrl } from '../lib/config'

export default function SettingsPanel() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => setUrl(getProxyUrl()), [open])

  const save = () => {
    setProxyUrl(url)
    window.dispatchEvent(new Event('ai-service-change'))
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  return (
    <div className="settings-wrap">
      <button className="settings-button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>⚙</span> AI 服务
      </button>
      {open && (
        <div className="settings-card">
          <div className="settings-card-head"><div><span className="eyebrow">SECURE PROXY</span><h3>AI 服务设置</h3></div><button className="close-button" aria-label="关闭 AI 服务设置" onClick={() => setOpen(false)}>×</button></div>
          <label htmlFor="proxy">Cloudflare Worker URL</label>
          <div className="settings-row">
            <input id="proxy" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://official-doc-ai-proxy.xxx.workers.dev" />
            <button onClick={save}>{saved ? '已保存' : '保存'}</button>
          </div>
          <p>浏览器只保存代理地址。DeepSeek API Key 必须配置为 Cloudflare Worker Secret，不会进入前端代码。</p>
        </div>
      )}
    </div>
  )
}
