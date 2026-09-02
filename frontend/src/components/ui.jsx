import { RISK_COLORS, RISK_GLYPHS, formatCount, humanize, tierFor } from '../lib/format'

export function KpiCard({ label, value, hint, accent = '#1e3a8a', icon }) {
  return (
    <article className="kpi-card" style={{ borderTopColor: accent }}>
      <span className="kpi-icon" aria-hidden="true">{icon}</span>
      <h3 className="kpi-label">{label}</h3>
      <p className="kpi-value">{value}</p>
      {hint && <p className="kpi-hint">{hint}</p>}
    </article>
  )
}

export function RiskBadge({ score, tier }) {
  const resolved = tier || tierFor(score)
  return (
    <span className="badge" style={{ background: RISK_COLORS[resolved] }}>
      <span aria-hidden="true">{RISK_GLYPHS[resolved]}</span>
      {score !== undefined ? `${score} · ` : ''}
      {resolved}
    </span>
  )
}

export function SeverityBadge({ severity }) {
  return (
    <span className="badge" style={{ background: RISK_COLORS[severity] || '#546e7a' }}>
      <span aria-hidden="true">{RISK_GLYPHS[severity] || '●'}</span> {severity}
    </span>
  )
}

export function StatusPill({ status }) {
  return <span className={`pill pill-${status.toLowerCase()}`}>{humanize(status)}</span>
}

export function Panel({ title, subtitle, children, actions }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

export function Loading({ label = 'Loading…' }) {
  return <p className="muted" role="status">{label}</p>
}

export function ErrorNote({ error }) {
  if (!error) return null
  return <p className="error" role="alert">{error.message || String(error)}</p>
}

export function Empty({ label = 'No records match the current filters.' }) {
  return <p className="muted">{label}</p>
}

export function Pagination({ pagination, onChange }) {
  if (!pagination) return null
  const { page, total_pages: totalPages, total_records: total } = pagination
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Previous
      </button>
      <span>
        Page {page} of {totalPages} · {formatCount(total)} records
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
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
          return (
            <option key={key} value={key}>
              {text}
            </option>
          )
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
                    {column.header} {column.active ? (column.desc ? '▼' : '▲') : '↕'}
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
                <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
