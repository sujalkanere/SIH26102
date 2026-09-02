import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatCount, formatCrore, humanize } from '../lib/format'
import { ErrorNote, KpiCard, Loading, Panel } from '../components/ui'

// ROLE_PUBLIC sees anonymised aggregates only — never work-level detail
// (FR-AAA-002 data_scope: AGGREGATE ONLY).
export default function PublicView({ onLogout }) {
  const summary = useQuery({ queryKey: ['public-summary'], queryFn: api.publicSummary })

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>🛡 MPLADS Sentinel — Transparency Dashboard</h1>
          <p className="tagline">Aggregate public statistics · MoSPI / DIID</p>
        </div>
        <div className="spacer" />
        <span className="role-chip">Public Viewer</span>
        <button type="button" onClick={onLogout}>Logout</button>
      </header>

      <main className="content">
        {summary.isLoading && <Loading />}
        <ErrorNote error={summary.error} />
        {summary.data && (
          <>
            <div className="kpi-grid">
              <KpiCard label="Works Monitored" icon="🗂" value={formatCount(summary.data.total_works)} accent="#1565c0" />
              <KpiCard label="Total Expenditure" icon="₹" value={formatCrore(summary.data.total_expenditure)} accent="#2e7d32" />
              <KpiCard label="Funds Released" icon="🏦" value={formatCrore(summary.data.total_funds_released)} accent="#00838f" />
              <KpiCard label="Anomalies Flagged" icon="⚠" value={formatCount(summary.data.anomalies_detected)} accent="#c62828"
                hint={`Average risk score ${summary.data.avg_risk_score}`} />
            </div>

            <Panel title="Anomalies by Category" subtitle="Counts only — no individual work details are published">
              <table>
                <thead>
                  <tr><th scope="col">Anomaly category</th><th scope="col">Count</th></tr>
                </thead>
                <tbody>
                  {Object.entries(summary.data.anomaly_type_distribution).map(([type, count]) => (
                    <tr key={type}>
                      <td>{humanize(type)}</td>
                      <td>{formatCount(count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </>
        )}
      </main>
    </div>
  )
}
