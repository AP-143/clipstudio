// Backend base URL. Always same-origin: in dev Vite proxies /api + /ws to the
// backend, in prod nginx does. We intentionally do NOT read VITE_API_BASE here
// because that var holds the Docker-internal host (http://backend:8000) which
// the browser cannot resolve — only the Vite proxy (server-side) should use it.
export const API_BASE = ''

export const LS = {
  jobId: 'clipstudio_job_id',
  jobStatus: 'clipstudio_job_status',
  jobResult: 'clipstudio_job_result',
  groqKey: 'clipstudio_groq_key',
  cookies: 'clipstudio_youtube_cookies',
  settings: 'clipstudio_settings',
}

export const DEFAULT_SETTINGS = {
  subtitleStyle: 'word_by_word',
  cropMode: 'track',
  language: 'auto',
  autoDeleteHours: 24,
}

// UTF-8 safe base64 — cookies are multi-line, and raw newlines are illegal in
// HTTP header values (fetch throws "Invalid value"), so we encode them.
function b64(str) {
  return btoa(unescape(encodeURIComponent(str)))
}

// Authenticated headers for backend calls (key never persisted server-side).
export function authHeaders(extra = {}) {
  const key = localStorage.getItem(LS.groqKey) || ''
  const cookies = localStorage.getItem(LS.cookies) || ''
  const h = { ...extra }
  if (key) h['X-Groq-Key'] = key
  if (cookies) h['X-Youtube-Cookies'] = b64(cookies)
  return h
}

export async function api(path, { method = 'GET', body, json, headers } = {}) {
  const opts = { method, headers: authHeaders(headers) }
  if (json !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(json)
  } else if (body !== undefined) {
    opts.body = body
  }
  const res = await fetch(`${API_BASE}${path}`, opts)
  const ct = res.headers.get('content-type') || ''
  const data = ct.includes('application/json') ? await res.json() : await res.blob()
  if (!res.ok) {
    const err = (data && data.error) ? data.error
      : (data && data.detail) ? { message: data.detail }
      : { message: `HTTP ${res.status}` }
    throw err
  }
  return data
}
