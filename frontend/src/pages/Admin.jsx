import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatCount, formatDate, humanize } from '../lib/format'
import { DataTable, ErrorNote, Loading, Panel } from '../components/ui'

export default function Admin() {
  const queryClient = useQueryClient()
  const fileInput = useRef(null)
  const [result, setResult] = useState(null)
  const [synthetic, setSynthetic] = useState({ num_constituencies: 12, num_works_per_constituency: 60, anomaly_rate: 0.08 })

  const history = useQuery({ queryKey: ['upload-history'], queryFn: api.uploadHistory })
  const auditLog = useQuery({ queryKey: ['audit-log'], queryFn: api.auditLog })

  const runAndRefresh = (mutationFn) => ({
    mutationFn,
    onSuccess: (data) => {
      setResult(data)
      queryClient.invalidateQueries()
    },
  })

  const upload = useMutation(runAndRefresh((file) => api.uploadCsv(file)))
  const generate = useMutation(runAndRefresh(() => api.generateSynthetic({ ...synthetic, seed: 42 })))
  const detect = useMutation(runAndRefresh(() => api.runDetection()))

  const busy = upload.isPending || generate.isPending || detect.isPending

  return (
    <>
      <Panel title="Data Ingestion" subtitle="Upload MPLADS CSV exports, regenerate the demo dataset, or re-run detection">
        <div className="filters">
          <label className="field">
            <span>Works CSV (max 50 MB)</span>
            <input ref={fileInput} type="file" accept=".csv" />
          </label>
          <button
            className="btn-primary" type="button" disabled={busy}
            onClick={() => fileInput.current?.files?.[0] && upload.mutate(fileInput.current.files[0])}
          >
            ⭱ Upload CSV
          </button>
          <button type="button" disabled={busy} onClick={() => detect.mutate()}>
            ⟳ Re-run detection
          </button>
        </div>

        <div className="filters">
          <NumberField label="Constituencies" value={synthetic.num_constituencies}
            onChange={(v) => setSynthetic({ ...synthetic, num_constituencies: v })} min={1} max={30} />
          <NumberField label="Works per constituency" value={synthetic.num_works_per_constituency}
            onChange={(v) => setSynthetic({ ...synthetic, num_works_per_constituency: v })} min={20} max={500} />
          <NumberField label="Anomaly rate" value={synthetic.anomaly_rate} step={0.01} min={0} max={0.5}
            onChange={(v) => setSynthetic({ ...synthetic, anomaly_rate: v })} />
          <button type="button" disabled={busy} onClick={() => generate.mutate()}>
            ✨ Regenerate synthetic dataset
          </button>
        </div>

        {busy && <Loading label="Working — running the detection pipeline…" />}
        <ErrorNote error={upload.error || generate.error || detect.error} />
        {result && (
          <pre style={{ background: '#f1f5f9', padding: '0.7rem', borderRadius: 8, fontSize: '0.8rem', overflowX: 'auto' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </Panel>

      <Panel title="Upload History">
        {history.isLoading ? <Loading /> : (
          <DataTable
            columns={[
              { key: 'filename', header: 'File' },
              { key: 'records_valid', header: 'Valid', render: (r) => formatCount(r.records_valid) },
              { key: 'records_rejected', header: 'Rejected', render: (r) => formatCount(r.records_rejected) },
              { key: 'status', header: 'Status', render: (r) => humanize(r.status) },
              { key: 'uploaded_at', header: 'Uploaded', render: (r) => formatDate(r.uploaded_at) },
            ]}
            rows={history.data?.data}
            empty="No uploads recorded yet."
          />
        )}
      </Panel>

      <Panel title="Audit Trail" subtitle="Append-only record of every privileged action">
        {auditLog.isLoading ? <Loading /> : (
          <DataTable
            columns={[
              { key: 'timestamp', header: 'When', render: (r) => formatDate(r.timestamp) },
              { key: 'action', header: 'Action', render: (r) => humanize(r.action) },
              { key: 'resource_type', header: 'Resource', render: (r) => humanize(r.resource_type) || '—' },
              { key: 'note', header: 'Note', render: (r) => r.note || '—' },
            ]}
            rows={auditLog.data?.data?.slice(0, 40)}
            empty="No audit entries yet."
          />
        )}
      </Panel>
    </>
  )
}

function NumberField({ label, value, onChange, ...rest }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} {...rest} />
    </label>
  )
}
