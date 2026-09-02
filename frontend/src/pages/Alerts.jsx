import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { ANOMALY_ICONS, formatDate, humanize } from '../lib/format'
import { useAuth } from '../lib/auth'
import {
  DataTable, ErrorNote, Pagination, Panel, SeverityBadge, Select, StatusPill,
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
    { key: 'anomaly_type', header: 'Anomaly', render: (row) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
        <span aria-hidden="true">{ANOMALY_ICONS[row.anomaly_type] || '⚑'}</span>
        {humanize(row.anomaly_type)}
      </span>
    ) },
    { key: 'severity', header: 'Severity', render: (row) => <SeverityBadge severity={row.severity} /> },
    { key: 'constituency_name', header: 'Constituency' },
    { key: 'state', header: 'State', render: (row) => <span style={{ color: 'var(--text-2)' }}>{row.state}</span> },
    { key: 'work_key', header: 'Work', render: (row) => (
      row.work_key ? <Link to={`/works/${row.work_key}`}>{row.work_key}</Link> : <span style={{ color: 'var(--text-3)' }}>—</span>
    ) },
    { key: 'detected_at', header: 'Detected', render: (row) => (
      <span style={{ color: 'var(--text-2)', fontSize: '0.82rem' }}>{formatDate(row.detected_at)}</span>
    ) },
    { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
  ]

  return (
    <>
      <Panel title="Alert Queue" subtitle="Review, triage and audit every detected anomaly" flush>
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

        {alerts.isLoading ? (
          <div style={{ padding: '1.25rem' }}>
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="skel skel-row" />)}
          </div>
        ) : alerts.error ? (
          <div style={{ padding: '1.25rem' }}><ErrorNote error={alerts.error} /></div>
        ) : (
          <>
            <DataTable
              columns={columns} rows={alerts.data.data} onRowClick={setSelected}
              caption="Detected anomaly alerts" empty="No alerts match the current filters."
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
        <header className="drawer-head">
          <div>
            <h2>
              <span aria-hidden="true">{ANOMALY_ICONS[alert.anomaly_type] || '⚑'}</span>{' '}
              {humanize(alert.anomaly_type)}
            </h2>
            <SeverityBadge severity={alert.severity} /> <StatusPill status={alert.status} />
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close alert detail">✕</button>
        </header>

        <div className="drawer-body">
          <dl className="kv">
            <dt>Alert ID</dt><dd style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{alert.id}</dd>
            <dt>Constituency</dt><dd>{alert.constituency_name}</dd>
            <dt>State</dt><dd>{alert.state}</dd>
            <dt>Financial year</dt><dd>{alert.financial_year || '—'}</dd>
            <dt>Work</dt>
            <dd>{alert.work_key ? <Link to={`/works/${alert.work_key}`}>{alert.work_key}</Link> : '—'}</dd>
            <dt>Detection method</dt><dd>{humanize(alert.detection_method)}</dd>
            <dt>Confidence</dt><dd>{(alert.confidence_score * 100).toFixed(0)}%</dd>
            <dt>Detected at</dt><dd>{formatDate(alert.detected_at)}</dd>
          </dl>

          {Object.keys(alert.details || {}).length > 0 && (
            <>
              <p className="section-title">Detection evidence</p>
              <dl className="kv">
                {Object.entries(alert.details).map(([key, value]) => (
                  <Detail key={key} label={key} value={value} />
                ))}
              </dl>
            </>
          )}

          {canManage ? (
            <>
              <p className="section-title">Take action</p>
              <div className="action-row">
                {NEXT_ACTIONS.map((action) => (
                  <button
                    key={action.status} type="button"
                    className={`btn btn-sm${action.status === 'RESOLVED' ? ' btn-primary' : ''}`}
                    disabled={pending || alert.status === action.status}
                    onClick={() => onAction(action.status, note)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              <label className="field">
                <span>Investigation note (recorded in the audit trail)</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)}
                  placeholder="Findings, next steps, or justification…" />
              </label>
              <ErrorNote error={error} />
            </>
          ) : (
            <p className="muted" style={{ marginTop: '1.2rem' }}>Your role has read-only access to alerts.</p>
          )}
        </div>
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
