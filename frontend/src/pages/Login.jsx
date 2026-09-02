import { useState } from 'react'
import { useAuth, ROLE_LABELS } from '../lib/auth'

// Seed accounts from SRS FR-AAA-001 mvp_seed_users — one click fills the form.
const DEMO_USERS = [
  { username: 'admin', password: 'Admin@1234', role: 'ROLE_ADMIN' },
  { username: 'ministry_user', password: 'Ministry@1234', role: 'ROLE_MINISTRY' },
  { username: 'state_user', password: 'State@1234', role: 'ROLE_STATE_NODAL' },
  { username: 'district_user', password: 'District@1234', role: 'ROLE_DISTRICT' },
  { username: 'mp_user', password: 'Mp@12345', role: 'ROLE_MP' },
  { username: 'public_user', password: 'Public@1234', role: 'ROLE_PUBLIC' },
]

export default function Login() {
  const { login } = useAuth()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(form.username, form.password)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>MPLADS Sentinel</h1>
        <p className="muted">
          AI-powered anomaly detection for the MPLADS scheme · MoSPI / DIID · SIH-26102
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: '1.1rem' }}>
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="demo-users">
          <h2>Demo accounts</h2>
          <div className="chips">
            {DEMO_USERS.map((user) => (
              <button
                key={user.username}
                type="button"
                onClick={() => setForm({ username: user.username, password: user.password })}
                title={ROLE_LABELS[user.role]}
              >
                {user.username}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
