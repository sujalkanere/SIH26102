import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  Area, AreaChart, CartesianGrid, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../lib/api'
import { formatCount, formatCrore, formatDate, formatRupees, humanize } from '../lib/format'
import {
  DataTable, ErrorNote, KpiCard, Loading, Pagination, Panel, RiskBadge, Select,
} from '../components/ui'

const CATEGORY_COLORS = ['#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f', '#c62828', '#5d4037', '#9e9d24', '#455a64']
const COMPONENT_LABELS = {
  cost_overrun: 'Cost Overrun',
  delay: 'Delays',
  duplicate: 'Duplicates',
  pattern: 'Patterns',
  fund_utilization: 'Fund Utilisation',
}
const MAX_COMPONENT = { cost_overrun: 25, delay: 25, duplicate: 25, pattern: 15, fund_utilization: 10 }

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
    queryFn: () =>
      api.works({
        constituency: name,
        financial_year: financialYear,
        page,
        per_page: 25,
        sort_by: sort.by,
        sort_order: sort.order,
        ...filters,
      }),
  })

  const radarData = useMemo(() => {
    const components = detail.data?.risk_components || {}
    return Object.entries(COMPONENT_LABELS).map(([key, label]) => ({
      axis: label,
      score: components[key] || 0,
      max: MAX_COMPONENT[key],
    }))
  }, [detail.data])

  const timeline = useMemo(() => {
    const rows = detail.data?.expenditure_timeline || []
    const categories = [...new Set(rows.map((r) => r.category))]
    const periods = [...new Set(rows.map((r) => r.period))].sort()
    const series = periods.map((period) => {
      const entry = { period }
      categories.forEach((category) => {
        entry[category] = rows.find((r) => r.period === period && r.category === category)?.expenditure || 0
      })
      return entry
    })
    return { categories, series }
  }, [detail.data])

  function toggleSort(column) {
    setSort((prev) =>
      prev.by === column ? { by: column, order: prev.order === 'desc' ? 'asc' : 'desc' } : { by: column, order: 'desc' },
    )
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

  if (detail.isLoading) return <Loading label="Loading constituency analytics…" />
  if (detail.error) return <ErrorNote error={detail.error} />

  const summary = detail.data.constituency

  const columns = [
    { key: 'work_id', header: 'Work ID', render: (row) => <Link to={`/works/${row.work_id}`}>{row.work_id}</Link> },
    { key: 'work_description', header: 'Description', render: (row) => (
      <span title={row.work_description}>{row.work_description.slice(0, 52)}{row.work_description.length > 52 ? '…' : ''}</span>
    ) },
    { key: 'work_category', header: 'Category', render: (row) => humanize(row.work_category) },
    { key: 'sanctioned_amount', header: 'Sanctioned', sortable: true, active: sort.by === 'sanctioned_amount',
      desc: sort.order === 'desc', onSort: () => toggleSort('sanctioned_amount'),
      render: (row) => formatRupees(row.sanctioned_amount) },
    { key: 'actual_expenditure', header: 'Spent', render: (row) => formatRupees(row.actual_expenditure) },
    { key: 'cost_overrun_percentage', header: 'Overrun %', sortable: true,
      active: sort.by === 'cost_overrun_percentage', desc: sort.order === 'desc',
      onSort: () => toggleSort('cost_overrun_percentage'),
      render: (row) => `${row.cost_overrun_percentage.toFixed(1)}%` },
    { key: 'work_status', header: 'Status', render: (row) => humanize(row.work_status) },
    { key: 'risk_score', header: 'Risk', sortable: true, active: sort.by === 'risk_score',
      desc: sort.order === 'desc', onSort: () => toggleSort('risk_score'),
      render: (row) => <RiskBadge score={row.risk_score} tier={row.risk_tier} /> },
  ]

  return (
    <>
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.85rem', marginBottom: '0.7rem' }}>
        <Link to="/">National</Link> › <Link to={`/state/${encodeURIComponent(summary.state)}`}>{summary.state}</Link> › <strong>{summary.name}</strong>
      </nav>

      <div className="kpi-grid">
        <KpiCard label="Works Sanctioned" icon="🗂" value={formatCount(summary.total_works)} accent="#1565c0" />
        <KpiCard label="Funds Released" icon="₹" value={formatCrore(summary.total_funds_released)} accent="#2e7d32"
          hint={`${formatCrore(summary.total_expenditure)} spent`} />
        <KpiCard label="Fund Utilisation" icon="📊" value={`${summary.fund_utilization_rate.toFixed(1)}%`} accent="#00838f" />
        <KpiCard label="Risk Score" icon="🎯" value={summary.risk_score} accent="#ef6c00" hint={summary.risk_tier} />
        <KpiCard label="Active Anomalies" icon="⚠" value={formatCount(summary.active_anomalies)} accent="#c62828"
          hint={`MP: ${summary.mp_name}`} />
      </div>

      <div className="grid-2">
        <Panel title="Risk Component Breakdown" subtitle="Average points contributed per work">
          <div role="img" aria-label="Radar chart of risk components">
            <ResponsiveContainer width="100%" height={290}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="axis" fontSize={11} />
                <PolarRadiusAxis angle={90} domain={[0, 25]} fontSize={10} />
                <Radar name="Average score" dataKey="score" stroke="#1e6091" fill="#1e6091" fillOpacity={0.45} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Expenditure Over Time by Category" subtitle="Monthly expenditure, stacked by work category">
          <div role="img" aria-label="Stacked area chart of expenditure by category">
            <ResponsiveContainer width="100%" height={290}>
              <AreaChart data={timeline.series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" fontSize={10} />
                <YAxis fontSize={10} tickFormatter={(value) => `${(value / 1e5).toFixed(0)}L`} />
                <Tooltip formatter={(value, name) => [formatRupees(value), humanize(name)]} />
                {timeline.categories.map((category, index) => (
                  <Area
                    key={category}
                    type="monotone"
                    dataKey={category}
                    stackId="1"
                    stroke={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                    fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
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
          subtitle={`${detail.data.duplicate_pairs.length} pair(s) flagged by text-similarity analysis`}
        >
          {detail.data.duplicate_pairs.map((pair) => (
            <div className="dup-card" key={`${pair.work_id_a}-${pair.work_id_b}`}>
              <div>
                <strong>{pair.work_id_a}</strong> — {pair.description_a}
                <br />
                <small>{formatRupees(pair.amount_a)} · {formatDate(pair.sanction_date_a)}</small>
              </div>
              <p className="vs">
                ⇅ similarity {(pair.text_similarity * 100).toFixed(0)}% · composite score {pair.composite_score} ·{' '}
                <RiskBadge tier={pair.severity} />
              </p>
              <div>
                <strong>{pair.work_id_b}</strong> — {pair.description_b}
                <br />
                <small>{formatRupees(pair.amount_b)} · {formatDate(pair.sanction_date_b)}</small>
              </div>
            </div>
          ))}
        </Panel>
      )}

      <Panel
        title="All Works in Constituency"
        actions={<button type="button" onClick={exportCsv}>⭳ Export CSV</button>}
      >
        <div className="filters">
          <Select
            label="Status" value={filters.status}
            onChange={(value) => { setFilters({ ...filters, status: value }); setPage(1) }}
            options={['SANCTIONED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED']}
          />
          <Select
            label="Risk tier" value={filters.risk_tier}
            onChange={(value) => { setFilters({ ...filters, risk_tier: value }); setPage(1) }}
            options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']}
          />
          <label className="field">
            <span>Search description</span>
            <input
              type="search" value={filters.search}
              onChange={(event) => { setFilters({ ...filters, search: event.target.value }); setPage(1) }}
              placeholder="e.g. community hall"
            />
          </label>
        </div>

        {works.isLoading ? (
          <Loading />
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
