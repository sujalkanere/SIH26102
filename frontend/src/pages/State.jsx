import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { formatCompactRupees, formatCount, formatCrore } from '../lib/format'
import { ErrorNote, KpiCard, Panel, RiskMeter, SkeletonKpis, SkeletonPanel } from '../components/ui'

export default function State({ financialYear }) {
  const { state } = useParams()
  const navigate = useNavigate()
  const summary = useQuery({
    queryKey: ['state', state, financialYear],
    queryFn: () => api.stateSummary(state, { financial_year: financialYear }),
  })

  if (summary.isLoading) return <><SkeletonKpis /><SkeletonPanel /></>
  if (summary.error) return <ErrorNote error={summary.error} />

  const data = summary.data

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">National</Link>
        <span className="sep">/</span>
        <strong style={{ color: 'var(--text)' }}>{data.state}</strong>
      </nav>

      <div className="kpi-grid">
        <KpiCard label="Constituencies" icon="◈" accent="#4c6ef5" soft="#e7ecff" value={formatCount(data.constituencies.length)} />
        <KpiCard label="Total Works" icon="▤" accent="#12b886" soft="#e6fcf5" value={formatCount(data.total_works)} />
        <KpiCard label="Expenditure" icon="₹" accent="#1c7ed6" soft="#e7f5ff" value={formatCrore(data.total_expenditure)} />
        <KpiCard label="Average Risk" icon="◎" accent="#fd7e14" soft="#fff4e6" value={data.avg_risk_score} hint={data.risk_tier} />
      </div>

      <Panel title={`Constituencies in ${data.state}`} subtitle="Ranked by composite risk score" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Constituency</th>
                <th scope="col">District</th>
                <th scope="col">MP</th>
                <th scope="col">Works</th>
                <th scope="col">Expenditure</th>
                <th scope="col">Utilisation</th>
                <th scope="col">Alerts</th>
                <th scope="col">Risk</th>
              </tr>
            </thead>
            <tbody>
              {data.constituencies.map((row, index) => (
                <tr key={row.name} className="clickable"
                  onClick={() => navigate(`/constituency/${encodeURIComponent(row.name)}`)}>
                  <td className="num" style={{ color: 'var(--text-3)', fontWeight: 700 }}>{index + 1}</td>
                  <td style={{ fontWeight: 600 }}>{row.name}</td>
                  <td style={{ color: 'var(--text-2)' }}>{row.district}</td>
                  <td style={{ color: 'var(--text-2)' }}>{row.mp_name}</td>
                  <td className="num">{formatCount(row.total_works)}</td>
                  <td className="num">{formatCompactRupees(row.total_expenditure)}</td>
                  <td className="num">{row.fund_utilization_rate.toFixed(1)}%</td>
                  <td className="num">{formatCount(row.active_anomalies)}</td>
                  <td><RiskMeter score={row.risk_score} tier={row.risk_tier} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
