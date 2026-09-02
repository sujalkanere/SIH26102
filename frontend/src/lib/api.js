// Single place that knows how to talk to the API (DRY).
const BASE = '/api/v1'
const TOKEN_KEY = 'mplads.tokens'

// Tokens live in memory as the source of truth. localStorage is only a
// best-effort mirror so a reload can restore the session: inside sandboxed or
// storage-partitioned iframes it may be unavailable or silently cleared, and
// the app must keep working regardless.
let memoryTokens = null

function readStoredTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY)) || null
  } catch {
    return null
  }
}

export function readTokens() {
  if (!memoryTokens) memoryTokens = readStoredTokens()
  return memoryTokens
}

export function writeTokens(tokens) {
  memoryTokens = tokens
  try {
    if (tokens) localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage unavailable — the in-memory copy still backs the session.
  }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', body, raw = false, isForm = false } = {}) {
  const tokens = readTokens()
  const headers = {}
  if (tokens?.access_token) headers.Authorization = `Bearer ${tokens.access_token}`
  if (body && !isForm) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  })

  if (response.status === 401) writeTokens(null)
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new ApiError(response.status, detail.detail || `Request failed (${response.status})`)
  }
  return raw ? response : response.json()
}

// Query-string helper that drops empty values.
export function withQuery(path, params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'ALL') {
      search.append(key, value)
    }
  })
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/auth/me'),
  works: (params) => request(withQuery('/works', params)),
  work: (workId) => request(`/works/${encodeURIComponent(workId)}`),
  constituencies: (params) => request(withQuery('/constituencies', params)),
  constituency: (name, params) => request(withQuery(`/constituencies/${encodeURIComponent(name)}`, params)),
  anomalies: (params) => request(withQuery('/anomalies', params)),
  updateAnomaly: (id, payload) => request(`/anomalies/${id}`, { method: 'PATCH', body: payload }),
  auditLog: () => request('/audit-log'),
  nationalSummary: (params) => request(withQuery('/analytics/national-summary', params)),
  stateSummary: (state, params) => request(withQuery(`/analytics/state-summary/${encodeURIComponent(state)}`, params)),
  trends: (metric) => request(withQuery('/analytics/trends', { metric })),
  publicSummary: () => request('/analytics/public-summary'),
  uploadCsv: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/admin/upload', { method: 'POST', body: form, isForm: true })
  },
  generateSynthetic: (payload) => request('/admin/generate-synthetic', { method: 'POST', body: payload }),
  runDetection: () => request('/admin/run-detection', { method: 'POST' }),
  uploadHistory: () => request('/admin/upload-history'),
  downloadReport: (payload) => request('/reports/generate', { method: 'POST', body: payload, raw: true }),
}
