import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, onSessionEnded, readTokens, writeTokens } from './api'

// Mirrors the backend permission matrix (FR-AAA-002) so the UI can hide what
// the API would refuse anyway.
export const ROLE_PERMISSIONS = {
  ROLE_ADMIN: ['upload_data', 'manage_alerts', 'generate_reports', 'view_works', 'view_constituencies'],
  ROLE_MINISTRY: ['manage_alerts', 'generate_reports', 'view_works', 'view_constituencies'],
  ROLE_STATE_NODAL: ['manage_alerts', 'generate_reports', 'view_works', 'view_constituencies'],
  ROLE_DISTRICT: ['manage_alerts', 'generate_reports', 'view_works'],
  ROLE_MP: ['generate_reports', 'view_works'],
  ROLE_PUBLIC: [],
}

export const ROLE_LABELS = {
  ROLE_ADMIN: 'System Administrator',
  ROLE_MINISTRY: 'Ministry Official',
  ROLE_STATE_NODAL: 'State Nodal Authority',
  ROLE_DISTRICT: 'District Authority',
  ROLE_MP: 'Member of Parliament',
  ROLE_PUBLIC: 'Public Viewer',
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readTokens()?.user || null)
  const [loading, setLoading] = useState(Boolean(readTokens()?.access_token))

  useEffect(() => {
    if (!readTokens()?.access_token) {
      setLoading(false)
      return
    }
    api
      .me()
      .then(setUser)
      .catch(() => {
        writeTokens(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  // When a refresh fails the API layer ends the session; drop the user back to
  // the login screen instead of leaving a shell full of failing panels.
  useEffect(() => onSessionEnded(() => setUser(null)), [])

  const login = useCallback(async (username, password) => {
    const result = await api.login(username, password)
    writeTokens(result)
    setUser(result.user)
    return result.user
  }, [])

  const logout = useCallback(() => {
    writeTokens(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      can: (permission) => (ROLE_PERMISSIONS[user?.role] || []).includes(permission),
    }),
    [user, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
