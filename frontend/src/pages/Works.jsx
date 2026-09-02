import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import {
  ANOMALY_ICONS, RISK_COLORS, formatCompactRupees, formatDate, formatRupees, humanize,
} from '../lib/format'
import {
  DataTable, ErrorNote, Pagination, Panel, RiskBadge, RiskMeter, SeverityBadge,
  Select, SkeletonPanel,
} from '../components/ui'

const COMPONENT_META = {
  cost_overrun: { label: 'Cost overrun', max: 25 },
  delay: { label: 'Delay', max: 25 },
  duplicate: { label: 'Duplicate', max: 25 },
  pattern: { label: 'Pattern', max: 15 },
  fund_utilization: { label: 'Fund utilisation', max: 10 },
}

export function WorksExplorer({ financialYear }) {
  const [filters, setFilters] = useState({ risk_tier: '', status: '', search: '' })
  const [sort, setSort] = useState({ by: 'risk_score', order: 'desc' })
  const [page, setPage] = useState(1)

  const works = useQuery({
    queryKey: ['works', financialYear, filters, sort, page],
    queryFn: () => api.works({
      financial_year: financialYear, page, per_page: 25,
      sort_by: sort.by, sort_order: sort.order, ...filters,
    }),
  })

  function toggleSort(column) {
    setSort((prev) => prev.by === column
      ? { by: column, order: prev.order === 'desc' ? 'asc' : 'desc' }
      : { by: column, order: 'desc' })
    setPage(1)
  }

  const columns = [
    { key: 'work_id', header: 'Work ID', render: (row) => <Link to={`/works/${row.work_id}`}>{row.work_id}</Link> },
    { key: 'work_description', header: 'Description', render: (row) => (
      <span title={row.work_description}>
        {row.work_description.slice(0, 46)}{row.work_description.length > 46 ? '…' : ''}
      </span>
    ) },
    { key: 'constituency_name', header: 'Constituency' },
    { key: 'work_category', header: 'Category', render: (row) => humanize(row.work_category) },
    { key: 'sanctioned_amount', header: 'Sanctioned', numeric: true, sortable: true,
      active: sort.by === 'sanctioned_amount', desc: sort.order === 'desc',
      onSort: () => toggleSort('sanctioned_amount'), render: (row) => formatCompactRupees(row.sanctioned_amount) },
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
    <Panel title="Works Explorer" subtitle="Every sanctioned work visible to your role, ranked by risk" flush>
      <div className="filters">
        <Select label="Risk tier" value={filters.risk_tier}
          onChange={(value) => { setFilters({ ...filters, risk_tier: value }); setPage(1) }}
          options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']} />
        <Select label="Status" value={filters.status}
          onChange={(value) => { setFilters({ ...filters, status: value }); setPage(1) }}
          options={['SANCTIONED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED']} />
        <label className="field">
          <span>Search</span>
          <input type="search" value={filters.search} placeholder="e.g. borewell"
            onChange={(event) => { setFilters({ ...filters, search: event.target.value }); setPage(1) }} />
        </label>
      </div>

      {works.isLoading ? (
        <div style={{ padding: '1.25rem' }}>
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="skel skel-row" />)}
        </div>
      ) : works.error ? (
        <div style={{ padding: '1.25rem' }}><ErrorNote error={works.error} /></div>
      ) : (
        <>
          <DataTable columns={columns} rows={works.data.data} caption="All works" />
          <Pagination pagination={works.data.pagination} onChange={setPage} />
        </>
      )}
    </Panel>
  )
}

export function WorkDetail() {
  const { workId } = useParams()
  const detail = useQuery({ queryKey: ['work', workId], queryFn: () => api.work(workId) })

  if (detail.isLoading) return <SkeletonPanel />
  if (detail.error) return <ErrorNote error={detail.error} />

  const { work, anomalies } = detail.data

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">National</Link>
        <span className="sep">/</span>
        <Link to={`/constituency/${encodeURIComponent(work.constituency_name)}`}>{work.constituency_name}</Link>
        <span className="sep">/</span>
        <strong style={{ color: 'var(--text)' }}>{work.work_id}</strong>
      </nav>

      <Panel
        title={work.work_description}
        subtitle={`${humanize(work.work_category)} · ${work.constituency_name}, ${work.state} · FY ${work.financial_year}`}
        actions={<RiskBadge score={work.risk_score} tier={work.risk_tier} />}
      >
        <div className="stat-row" style={{ marginBottom: '1.2rem' }}>
          <div><strong>{formatCompactRupees(work.sanctioned_amount)}</strong><span>Sanctioned</span></div>
          <div><strong>{formatCompactRupees(work.actual_expenditure)}</strong><span>Spent</span></div>
          <div>
            <strong style={{ color: work.cost_overrun_percentage > 15 ? 'var(--critical)' : 'var(--low)' }}>
              {work.cost_overrun_percentage > 0 ? '+' : ''}{work.cost_overrun_percentage.toFixed(1)}%
            </strong>
            <span>Overrun</span>
          </div>
          <div><strong>{humanize(work.work_status)}</strong><span>Status</span></div>
        </div>

        <dl className="kv">
          <dt>Sanctioned amount</dt><dd>{formatRupees(work.sanctioned_amount)}</dd>
          <dt>Actual expenditure</dt><dd>{formatRupees(work.actual_expenditure)}</dd>
          <dt>Sanction date</dt><dd>{formatDate(work.sanction_date)}</dd>
          <dt>Expected completion</dt><dd>{formatDate(work.expected_completion_date)}</dd>
          <dt>Actual completion</dt><dd>{formatDate(work.completion_date)}</dd>
          <dt>Implementing agency</dt><dd>{work.implementing_agency || '—'}</dd>
        </dl>
      </Panel>

      <div className="grid-2">
        <Panel title="Risk Score Breakdown" subtitle={`Composite score ${work.risk_score} of 100`}>
          {Object.entries(COMPONENT_META).map(([key, meta]) => {
            const points = work.risk_components?.[key] ?? 0
            return (
              <div key={key} style={{ marginBottom: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: '0.28rem' }}>
                  <span style={{ fontWeight: 550 }}>{meta.label}</span>
                  <span className="num" style={{ color: points > 0 ? 'var(--text)' : 'var(--text-3)', fontWeight: 700 }}>
                    {points} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>/ {meta.max}</span>
                  </span>
                </div>
                <div className="meter-track">
                  <div className="meter-fill" style={{
                    width: `${(points / meta.max) * 100}%`,
                    background: points > 0 ? RISK_COLORS[work.risk_tier] : 'var(--border)',
                  }} />
                </div>
              </div>
            )
          })}
        </Panel>

        <Panel title="Detected Anomalies" subtitle={`${anomalies.length} finding(s) for this work`}>
          {anomalies.length === 0 ? (
            <p className="muted">No anomalies detected for this work.</p>
          ) : (
            <ul className="timeline">
              {anomalies.map((anomaly) => (
                <li key={anomaly.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.22rem' }}>
                    <span aria-hidden="true">{ANOMALY_ICONS[anomaly.anomaly_type] || '⚑'}</span>
                    <strong>{humanize(anomaly.anomaly_type)}</strong>
                    <SeverityBadge severity={anomaly.severity} />
                  </div>
                  <small style={{ color: 'var(--text-3)' }}>
                    {humanize(anomaly.detection_method)} · {(anomaly.confidence_score * 100).toFixed(0)}% confidence · {formatDate(anomaly.detected_at)}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
