import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../lib/auth'
import { writeTokens } from '../lib/api'

const SUMMARY = {
  total_works: 739,
  total_expenditure: 616_900_000,
  total_funds_released: 900_000_000,
  anomalies_detected: 188,
  high_risk_constituencies: 2,
  anomaly_type_distribution: { COST_OVERRUN: 30, DELAYED_PROJECT: 122 },
  severity_distribution: { HIGH: 40, CRITICAL: 5 },
  state_risk: [
    { state: 'Maharashtra', avg_risk_score: 30, risk_tier: 'MEDIUM', total_works: 300, anomaly_count: 90 },
  ],
  top_risk_constituencies: [
    {
      name: 'Pune', state: 'Maharashtra', district: 'Pune', mp_name: 'MP Pune',
      risk_score: 43, risk_tier: 'MEDIUM', total_works: 120, high_risk_works: 8,
      fund_utilization_rate: 71.4, total_funds_released: 1e8, total_expenditure: 7.14e7,
      active_anomalies: 22,
    },
  ],
  financial_years: ['2022-23', '2023-24'],
}

// Route every API call the dashboard makes to a canned payload.
const ROUTES = [
  ['/analytics/national-summary', SUMMARY],
  ['/analytics/trends', { metric: 'anomaly_count', data: [{ period: '2023-24', series: 'COST_OVERRUN', value: 12 }] }],
  ['/auth/me', { id: 'u1', username: 'ministry_user', full_name: 'Ministry Official', role: 'ROLE_MINISTRY', scope_type: null, scope_value: null }],
]

function renderApp(route = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    const match = ROUTES.find(([path]) => String(url).includes(path))
    return Promise.resolve({
      ok: Boolean(match),
      status: match ? 200 : 404,
      json: () => Promise.resolve(match ? match[1] : {}),
    })
  })
  // Recharts needs a non-zero layout box in jsdom.
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 900 })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 })
})

afterEach(() => {
  writeTokens(null)
  vi.restoreAllMocks()
})

describe('App shell', () => {
  it('shows the login screen when no session exists', async () => {
    renderApp()
    expect(await screen.findByRole('heading', { name: 'MPLADS Sentinel' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Username/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign in/ })).toBeInTheDocument()
  })

  it('offers the SRS seed accounts as one-click demo logins', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'MPLADS Sentinel' })
    expect(screen.getByRole('button', { name: 'admin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'mp_user' })).toBeInTheDocument()
  })

  it('renders the national dashboard for an authenticated ministry user', async () => {
    writeTokens({
      access_token: 'token',
      user: { id: 'u1', username: 'ministry_user', full_name: 'Ministry Official', role: 'ROLE_MINISTRY' },
    })
    renderApp()

    expect(await screen.findByText('Total Works Analysed')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('739')).toBeInTheDocument())
    expect(screen.getByText('₹ 61.69 Cr')).toBeInTheDocument()
    expect(screen.getByText('State Risk Heatmap')).toBeInTheDocument()
  })

  it('hides the Administration tab from non-admin roles', async () => {
    writeTokens({
      access_token: 'token',
      user: { id: 'u1', username: 'ministry_user', full_name: 'Ministry Official', role: 'ROLE_MINISTRY' },
    })
    renderApp()

    await screen.findByText('Total Works Analysed')
    expect(screen.getByRole('link', { name: 'Alerts' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument()
  })
})
