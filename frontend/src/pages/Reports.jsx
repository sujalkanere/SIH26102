import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { ErrorNote, Panel, Select } from '../components/ui'

export default function Reports({ financialYear }) {
  const [form, setForm] = useState({ scope: 'NATIONAL', scope_id: '', format: 'PDF' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const constituencies = useQuery({
    queryKey: ['report-constituencies'],
    queryFn: () => api.constituencies({ per_page: 100 }),
    retry: false,
  })

  const states = [...new Set((constituencies.data?.data || []).map((c) => c.state))].sort()
  const names = (constituencies.data?.data || []).map((c) => c.name).sort()

  async function download(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await api.downloadReport({
        scope: form.scope,
        scope_id: form.scope === 'NATIONAL' ? null : form.scope_id,
        financial_year: financialYear || 'ALL',
        format: form.format,
      })
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `mplads_report.${form.format.toLowerCase()}`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Report Generation"
      subtitle="Export anomaly and risk findings as a PDF briefing or a CSV dataset"
    >
      <form onSubmit={download}>
        <div className="filters">
          <Select
            label="Scope" value={form.scope} includeAll={false}
            onChange={(value) => setForm({ ...form, scope: value, scope_id: '' })}
            options={[
              { value: 'NATIONAL', label: 'National' },
              { value: 'STATE', label: 'State' },
              { value: 'CONSTITUENCY', label: 'Constituency' },
            ]}
          />
          {form.scope === 'STATE' && (
            <Select label="State" value={form.scope_id} allLabel="Select a state"
              onChange={(value) => setForm({ ...form, scope_id: value })}
              options={states.map((s) => ({ value: s, label: s }))} />
          )}
          {form.scope === 'CONSTITUENCY' && (
            <Select label="Constituency" value={form.scope_id} allLabel="Select a constituency"
              onChange={(value) => setForm({ ...form, scope_id: value })}
              options={names.map((n) => ({ value: n, label: n }))} />
          )}
          <Select
            label="Format" value={form.format} includeAll={false}
            onChange={(value) => setForm({ ...form, format: value })}
            options={[
              { value: 'PDF', label: 'PDF briefing' },
              { value: 'CSV', label: 'CSV dataset' },
            ]}
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Generating…' : '⭳ Generate report'}
          </button>
        </div>
      </form>

      <ErrorNote error={error} />
      <p className="muted">
        Reports respect your role scope and the financial year selected in the header
        ({financialYear || 'All years'}). Every generation is recorded in the audit trail.
      </p>
    </Panel>
  )
}
