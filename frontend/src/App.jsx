import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { api } from './lib/api'
import { ROLE_LABELS, useAuth } from './lib/auth'
import { initialsOf } from './lib/format'
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

// Each nav entry declares the permission it needs, so the rail and the routes
// stay in sync with the backend RBAC matrix from a single source.
const NAV_ITEMS = [
  { to: '/', label: 'National Overview', icon: '◈', permission: 'view_constituencies', end: true, section: 'Monitor' },
  { to: '/works', label: 'Works Explorer', icon: '▤', permission: 'view_works', section: 'Monitor' },
  { to: '/alerts', label: 'Alert Queue', icon: '⚑', permission: 'view_works', section: 'Investigate' },
  { to: '/reports', label: 'Reports', icon: '⭳', permission: 'generate_reports', section: 'Investigate' },
  { to: '/admin', label: 'Administration', icon: '⚙', permission: 'upload_data', section: 'System' },
]

const PAGE_META = [
  [/^\/$/, 'National Overview', 'Risk distribution across all states and constituencies'],
  [/^\/state\//, 'State Analysis', 'Constituency breakdown within the selected state'],
  [/^\/constituency\//, 'Constituency Detail', 'Works, risk profile and flagged duplicates'],
  [/^\/works\/.+/, 'Work Detail', 'Risk breakdown and detected anomalies'],
  [/^\/works$/, 'Works Explorer', 'Every sanctioned work visible to your role'],
  [/^\/alerts/, 'Alert Queue', 'Triage and resolve detected anomalies'],
  [/^\/reports/, 'Reports', 'Export findings as PDF briefings or CSV datasets'],
  [/^\/admin/, 'Administration', 'Data ingestion, detection runs and audit trail'],
]

export default function App() {
  const { user, loading, logout, can } = useAuth()
  const [financialYear, setFinancialYear] = useState('')
  const location = useLocation()

  if (loading) return <Loading label="Restoring session…" />
  if (!user) return <Login />
  if (user.role === 'ROLE_PUBLIC') return <PublicView onLogout={logout} />

  const visible = NAV_ITEMS.filter((item) => can(item.permission))
  const sections = [...new Set(visible.map((item) => item.section))]
  const [, title, subtitle] = PAGE_META.find(([pattern]) => pattern.test(location.pathname)) || [null, 'Dashboard', '']
  const landing = can('view_constituencies')
    ? <National financialYear={financialYear} />
    : <WorksExplorer financialYear={financialYear} />

  return (
    <div className="app-shell">
      <nav className="rail" aria-label="Primary">
        <div className="rail-brand">
          <span className="rail-mark" aria-hidden="true">🛡</span>
          <div>
            <h1>MPLADS Sentinel</h1>
            <p>MoSPI · DIID</p>
          </div>
        </div>

        <div className="rail-nav">
          {sections.map((section) => (
            <div key={section}>
              <div className="rail-section">{section}</div>
              {visible.filter((item) => item.section === section).map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="rail-link">
                  <span className="ico" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        <div className="rail-foot">
          <div className="rail-user">
            <span className="avatar" aria-hidden="true">{initialsOf(user.full_name || user.username)}</span>
            <span className="rail-user-meta">
              <strong>{user.full_name || user.username}</strong>
              <span>{ROLE_LABELS[user.role]}{user.scope_value ? ` · ${user.scope_value}` : ''}</span>
            </span>
          </div>
          <button type="button" className="btn rail-logout" onClick={logout}>
            <span aria-hidden="true">⏻</span> <span>Sign out</span>
          </button>
        </div>
      </nav>

      <div className="main-col">
        <header className="topbar">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="sub">{subtitle}</p>}
          </div>
          <div className="spacer" />
          <FinancialYearPicker value={financialYear} onChange={setFinancialYear} />
        </header>

        <main className="content">
          <div className="page-enter" key={location.pathname}>
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
                element={can('upload_data') ? <Admin /> : (
                  <Panel title="Access denied">
                    <p className="muted">Your role cannot administer data.</p>
                  </Panel>
                )}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  )
}

function FinancialYearPicker({ value, onChange }) {
  const summary = useQuery({ queryKey: ['fy-options'], queryFn: () => api.nationalSummary({}), retry: false })
  const years = summary.data?.financial_years || []

  return (
    <label className="field">
      <span>FY</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All years</option>
        {years.map((year) => <option key={year} value={year}>{year}</option>)}
      </select>
    </label>
  )
}
