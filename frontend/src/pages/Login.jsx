import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { initialsOf } from '../lib/format'
import { ErrorNote } from '../components/ui'

// Seed accounts from SRS FR-AAA-001 mvp_seed_users — one click signs in.
const DEMO_USERS = [
  { username: 'admin', password: 'Admin@1234', label: 'Administrator', scope: 'Full system access' },
  { username: 'ministry_user', password: 'Ministry@1234', label: 'Ministry Official', scope: 'All constituencies' },
  { username: 'state_user', password: 'State@1234', label: 'State Nodal', scope: 'Maharashtra' },
  { username: 'district_user', password: 'District@1234', label: 'District Authority', scope: 'Pune district' },
  { username: 'mp_user', password: 'Mp@12345', label: 'Member of Parliament', scope: 'Pune constituency' },
  { username: 'public_user', password: 'Public@1234', label: 'Public Viewer', scope: 'Aggregates only' },
]

const FEATURES = [
  { icon: '💸', text: 'Cost-overrun detection with per-category statistical baselines' },
  { icon: '⧉', text: 'Duplicate-work identification across constituency records' },
  { icon: '⏱', text: 'Delay and stalled-project escalation with severity tiers' },
  { icon: '🎯', text: 'Composite 0–100 risk scoring with explainable components' },
]

export default function Login() {
  const { login } = useAuth()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(credentials) {
    setBusy(true)
    setError(null)
    try {
      await login(credentials.username, credentials.password)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <aside className="login-aside">
        <div className="login-logo">
          <span className="rail-mark" aria-hidden="true">🛡</span>
          <div>
            <h1>MPLADS Sentinel</h1>
            <p>MoSPI · DIID</p>
          </div>
        </div>

        <h2>Catch the anomaly <em>before</em> the audit does.</h2>
        <p className="lede">
          AI-powered monitoring for the Members of Parliament Local Area Development Scheme —
          replacing quarterly manual review with continuous, explainable detection.
        </p>

        <ul className="login-feats">
          {FEATURES.map((feature) => (
            <li key={feature.text}>
              <span className="fi" aria-hidden="true">{feature.icon}</span>
              <span>{feature.text}</span>
            </li>
          ))}
        </ul>

        <div className="login-stats">
          <div><strong>543</strong><span>Constituencies</span></div>
          <div><strong>5</strong><span>Detection engines</span></div>
          <div><strong>6</strong><span>Access roles</span></div>
        </div>
      </aside>

      <main className="login-main">
        <div className="login-card">
          <h3>Sign in</h3>
          <p className="muted">Access the MPLADS anomaly monitoring platform.</p>

          <form onSubmit={(event) => { event.preventDefault(); submit(form) }}>
            <label className="field">
              <span>Username</span>
              <input
                name="username" autoComplete="username" value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="e.g. ministry_user" required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                name="password" type="password" autoComplete="current-password" value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="••••••••" required
              />
            </label>

            <ErrorNote error={error} />

            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          <div className="demo-block">
            <h4>Demo accounts</h4>
            <p>Select a role to sign in instantly.</p>
            <div className="demo-grid">
              {DEMO_USERS.map((user) => (
                <button
                  key={user.username}
                  type="button"
                  className="demo-btn"
                  disabled={busy}
                  onClick={() => { setForm(user); submit(user) }}
                >
                  <span className="avatar" aria-hidden="true">{initialsOf(user.label)}</span>
                  <span>
                    <strong>{user.label}</strong>
                    <span>{user.scope}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
