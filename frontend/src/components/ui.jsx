import { RISK_COLORS, formatCount, humanize, tierFor } from '../lib/format'

export function KpiCard({ label, value, hint, accent = 'var(--brand-500)', soft = 'var(--brand-100)', icon }) {
  return (
    <article className="kpi-card" style={{ '--kpi-accent': accent, '--kpi-soft': soft }}>
      <div className="kpi-top">
        <span className="kpi-icon" aria-hidden="true">{icon}</span>
        <h3 className="kpi-label">{label}</h3>
      </div>
      <p className="kpi-value">{value}</p>
      {hint && <p className="kpi-hint">{hint}</p>}
    </article>
  )
}

export function RiskBadge({ score, tier }) {
  const resolved = tier || tierFor(score)
  return (
    <span className={`badge badge-${resolved.toLowerCase()}`}>
      <span className="dot" aria-hidden="true" />
      {score !== undefined ? `${score} · ${resolved}` : resolved}
    </span>
  )
}

export function SeverityBadge({ severity }) {
  return (
    <span className={`badge badge-${String(severity).toLowerCase()}`}>
      <span className="dot" aria-hidden="true" />
      {severity}
    </span>
  )
}

export function StatusPill({ status }) {
  return <span className={`pill pill-${status.toLowerCase()}`}>{humanize(status)}</span>
}

/** Compact bar + number, so risk reads at a glance without relying on colour. */
export function RiskMeter({ score, tier }) {
  const resolved = tier || tierFor(score)
  return (
    <div className="meter" title={`Risk ${score} of 100 — ${resolved}`}>
      <span className="meter-val" style={{ color: RISK_COLORS[resolved] }}>{score}</span>
      <span className="meter-track">
        <span className="meter-fill" style={{ width: `${score}%`, background: RISK_COLORS[resolved] }} />
      </span>
    </div>
  )
}

export function Panel({ title, subtitle, children, actions, flush = false }) {
  return (
    <section className="panel">
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={`panel-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  )
}

export function Loading({ label = 'Loading…' }) {
  return <p className="muted" role="status">{label}</p>
}

export function SkeletonKpis({ count = 4 }) {
  return (
    <div className="kpi-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <div key={i} className="skel skel-kpi" />)}
    </div>
  )
}

export function SkeletonPanel() {
  return <div className="skel skel-panel" style={{ marginBottom: '1.4rem' }} aria-hidden="true" />
}

export function ErrorNote({ error }) {
  if (!error) return null
  return <p className="error" role="alert">{error.message || String(error)}</p>
}

export function Empty({ label = 'No records match the current filters.', icon = '🔍' }) {
  return (
    <div className="empty-state">
      <span className="ico" aria-hidden="true">{icon}</span>
      <p>{label}</p>
    </div>
  )
}

export function Pagination({ pagination, onChange }) {
  if (!pagination) return null
  const { page, total_pages: totalPages, total_records: total } = pagination
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Previous
      </button>
      <span>
        Page <strong>{page}</strong> of {totalPages} · {formatCount(total)} records
      </span>
      <button type="button" className="btn btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next ›
      </button>
    </nav>
  )
}

export function Select({ label, value, onChange, options, includeAll = true, allLabel = 'All' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {includeAll && <option value="">{allLabel}</option>}
        {options.map((option) => {
          const key = typeof option === 'string' ? option : option.value
          const text = typeof option === 'string' ? humanize(option) : option.label
          return <option key={key} value={key}>{text}</option>
        })}
      </select>
    </label>
  )
}

export function DataTable({ columns, rows, empty, onRowClick, caption }) {
  if (!rows?.length) return <Empty label={empty} />
  return (
    <div className="table-wrap">
      <table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.sortable ? (
                  <button type="button" className="sort-btn" onClick={column.onSort}>
                    {column.header}
                    <span className={`arrow${column.active ? ' on' : ''}`} aria-hidden="true">
                      {column.active ? (column.desc ? '▼' : '▲') : '↕'}
                    </span>
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id || row.work_id || index}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'clickable' : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? 'num' : undefined}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Dark tooltip shared by every chart, so hover states look consistent. */
export function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      {label !== undefined && <div className="tip-label">{humanize(String(label))}</div>}
      {payload.map((entry) => (
        <div className="tip-row" key={entry.dataKey ?? entry.name}>
          <span className="tip-dot" style={{ background: entry.color || entry.fill }} aria-hidden="true" />
          {humanize(String(entry.name))}: <strong style={{ color: '#fff' }}>
            {formatter ? formatter(entry.value) : entry.value}
          </strong>
        </div>
      ))}
    </div>
  )
}
