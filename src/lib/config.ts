const STORAGE_KEY = 'official-doc-ai-proxy-url'

export function getProxyUrl(): string {
  const fromStorage = localStorage.getItem(STORAGE_KEY)?.trim()
  if (fromStorage) return fromStorage.replace(/\/$/, '')
  const fromEnv = (import.meta.env.VITE_AI_PROXY_URL as string | undefined)?.trim()
  return fromEnv ? fromEnv.replace(/\/$/, '') : ''
}

export function setProxyUrl(url: string) {
  const normalized = url.trim().replace(/\/$/, '')
  if (normalized) localStorage.setItem(STORAGE_KEY, normalized)
  else localStorage.removeItem(STORAGE_KEY)
}
