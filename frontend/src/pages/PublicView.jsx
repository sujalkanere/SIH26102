import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { ANOMALY_COLORS, ANOMALY_ICONS, formatCount, formatCrore, humanize } from '../lib/format'
import { ErrorNote, KpiCard, Panel, SkeletonKpis, SkeletonPanel } from '../components/ui'

// ROLE_PUBLIC sees anonymised aggregates only — never work-level detail
// (FR-AAA-002 data_scope: AGGREGATE ONLY).
export default function PublicView({ onLogout }) {
  const summary = useQuery({ queryKey: ['public-summary'], queryFn: api.publicSummary })

  return (
    <div className="app-shell">
      <div className="main-col">
        <header className="topbar">
          <span className="rail-mark" aria-hidden="true" style={{ width: 34, height: 34, fontSize: '1rem' }}>🛡</span>
          <div>
            <h2>MPLADS Transparency Dashboard</h2>
            <p className="sub">Aggregate public statistics · MoSPI / DIID</p>
          </div>
          <div className="spacer" />
          <span className="pill">Public Viewer</span>
          <button type="button" className="btn btn-sm" onClick={onLogout}>Sign out</button>
        </header>

        <main className="content">
          {summary.isLoading && <><SkeletonKpis /><SkeletonPanel /></>}
          <ErrorNote error={summary.error} />

          {summary.data && (
            <>
              <div className="kpi-grid">
                <KpiCard label="Works Monitored" icon="▤" accent="#4c6ef5" soft="#e7ecff"
                  value={formatCount(summary.data.total_works)} />
                <KpiCard label="Total Expenditure" icon="₹" accent="#12b886" soft="#e6fcf5"
                  value={formatCrore(summary.data.total_expenditure)} />
                <KpiCard label="Funds Released" icon="◎" accent="#1c7ed6" soft="#e7f5ff"
                  value={formatCrore(summary.data.total_funds_released)} />
                <KpiCard label="Anomalies Flagged" icon="⚑" accent="#f03e3e" soft="#fff5f5"
                  value={formatCount(summary.data.anomalies_detected)}
                  hint={`Average risk score ${summary.data.avg_risk_score}`} />
              </div>

              <Panel
                title="Anomalies by Category"
                subtitle="Aggregate counts only — no individual work details are published"
              >
                {Object.entries(summary.data.anomaly_type_distribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const total = Object.values(summary.data.anomaly_type_distribution)
                      .reduce((sum, value) => sum + value, 0) || 1
                    return (
                      <div key={type} style={{ marginBottom: '0.9rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '0.3rem' }}>
                          <span style={{ fontWeight: 550 }}>
                            <span aria-hidden="true">{ANOMALY_ICONS[type] || '⚑'}</span> {humanize(type)}
                          </span>
                          <span className="num" style={{ fontWeight: 700 }}>{formatCount(count)}</span>
                        </div>
                        <div className="meter-track">
                          <div className="meter-fill" style={{
                            width: `${(count / total) * 100}%`,
                            background: ANOMALY_COLORS[type] || '#868e96',
                          }} />
                        </div>
                      </div>
                    )
                  })}
              </Panel>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
