import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { formatDate, humanize } from '../lib/format'
import { useAuth } from '../lib/auth'
import {
  DataTable, ErrorNote, Loading, Pagination, Panel, SeverityBadge, Select, StatusPill,
} from '../components/ui'

const ANOMALY_TYPES = [
  'COST_OVERRUN', 'DUPLICATE_WORK', 'DELAYED_PROJECT', 'STALLED_PROJECT',
  'LOW_UTILIZATION', 'OVER_UTILIZATION', 'FUND_UTILIZATION_ANOMALY',
  'SUDDEN_UTILIZATION_SHIFT', 'AMOUNT_CLUSTERING', 'END_OF_YEAR_RUSH',
  'ROUND_NUMBER_BIAS', 'AGENCY_CONCENTRATION',
]
const STATUSES = ['NEW', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'RESOLVED', 'FALSE_POSITIVE']
const NEXT_ACTIONS = [
  { status: 'ACKNOWLEDGED', label: 'Acknowledge' },
  { status: 'UNDER_REVIEW', label: 'Start Review' },
  { status: 'RESOLVED', label: 'Resolve' },
  { status: 'FALSE_POSITIVE', label: 'False Positive' },
]

export default function Alerts() {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({ severity: '', type: '', status: '' })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)

  const alerts = useQuery({
    queryKey: ['anomalies', filters, page],
    queryFn: () => api.anomalies({ ...filters, page, per_page: 20 }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status, note }) => api.updateAnomaly(id, { status, note }),
    onSuccess: (updated) => {
      setSelected(updated)
      queryClient.invalidateQueries()
    },
  })

  const columns = [
    { key: 'id', header: 'Alert ID', render: (row) => row.id.slice(0, 8) },
    { key: 'detected_at', header: 'Detected', render: (row) => formatDate(row.detected_at) },
    { key: 'anomaly_type', header: 'Type', render: (row) => humanize(row.anomaly_type) },
    { key: 'severity', header: 'Severity', render: (row) => <SeverityBadge severity={row.severity} /> },
    { key: 'constituency_name', header: 'Constituency' },
    { key: 'state', header: 'State' },
    { key: 'work_key', header: 'Work', render: (row) => (row.work_key ? <Link to={`/works/${row.work_key}`}>{row.work_key}</Link> : '—') },
    { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
  ]

  return (
    <>
      <Panel title="Alert Management" subtitle="Review, triage and audit every detected anomaly">
        <div className="filters">
          <Select label="Severity" value={filters.severity}
            onChange={(value) => { setFilters({ ...filters, severity: value }); setPage(1) }}
            options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']} />
          <Select label="Anomaly type" value={filters.type}
            onChange={(value) => { setFilters({ ...filters, type: value }); setPage(1) }}
            options={ANOMALY_TYPES} />
          <Select label="Status" value={filters.status}
            onChange={(value) => { setFilters({ ...filters, status: value }); setPage(1) }}
            options={STATUSES} />
        </div>

        {alerts.isLoading && <Loading />}
        <ErrorNote error={alerts.error} />
        {alerts.data && (
          <>
            <DataTable
              columns={columns}
              rows={alerts.data.data}
              onRowClick={setSelected}
              caption="Detected anomaly alerts"
              empty="No alerts match the current filters."
            />
            <Pagination pagination={alerts.data.pagination} onChange={setPage} />
          </>
        )}
      </Panel>

      {selected && (
        <AlertDrawer
          alert={selected}
          canManage={can('manage_alerts')}
          onClose={() => setSelected(null)}
          onAction={(status, note) => updateStatus.mutate({ id: selected.id, status, note })}
          pending={updateStatus.isPending}
          error={updateStatus.error}
        />
      )}
    </>
  )
}

function AlertDrawer({ alert, canManage, onClose, onAction, pending, error }) {
  const [note, setNote] = useState('')

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="Alert detail" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <div className="panel-head">
          <h2>{humanize(alert.anomaly_type)}</h2>
          <button type="button" onClick={onClose} aria-label="Close alert detail">✕</button>
        </div>

        <p>
          <SeverityBadge severity={alert.severity} /> <StatusPill status={alert.status} />
        </p>

        <dl>
          <dt>Alert ID</dt><dd>{alert.id}</dd>
          <dt>Constituency</dt><dd>{alert.constituency_name}</dd>
          <dt>State</dt><dd>{alert.state}</dd>
          <dt>Financial year</dt><dd>{alert.financial_year || '—'}</dd>
          <dt>Work</dt>
          <dd>{alert.work_key ? <Link to={`/works/${alert.work_key}`}>{alert.work_key}</Link> : '—'}</dd>
          <dt>Detection method</dt><dd>{humanize(alert.detection_method)}</dd>
          <dt>Confidence</dt><dd>{(alert.confidence_score * 100).toFixed(0)}%</dd>
          <dt>Detected at</dt><dd>{formatDate(alert.detected_at)}</dd>
          {Object.entries(alert.details || {}).map(([key, value]) => (
            <Detail key={key} label={key} value={value} />
          ))}
        </dl>

        {canManage ? (
          <>
            <div className="action-row">
              {NEXT_ACTIONS.map((action) => (
                <button
                  key={action.status}
                  type="button"
                  disabled={pending || alert.status === action.status}
                  onClick={() => onAction(action.status, note)}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Investigation note (recorded in the audit trail)</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <ErrorNote error={error} />
          </>
        ) : (
          <p className="muted">Your role has read-only access to alerts.</p>
        )}
      </aside>
    </div>
  )
}

function Detail({ label, value }) {
  const text = typeof value === 'number' ? value.toLocaleString('en-IN') : String(value)
  return (
    <>
      <dt>{humanize(label)}</dt>
      <dd>{text}</dd>
    </>
  )
}
