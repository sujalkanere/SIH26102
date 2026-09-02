import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate, formatRupees, humanize } from '../lib/format'
import {
  DataTable, ErrorNote, Loading, Pagination, Panel, RiskBadge, SeverityBadge, Select,
} from '../components/ui'

const COMPONENT_LABELS = {
  cost_overrun: 'Cost overrun',
  delay: 'Delay',
  duplicate: 'Duplicate',
  pattern: 'Pattern',
  fund_utilization: 'Fund utilisation',
}

export function WorksExplorer({ financialYear }) {
  const [filters, setFilters] = useState({ risk_tier: '', status: '', search: '' })
  const [sort, setSort] = useState({ by: 'risk_score', order: 'desc' })
  const [page, setPage] = useState(1)

  const works = useQuery({
    queryKey: ['works', financialYear, filters, sort, page],
    queryFn: () =>
      api.works({
        financial_year: financialYear,
        page,
        per_page: 25,
        sort_by: sort.by,
        sort_order: sort.order,
        ...filters,
      }),
  })

  function toggleSort(column) {
    setSort((prev) =>
      prev.by === column ? { by: column, order: prev.order === 'desc' ? 'asc' : 'desc' } : { by: column, order: 'desc' },
    )
    setPage(1)
  }

  const columns = [
    { key: 'work_id', header: 'Work ID', render: (row) => <Link to={`/works/${row.work_id}`}>{row.work_id}</Link> },
    { key: 'constituency_name', header: 'Constituency' },
    { key: 'work_category', header: 'Category', render: (row) => humanize(row.work_category) },
    { key: 'sanctioned_amount', header: 'Sanctioned', sortable: true, active: sort.by === 'sanctioned_amount',
      desc: sort.order === 'desc', onSort: () => toggleSort('sanctioned_amount'),
      render: (row) => formatRupees(row.sanctioned_amount) },
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
    <Panel title="Works Explorer" subtitle="Every sanctioned work visible to your role, ranked by risk">
      <div className="filters">
        <Select label="Risk tier" value={filters.risk_tier}
          onChange={(value) => { setFilters({ ...filters, risk_tier: value }); setPage(1) }}
          options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']} />
        <Select label="Status" value={filters.status}
          onChange={(value) => { setFilters({ ...filters, status: value }); setPage(1) }}
          options={['SANCTIONED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED']} />
        <label className="field">
          <span>Search description</span>
          <input type="search" value={filters.search} placeholder="e.g. borewell"
            onChange={(event) => { setFilters({ ...filters, search: event.target.value }); setPage(1) }} />
        </label>
      </div>

      {works.isLoading && <Loading />}
      <ErrorNote error={works.error} />
      {works.data && (
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

  if (detail.isLoading) return <Loading />
  if (detail.error) return <ErrorNote error={detail.error} />

  const { work, anomalies } = detail.data

  return (
    <>
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.85rem', marginBottom: '0.7rem' }}>
        <Link to="/">National</Link> ›{' '}
        <Link to={`/constituency/${encodeURIComponent(work.constituency_name)}`}>{work.constituency_name}</Link> ›{' '}
        <strong>{work.work_id}</strong>
      </nav>

      <Panel
        title={work.work_description}
        subtitle={`${humanize(work.work_category)} · ${work.constituency_name}, ${work.state} · FY ${work.financial_year}`}
        actions={<RiskBadge score={work.risk_score} tier={work.risk_tier} />}
      >
        <dl className="drawer" style={{ padding: 0 }}>
          <dt>Sanctioned amount</dt><dd>{formatRupees(work.sanctioned_amount)}</dd>
          <dt>Actual expenditure</dt><dd>{formatRupees(work.actual_expenditure)}</dd>
          <dt>Cost overrun</dt><dd>{work.cost_overrun_percentage.toFixed(2)}%</dd>
          <dt>Status</dt><dd>{humanize(work.work_status)}</dd>
          <dt>Sanction date</dt><dd>{formatDate(work.sanction_date)}</dd>
          <dt>Expected completion</dt><dd>{formatDate(work.expected_completion_date)}</dd>
          <dt>Actual completion</dt><dd>{formatDate(work.completion_date)}</dd>
          <dt>Implementing agency</dt><dd>{work.implementing_agency || '—'}</dd>
        </dl>
      </Panel>

      <div className="grid-2">
        <Panel title="Risk Score Breakdown" subtitle={`Composite score ${work.risk_score}/100`}>
          <table>
            <thead>
              <tr><th scope="col">Component</th><th scope="col">Points</th></tr>
            </thead>
            <tbody>
              {Object.entries(COMPONENT_LABELS).map(([key, label]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td>{work.risk_components?.[key] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Detected Anomalies" subtitle={`${anomalies.length} finding(s) for this work`}>
          {anomalies.length === 0 ? (
            <p className="muted">No anomalies detected for this work.</p>
          ) : (
            <ul className="timeline">
              {anomalies.map((anomaly) => (
                <li key={anomaly.id}>
                  <SeverityBadge severity={anomaly.severity} /> {humanize(anomaly.anomaly_type)}
                  <br />
                  <small className="muted">
                    {humanize(anomaly.detection_method)} · {formatDate(anomaly.detected_at)}
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
