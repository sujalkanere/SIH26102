import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../lib/api'
import {
  ANOMALY_COLORS, RISK_COLORS, RISK_GLYPHS, formatCount, formatCrore, humanize,
} from '../lib/format'
import { ErrorNote, KpiCard, Loading, Panel, RiskBadge } from '../components/ui'

export default function National({ financialYear }) {
  const navigate = useNavigate()
  const summary = useQuery({
    queryKey: ['national', financialYear],
    queryFn: () => api.nationalSummary({ financial_year: financialYear }),
  })
  const trends = useQuery({ queryKey: ['trends'], queryFn: () => api.trends('anomaly_count') })

  if (summary.isLoading) return <Loading label="Loading national overview…" />
  if (summary.error) return <ErrorNote error={summary.error} />

  const data = summary.data
  const donutData = Object.entries(data.anomaly_type_distribution).map(([name, value]) => ({ name, value }))
  const barData = data.top_risk_constituencies.map((c) => ({
    name: c.name, risk: c.risk_score, tier: c.risk_tier,
  }))

  return (
    <>
      <div className="kpi-grid">
        <KpiCard
          label="Total Works Analysed" icon="🗂"
          value={formatCount(data.total_works)} accent="#1565c0"
          hint={`${data.state_risk.length} states covered`}
        />
        <KpiCard
          label="Total Expenditure" icon="₹"
          value={formatCrore(data.total_expenditure)} accent="#2e7d32"
          hint={`of ${formatCrore(data.total_funds_released)} released`}
        />
        <KpiCard
          label="Anomalies Detected" icon="⚠"
          value={formatCount(data.anomalies_detected)} accent="#c62828"
          hint={`${data.severity_distribution.CRITICAL || 0} critical · ${data.severity_distribution.HIGH || 0} high`}
        />
        <KpiCard
          label="High-Risk Constituencies" icon="📍"
          value={formatCount(data.high_risk_constituencies)} accent="#ef6c00"
          hint="Risk tier HIGH or CRITICAL"
        />
      </div>

      <Panel
        title="State Risk Heatmap"
        subtitle="Average constituency risk score per state — select a state to drill down"
      >
        <div className="heatmap" role="group" aria-label="State risk heatmap">
          {data.state_risk.map((state) => (
            <button
              key={state.state}
              type="button"
              className="heat-cell"
              style={{ borderLeftColor: RISK_COLORS[state.risk_tier] }}
              onClick={() => navigate(`/state/${encodeURIComponent(state.state)}`)}
              aria-label={`${state.state}: risk ${state.avg_risk_score}, tier ${state.risk_tier}, ${state.total_works} works, ${state.anomaly_count} anomalies`}
            >
              <strong>
                <span aria-hidden="true">{RISK_GLYPHS[state.risk_tier]}</span> {state.state}
              </strong>
              <span>
                Risk {state.avg_risk_score} · {formatCount(state.total_works)} works ·{' '}
                {formatCount(state.anomaly_count)} alerts
              </span>
            </button>
          ))}
        </div>
        <div className="legend">
          {Object.entries(RISK_COLORS).map(([tier, color]) => (
            <span key={tier}>
              <i style={{ color }} aria-hidden="true">{RISK_GLYPHS[tier]}</i>
              {tier}
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title="Top 10 High-Risk Constituencies" subtitle="Select a bar to open the detail view">
          <div role="img" aria-label="Bar chart of the ten highest-risk constituencies">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-40} textAnchor="end" interval={0} height={80} fontSize={11} />
                <YAxis domain={[0, 100]} fontSize={11} />
                <Tooltip />
                <Bar
                  dataKey="risk"
                  name="Risk score"
                  onClick={(entry) => navigate(`/constituency/${encodeURIComponent(entry.name)}`)}
                >
                  {barData.map((entry) => (
                    <Cell key={entry.name} fill={RISK_COLORS[entry.tier]} cursor="pointer" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Anomaly Type Distribution" subtitle="Active alerts grouped by detection category">
          <div role="img" aria-label="Donut chart of anomaly types">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100}>
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={ANOMALY_COLORS[entry.name] || '#78909c'} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, humanize(name)]} />
                <Legend formatter={(value) => humanize(value)} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Anomaly Trends Over Financial Years" subtitle="One series per anomaly type">
        <TrendChart query={trends} />
      </Panel>

      <Panel title="Highest-Risk Constituencies" subtitle="Ranked by composite risk score">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Constituency</th>
                <th scope="col">State</th>
                <th scope="col">Works</th>
                <th scope="col">Utilisation</th>
                <th scope="col">Alerts</th>
                <th scope="col">Risk</th>
              </tr>
            </thead>
            <tbody>
              {data.top_risk_constituencies.map((row) => (
                <tr
                  key={row.name}
                  className="clickable"
                  onClick={() => navigate(`/constituency/${encodeURIComponent(row.name)}`)}
                >
                  <td>{row.name}</td>
                  <td>{row.state}</td>
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

function TrendChart({ query }) {
  if (query.isLoading) return <Loading />
  if (query.error) return <ErrorNote error={query.error} />

  const periods = [...new Set(query.data.data.map((point) => point.period))].sort()
  const series = [...new Set(query.data.data.map((point) => point.series))]
  const rows = periods.map((period) => {
    const row = { period }
    series.forEach((name) => {
      row[name] = query.data.data.find((p) => p.period === period && p.series === name)?.value || 0
    })
    return row
  })

  return (
    <div role="img" aria-label="Line chart of anomaly counts by financial year">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip formatter={(value, name) => [value, humanize(name)]} />
          <Legend formatter={(value) => humanize(value)} wrapperStyle={{ fontSize: 11 }} />
          {series.map((name) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={ANOMALY_COLORS[name] || '#607d8b'}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
