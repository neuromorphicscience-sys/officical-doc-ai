const STORAGE_KEY = 'official-doc-ai-proxy-url'

export function getProxyUrl(): string {
  const fromStorage = typeof localStorage === 'undefined' ? '' : localStorage.getItem(STORAGE_KEY)?.trim()
  if (fromStorage) return fromStorage.replace(/\/$/, '')
  const fromEnv = (
    (import.meta.env.VITE_AI_ENDPOINT as string | undefined)
    || (import.meta.env.VITE_AI_PROXY_URL as string | undefined)
  )?.trim()
  return fromEnv ? fromEnv.replace(/\/$/, '') : ''
}

export function setProxyUrl(url: string) {
  const normalized = url.trim().replace(/\/$/, '')
  if (typeof localStorage === 'undefined') return
  if (normalized) localStorage.setItem(STORAGE_KEY, normalized)
  else localStorage.removeItem(STORAGE_KEY)
}
