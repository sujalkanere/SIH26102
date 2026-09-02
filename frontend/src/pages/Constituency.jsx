import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  Area, AreaChart, CartesianGrid, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../lib/api'
import {
  CATEGORY_PALETTE, formatCompactRupees, formatCount, formatCrore, formatDate, formatRupees, humanize,
} from '../lib/format'
import {
  ChartTooltip, DataTable, ErrorNote, KpiCard, Pagination, Panel, RiskBadge, RiskMeter,
  Select, SkeletonKpis, SkeletonPanel,
} from '../components/ui'

const COMPONENT_LABELS = {
  cost_overrun: 'Cost Overrun',
  delay: 'Delays',
  duplicate: 'Duplicates',
  pattern: 'Patterns',
  fund_utilization: 'Fund Use',
}

export default function Constituency({ financialYear }) {
  const { name } = useParams()
  const [filters, setFilters] = useState({ status: '', risk_tier: '', search: '' })
  const [sort, setSort] = useState({ by: 'risk_score', order: 'desc' })
  const [page, setPage] = useState(1)

  const detail = useQuery({
    queryKey: ['constituency', name, financialYear],
    queryFn: () => api.constituency(name, { financial_year: financialYear }),
  })

  const works = useQuery({
    queryKey: ['constituency-works', name, financialYear, filters, sort, page],
    queryFn: () => api.works({
      constituency: name, financial_year: financialYear, page, per_page: 25,
      sort_by: sort.by, sort_order: sort.order, ...filters,
    }),
  })

  const radarData = useMemo(() => {
    const components = detail.data?.risk_components || {}
    return Object.entries(COMPONENT_LABELS).map(([key, label]) => ({
      axis: label, score: components[key] || 0,
    }))
  }, [detail.data])

  const timeline = useMemo(() => {
    const rows = detail.data?.expenditure_timeline || []
    const categories = [...new Set(rows.map((r) => r.category))]
    const periods = [...new Set(rows.map((r) => r.period))].sort()
    return {
      categories,
      series: periods.map((period) => {
        const entry = { period }
        categories.forEach((category) => {
          entry[category] = rows.find((r) => r.period === period && r.category === category)?.expenditure || 0
        })
        return entry
      }),
    }
  }, [detail.data])

  function toggleSort(column) {
    setSort((prev) => prev.by === column
      ? { by: column, order: prev.order === 'desc' ? 'asc' : 'desc' }
      : { by: column, order: 'desc' })
    setPage(1)
  }

  function exportCsv() {
    const rows = works.data?.data || []
    const headers = ['work_id', 'work_description', 'work_category', 'sanctioned_amount',
      'actual_expenditure', 'cost_overrun_percentage', 'work_status', 'risk_score', 'risk_tier']
    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${name}_works.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (detail.isLoading) return <><SkeletonKpis count={5} /><SkeletonPanel /></>
  if (detail.error) return <ErrorNote error={detail.error} />

  const summary = detail.data.constituency

  const columns = [
    { key: 'work_id', header: 'Work ID', render: (row) => <Link to={`/works/${row.work_id}`}>{row.work_id}</Link> },
    { key: 'work_description', header: 'Description', render: (row) => (
      <span title={row.work_description}>
        {row.work_description.slice(0, 48)}{row.work_description.length > 48 ? '…' : ''}
      </span>
    ) },
    { key: 'work_category', header: 'Category', render: (row) => humanize(row.work_category) },
    { key: 'sanctioned_amount', header: 'Sanctioned', numeric: true, sortable: true,
      active: sort.by === 'sanctioned_amount', desc: sort.order === 'desc',
      onSort: () => toggleSort('sanctioned_amount'), render: (row) => formatCompactRupees(row.sanctioned_amount) },
    { key: 'actual_expenditure', header: 'Spent', numeric: true, render: (row) => formatCompactRupees(row.actual_expenditure) },
    { key: 'cost_overrun_percentage', header: 'Overrun', numeric: true, sortable: true,
      active: sort.by === 'cost_overrun_percentage', desc: sort.order === 'desc',
      onSort: () => toggleSort('cost_overrun_percentage'),
      render: (row) => (
        <span style={{ color: row.cost_overrun_percentage > 15 ? 'var(--critical)' : 'var(--text-2)', fontWeight: row.cost_overrun_percentage > 15 ? 700 : 500 }}>
          {row.cost_overrun_percentage > 0 ? '+' : ''}{row.cost_overrun_percentage.toFixed(1)}%
        </span>
      ) },
    { key: 'work_status', header: 'Status', render: (row) => <span className="pill">{humanize(row.work_status)}</span> },
    { key: 'risk_score', header: 'Risk', sortable: true, active: sort.by === 'risk_score',
      desc: sort.order === 'desc', onSort: () => toggleSort('risk_score'),
      render: (row) => <RiskMeter score={row.risk_score} tier={row.risk_tier} /> },
  ]

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">National</Link>
        <span className="sep">/</span>
        <Link to={`/state/${encodeURIComponent(summary.state)}`}>{summary.state}</Link>
        <span className="sep">/</span>
        <strong style={{ color: 'var(--text)' }}>{summary.name}</strong>
      </nav>

      <div className="kpi-grid">
        <KpiCard label="Works Sanctioned" icon="▤" accent="#4c6ef5" soft="#e7ecff" value={formatCount(summary.total_works)} />
        <KpiCard label="Funds Released" icon="₹" accent="#12b886" soft="#e6fcf5"
          value={formatCrore(summary.total_funds_released)} hint={`${formatCrore(summary.total_expenditure)} spent`} />
        <KpiCard label="Fund Utilisation" icon="◎" accent="#1c7ed6" soft="#e7f5ff"
          value={`${summary.fund_utilization_rate.toFixed(1)}%`} />
        <KpiCard label="Risk Score" icon="◈" accent="#fd7e14" soft="#fff4e6"
          value={summary.risk_score} hint={summary.risk_tier} />
        <KpiCard label="Active Alerts" icon="⚑" accent="#f03e3e" soft="#fff5f5"
          value={formatCount(summary.active_anomalies)} hint={`MP: ${summary.mp_name}`} />
      </div>

      <div className="grid-2">
        <Panel title="Risk Component Breakdown" subtitle="Average points contributed per work">
          <div className="chart-wrap" role="img" aria-label="Radar chart of risk components">
            <ResponsiveContainer width="100%" height={296}>
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
                <PolarRadiusAxis angle={90} domain={[0, 25]} tick={{ fontSize: 10, fill: 'var(--text-3)' }} />
                <Radar name="Avg score" dataKey="score" stroke="#4c6ef5" strokeWidth={2} fill="#4c6ef5" fillOpacity={0.35} />
                <Tooltip content={<ChartTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Expenditure Over Time" subtitle="Monthly spend, stacked by work category">
          <div className="chart-wrap" role="img" aria-label="Stacked area chart of expenditure by category">
            <ResponsiveContainer width="100%" height={296}>
              <AreaChart data={timeline.series} margin={{ top: 8, right: 10, bottom: 0, left: -12 }}>
                <defs>
                  {timeline.categories.map((category, index) => (
                    <linearGradient key={category} id={`c-${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]} stopOpacity={0.6} />
                      <stop offset="100%" stopColor={CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]} stopOpacity={0.05} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(value) => `${(value / 1e5).toFixed(0)}L`} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip formatter={formatRupees} />} />
                {timeline.categories.map((category, index) => (
                  <Area
                    key={category} type="monotone" dataKey={category} stackId="1"
                    stroke={CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]} strokeWidth={1.5}
                    fill={`url(#c-${index})`}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {detail.data.duplicate_pairs.length > 0 && (
        <Panel
          title="Potential Duplicate Works"
          subtitle={`${detail.data.duplicate_pairs.length} pair(s) flagged by similarity analysis`}
        >
          {detail.data.duplicate_pairs.map((pair) => (
            <div className="dup-card" key={`${pair.work_id_a}-${pair.work_id_b}`}>
              <div className="dup-side">
                <strong>{pair.work_id_a}</strong>
                <p>{pair.description_a}</p>
                <small>{formatRupees(pair.amount_a)} · {formatDate(pair.sanction_date_a)}</small>
              </div>
              <div className="dup-mid">
                <span>⇅ <strong>{(pair.text_similarity * 100).toFixed(0)}%</strong> text match</span>
                <span>· score <strong>{pair.composite_score}</strong>/100</span>
                <RiskBadge tier={pair.severity} />
              </div>
              <div className="dup-side">
                <strong>{pair.work_id_b}</strong>
                <p>{pair.description_b}</p>
                <small>{formatRupees(pair.amount_b)} · {formatDate(pair.sanction_date_b)}</small>
              </div>
            </div>
          ))}
        </Panel>
      )}

      <Panel
        title="All Works" subtitle={`${summary.total_works} works in ${summary.name}`} flush
        actions={<button type="button" className="btn btn-sm" onClick={exportCsv}>⭳ Export CSV</button>}
      >
        <div className="filters">
          <Select label="Status" value={filters.status}
            onChange={(value) => { setFilters({ ...filters, status: value }); setPage(1) }}
            options={['SANCTIONED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED']} />
          <Select label="Risk tier" value={filters.risk_tier}
            onChange={(value) => { setFilters({ ...filters, risk_tier: value }); setPage(1) }}
            options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']} />
          <label className="field">
            <span>Search</span>
            <input type="search" value={filters.search} placeholder="e.g. community hall"
              onChange={(event) => { setFilters({ ...filters, search: event.target.value }); setPage(1) }} />
          </label>
        </div>

        {works.isLoading ? (
          <div style={{ padding: '1.25rem' }}>
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="skel skel-row" />)}
          </div>
        ) : (
          <>
            <DataTable columns={columns} rows={works.data?.data} caption="Works in this constituency" />
            <Pagination pagination={works.data?.pagination} onChange={setPage} />
          </>
        )}
      </Panel>
    </>
  )
}
