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

// Listeners are notified when the session ends for good, so the UI can fall
// back to the login screen instead of leaving dead panels on the page.
const sessionEndedListeners = new Set()

export function onSessionEnded(listener) {
  sessionEndedListeners.add(listener)
  return () => sessionEndedListeners.delete(listener)
}

function endSession() {
  writeTokens(null)
  sessionEndedListeners.forEach((listener) => listener())
}

// Retrying these would be pointless or circular: they are how a session is
// established in the first place.
const NON_RENEWABLE_PATHS = ['/auth/login', '/auth/refresh']

// Access tokens live 30 minutes while refresh tokens live 7 days, so an idle
// tab must renew rather than dump the user back at the login screen. All
// concurrent 401s share one in-flight refresh instead of stampeding the API.
let refreshInFlight = null

function refreshAccessToken() {
  const tokens = readTokens()
  if (!tokens?.refresh_token) return Promise.resolve(null)

  refreshInFlight ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((renewed) => {
      if (!renewed?.access_token) return null
      const next = { ...readTokens(), access_token: renewed.access_token }
      writeTokens(next)
      return next.access_token
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

function send(path, accessToken, { method, body, isForm }) {
  const headers = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (body && !isForm) headers['Content-Type'] = 'application/json'
  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  })
}

async function request(path, { method = 'GET', body, raw = false, isForm = false } = {}) {
  const options = { method, body, isForm }
  let response = await send(path, readTokens()?.access_token, options)

  // An expired access token is recoverable: renew once, then replay the call.
  if (response.status === 401 && !NON_RENEWABLE_PATHS.some((p) => path.startsWith(p))) {
    const renewedToken = await refreshAccessToken()
    if (renewedToken) response = await send(path, renewedToken, options)
  }

  if (response.status === 401) endSession()
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
