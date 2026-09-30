import { useEffect, useState } from 'react'
import { getProxyUrl } from '../lib/config'

export default function ServiceStatus({ demo }: { demo: boolean }) {
  const [state, setState] = useState<'checking' | 'online' | 'offline'>('checking')
  useEffect(() => {
    let controller: AbortController | undefined
    const check = async () => {
      controller?.abort()
      controller = new AbortController()
      const current = controller
      const timeout = setTimeout(() => current.abort(), 8000)
      setState('checking')
      try {
        const base = getProxyUrl()
        if (!base) { setState('offline'); return }
        const response = await fetch(`${base}/health`, { signal: current.signal, cache: 'no-store' })
        const data = await response.json()
        if (controller === current) setState(response.ok && data.ok === true ? 'online' : 'offline')
      } catch { if (controller === current) setState('offline') }
      finally { clearTimeout(timeout) }
    }
    void check()
    window.addEventListener('ai-service-change', check)
    return () => { controller?.abort(); controller = undefined; window.removeEventListener('ai-service-change', check) }
  }, [])
  return <span className={`service-status ${demo || state === 'offline' ? 'offline' : ''}`} role="status" title={demo || state === 'offline' ? '使用本地规则演示，不代表完整 AI 语义能力。' : '代理服务已连接；AI 识别结果以实际请求为准。'}>
    <i aria-hidden="true" />{demo || state === 'offline' ? '演示模式 · 本地规则' : state === 'online' ? 'AI 语义识别已连接' : '正在检查 AI 服务'}
  </span>
}
