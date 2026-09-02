import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { api } from './lib/api'
import { ROLE_LABELS, useAuth } from './lib/auth'
import { Loading, Panel } from './components/ui'
import Login from './pages/Login'
import National from './pages/National'
import State from './pages/State'
import Constituency from './pages/Constituency'
import Alerts from './pages/Alerts'
import Reports from './pages/Reports'
import Admin from './pages/Admin'
import PublicView from './pages/PublicView'
import { WorkDetail, WorksExplorer } from './pages/Works'

// Each nav entry declares the permission it needs, so the menu and the routes
// stay in sync with the backend RBAC matrix from a single source.
const NAV_ITEMS = [
  { to: '/', label: 'National Overview', permission: 'view_constituencies', end: true },
  { to: '/works', label: 'Works Explorer', permission: 'view_works' },
  { to: '/alerts', label: 'Alerts', permission: 'view_works' },
  { to: '/reports', label: 'Reports', permission: 'generate_reports' },
  { to: '/admin', label: 'Administration', permission: 'upload_data' },
]

export default function App() {
  const { user, loading, logout, can } = useAuth()
  const [financialYear, setFinancialYear] = useState('')

  if (loading) return <Loading label="Restoring session…" />
  if (!user) return <Login />
  if (user.role === 'ROLE_PUBLIC') return <PublicView onLogout={logout} />

  const landing = can('view_constituencies') ? <National financialYear={financialYear} /> : <WorksExplorer financialYear={financialYear} />

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>🛡 MPLADS Sentinel</h1>
          <p className="tagline">AI-powered anomaly detection · MoSPI / DIID · SIH-26102</p>
        </div>
        <div className="spacer" />
        <FinancialYearPicker value={financialYear} onChange={setFinancialYear} />
        <span className="role-chip">
          {user.full_name || user.username} · {ROLE_LABELS[user.role]}
          {user.scope_value ? ` (${user.scope_value})` : ''}
        </span>
        <button type="button" onClick={logout}>Logout</button>
      </header>

      <nav className="mainnav" aria-label="Primary">
        {NAV_ITEMS.filter((item) => can(item.permission)).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="content">
        <Routes>
          <Route path="/" element={landing} />
          <Route path="/state/:state" element={<State financialYear={financialYear} />} />
          <Route path="/constituency/:name" element={<Constituency financialYear={financialYear} />} />
          <Route path="/works" element={<WorksExplorer financialYear={financialYear} />} />
          <Route path="/works/:workId" element={<WorkDetail />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/reports" element={<Reports financialYear={financialYear} />} />
          <Route
            path="/admin"
            element={can('upload_data') ? <Admin /> : <Panel title="Access denied"><p className="muted">Your role cannot administer data.</p></Panel>}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function FinancialYearPicker({ value, onChange }) {
  const summary = useQuery({
    queryKey: ['fy-options'],
    queryFn: () => api.nationalSummary({}),
    retry: false,
  })
  const years = summary.data?.financial_years || []

  return (
    <label className="field" style={{ color: '#dbe6f5' }}>
      <span>Financial year</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All years</option>
        {years.map((year) => (
          <option key={year} value={year}>{year}</option>
        ))}
      </select>
    </label>
  )
}
