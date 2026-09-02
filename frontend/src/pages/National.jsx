import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../lib/api'
import {
  ANOMALY_COLORS, RISK_COLORS, formatCompactRupees, formatCount, formatCrore, humanize,
} from '../lib/format'
import {
  ChartTooltip, ErrorNote, KpiCard, Panel, RiskMeter, SkeletonKpis, SkeletonPanel,
} from '../components/ui'

export default function National({ financialYear }) {
  const navigate = useNavigate()
  const summary = useQuery({
    queryKey: ['national', financialYear],
    queryFn: () => api.nationalSummary({ financial_year: financialYear }),
  })
  const trends = useQuery({ queryKey: ['trends'], queryFn: () => api.trends('anomaly_count') })

  if (summary.isLoading) {
    return <><SkeletonKpis /><SkeletonPanel /><SkeletonPanel /></>
  }
  if (summary.error) return <ErrorNote error={summary.error} />

  const data = summary.data
  const utilisation = data.total_funds_released
    ? (data.total_expenditure / data.total_funds_released) * 100
    : 0

  const donutData = Object.entries(data.anomaly_type_distribution)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const barData = data.top_risk_constituencies.map((c) => ({
    name: c.name, risk: c.risk_score, tier: c.risk_tier,
  }))

  return (
    <>
      <div className="kpi-grid">
        <KpiCard
          label="Works Analysed" icon="▤" accent="#4c6ef5" soft="#e7ecff"
          value={formatCount(data.total_works)}
          hint={`Across ${data.state_risk.length} states`}
        />
        <KpiCard
          label="Total Expenditure" icon="₹" accent="#12b886" soft="#e6fcf5"
          value={formatCrore(data.total_expenditure)}
          hint={`${utilisation.toFixed(1)}% of ${formatCrore(data.total_funds_released)} released`}
        />
        <KpiCard
          label="Active Anomalies" icon="⚑" accent="#f03e3e" soft="#fff5f5"
          value={formatCount(data.anomalies_detected)}
          hint={`${data.severity_distribution.CRITICAL || 0} critical · ${data.severity_distribution.HIGH || 0} high`}
        />
        <KpiCard
          label="High-Risk Constituencies" icon="◈" accent="#fd7e14" soft="#fff4e6"
          value={formatCount(data.high_risk_constituencies)}
          hint="Risk tier HIGH or CRITICAL"
        />
      </div>

      <Panel
        title="State Risk Heatmap"
        subtitle="Average constituency risk per state — select a state to drill down"
      >
        <div className="heatmap" role="group" aria-label="State risk heatmap">
          {data.state_risk.map((state) => (
            <button
              key={state.state}
              type="button"
              className="heat-cell"
              style={{ '--tier-color': RISK_COLORS[state.risk_tier] }}
              onClick={() => navigate(`/state/${encodeURIComponent(state.state)}`)}
              aria-label={`${state.state}: risk score ${state.avg_risk_score}, tier ${state.risk_tier}, ${state.total_works} works, ${state.anomaly_count} alerts`}
            >
              <span className="heat-top">
                <strong>{state.state}</strong>
                <span className="heat-score">{state.avg_risk_score}</span>
              </span>
              <span className="heat-meta">
                {formatCount(state.total_works)} works · {formatCount(state.anomaly_count)} alerts
              </span>
              <span className="heat-bar"><i style={{ width: `${state.avg_risk_score}%` }} /></span>
            </button>
          ))}
        </div>
        <div className="legend">
          {Object.entries(RISK_COLORS).map(([tier, color]) => (
            <span className="legend-item" key={tier}>
              <span className="legend-swatch" style={{ background: color }} aria-hidden="true" />
              {tier}
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title="Highest-Risk Constituencies" subtitle="Select a bar to open the detail view">
          <div className="chart-wrap" role="img" aria-label="Bar chart of the ten highest-risk constituencies">
            <ResponsiveContainer width="100%" height={318}>
              <BarChart data={barData} margin={{ top: 6, right: 8, bottom: 62, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" angle={-38} textAnchor="end" interval={0} height={78} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(76,110,245,0.07)' }} />
                <Bar
                  dataKey="risk" name="Risk score" radius={[5, 5, 0, 0]} maxBarSize={44}
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

        <Panel title="Anomaly Distribution" subtitle="Active alerts grouped by detection category">
          <div className="chart-wrap" role="img" aria-label="Donut chart of anomaly types">
            <ResponsiveContainer width="100%" height={318}>
              <PieChart>
                <Pie
                  data={donutData} dataKey="value" nameKey="name"
                  innerRadius={66} outerRadius={104} paddingAngle={2} stroke="none"
                >
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={ANOMALY_COLORS[entry.name] || '#868e96'} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  formatter={(value) => <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{humanize(value)}</span>}
                  iconType="circle" iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Anomaly Trends" subtitle="Detections per financial year, stacked by anomaly type">
        <TrendChart query={trends} />
      </Panel>

      <Panel title="Risk Leaderboard" subtitle="Constituencies ranked by composite risk score" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Constituency</th>
                <th scope="col">State</th>
                <th scope="col">Works</th>
                <th scope="col">Expenditure</th>
                <th scope="col">Utilisation</th>
                <th scope="col">Alerts</th>
                <th scope="col">Risk</th>
              </tr>
            </thead>
            <tbody>
              {data.top_risk_constituencies.map((row, index) => (
                <tr
                  key={row.name} className="clickable"
                  onClick={() => navigate(`/constituency/${encodeURIComponent(row.name)}`)}
                >
                  <td className="num" style={{ color: 'var(--text-3)', fontWeight: 700 }}>{index + 1}</td>
                  <td style={{ fontWeight: 600 }}>{row.name}</td>
                  <td style={{ color: 'var(--text-2)' }}>{row.state}</td>
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

function TrendChart({ query }) {
  if (query.isLoading) return <div className="skel" style={{ height: 300 }} aria-hidden="true" />
  if (query.error) return <ErrorNote error={query.error} />

  const points = query.data.data
  const periods = [...new Set(points.map((point) => point.period))].sort()
  const series = [...new Set(points.map((point) => point.series))]
  const rows = periods.map((period) => {
    const row = { period }
    series.forEach((name) => {
      row[name] = points.find((p) => p.period === period && p.series === name)?.value || 0
    })
    return row
  })

  return (
    <div className="chart-wrap" role="img" aria-label="Stacked area chart of anomaly counts by financial year">
      <ResponsiveContainer width="100%" height={330}>
        <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <defs>
            {series.map((name) => (
              <linearGradient key={name} id={`g-${name}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ANOMALY_COLORS[name] || '#868e96'} stopOpacity={0.65} />
                <stop offset="100%" stopColor={ANOMALY_COLORS[name] || '#868e96'} stopOpacity={0.06} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="period" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            formatter={(value) => <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{humanize(value)}</span>}
            iconType="circle" iconSize={8}
          />
          {series.map((name) => (
            <Area
              key={name} type="monotone" dataKey={name} stackId="1"
              stroke={ANOMALY_COLORS[name] || '#868e96'} strokeWidth={2}
              fill={`url(#g-${name})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
