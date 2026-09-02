import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, onSessionEnded, readTokens, writeTokens } from '../lib/api'

const TOKENS = { access_token: 'abc123', user: { username: 'admin', role: 'ROLE_ADMIN' } }

describe('token storage', () => {
  afterEach(() => {
    writeTokens(null)
    vi.restoreAllMocks()
  })

  it('round-trips tokens through localStorage when it is available', () => {
    writeTokens(TOKENS)
    expect(readTokens()).toEqual(TOKENS)
  })

  it('clears tokens on logout', () => {
    writeTokens(TOKENS)
    writeTokens(null)
    expect(readTokens()).toBeNull()
  })

  // Regression: inside sandboxed / storage-partitioned iframes localStorage can
  // throw or silently drop writes. The session must survive on the in-memory
  // copy alone, otherwise every authenticated request loses its bearer token
  // and the whole app reports "Authentication required".
  describe('when localStorage is unavailable', () => {
    beforeEach(() => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError')
      })
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError')
      })
    })

    it('does not throw when writing', () => {
      expect(() => writeTokens(TOKENS)).not.toThrow()
    })

    it('still returns the token from memory', () => {
      writeTokens(TOKENS)
      expect(readTokens()).toEqual(TOKENS)
      expect(readTokens().access_token).toBe('abc123')
    })

    it('returns null when nothing has been written', () => {
      writeTokens(null)
      expect(readTokens()).toBeNull()
    })
  })
})

describe('expired access tokens', () => {
  const SESSION = { access_token: 'expired', refresh_token: 'refresh-1', user: { username: 'admin' } }

  beforeEach(() => writeTokens(SESSION))
  afterEach(() => {
    writeTokens(null)
    vi.unstubAllGlobals()
  })

  // Regression: access tokens live 30 minutes, refresh tokens 7 days. Without
  // a refresh step an idle tab showed "Authentication required" on every panel.
  it('refreshes once and replays the original request', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      calls.push([url, options?.headers?.Authorization])
      if (url.endsWith('/auth/refresh')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'fresh' }) }
      }
      if (options?.headers?.Authorization === 'Bearer fresh') {
        return { ok: true, status: 200, json: async () => ({ username: 'admin' }) }
      }
      return { ok: false, status: 401, json: async () => ({ detail: 'Invalid or expired token' }) }
    }))

    await expect(api.me()).resolves.toEqual({ username: 'admin' })
    expect(calls.map(([url]) => url)).toEqual([
      '/api/v1/auth/me', '/api/v1/auth/refresh', '/api/v1/auth/me',
    ])
    expect(readTokens().access_token).toBe('fresh')
    expect(readTokens().refresh_token).toBe('refresh-1')
  })

  it('shares one refresh across concurrent 401s', async () => {
    let refreshes = 0
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1
        return { ok: true, status: 200, json: async () => ({ access_token: 'fresh' }) }
      }
      if (options?.headers?.Authorization === 'Bearer fresh') {
        return { ok: true, status: 200, json: async () => ({ ok: true }) }
      }
      return { ok: false, status: 401, json: async () => ({ detail: 'expired' }) }
    }))

    await Promise.all([api.me(), api.works(), api.anomalies()])
    expect(refreshes).toBe(1)
  })

  it('ends the session when the refresh token is also rejected', async () => {
    const ended = vi.fn()
    const unsubscribe = onSessionEnded(ended)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 401, json: async () => ({ detail: 'expired' }),
    })))

    await expect(api.me()).rejects.toMatchObject({ status: 401 })
    expect(ended).toHaveBeenCalled()
    expect(readTokens()).toBeNull()
    unsubscribe()
  })
})
