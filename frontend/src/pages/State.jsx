import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { formatCount, formatCrore } from '../lib/format'
import { ErrorNote, KpiCard, Loading, Panel, RiskBadge } from '../components/ui'

export default function State({ financialYear }) {
  const { state } = useParams()
  const navigate = useNavigate()
  const summary = useQuery({
    queryKey: ['state', state, financialYear],
    queryFn: () => api.stateSummary(state, { financial_year: financialYear }),
  })

  if (summary.isLoading) return <Loading label={`Loading ${state}…`} />
  if (summary.error) return <ErrorNote error={summary.error} />

  const data = summary.data

  return (
    <>
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.85rem', marginBottom: '0.7rem' }}>
        <Link to="/">National</Link> › <strong>{data.state}</strong>
      </nav>

      <div className="kpi-grid">
        <KpiCard label="Constituencies" icon="📍" value={formatCount(data.constituencies.length)} accent="#1565c0" />
        <KpiCard label="Total Works" icon="🗂" value={formatCount(data.total_works)} accent="#2e7d32" />
        <KpiCard label="Total Expenditure" icon="₹" value={formatCrore(data.total_expenditure)} accent="#00838f" />
        <KpiCard label="Average Risk" icon="🎯" value={data.avg_risk_score} accent="#ef6c00" hint={data.risk_tier} />
      </div>

      <Panel title={`Constituencies in ${data.state}`} subtitle="Ranked by composite risk score">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Constituency</th>
                <th scope="col">District</th>
                <th scope="col">MP</th>
                <th scope="col">Works</th>
                <th scope="col">Utilisation</th>
                <th scope="col">Alerts</th>
                <th scope="col">Risk</th>
              </tr>
            </thead>
            <tbody>
              {data.constituencies.map((row) => (
                <tr key={row.name} className="clickable"
                  onClick={() => navigate(`/constituency/${encodeURIComponent(row.name)}`)}>
                  <td>{row.name}</td>
                  <td>{row.district}</td>
                  <td>{row.mp_name}</td>
                  <td>{formatCount(row.total_works)}</td>
                  <td>{row.fund_utilization_rate.toFixed(1)}%</td>
                  <td>{formatCount(row.active_anomalies)}</td>
                  <td><RiskBadge score={row.risk_score} tier={row.risk_tier} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
