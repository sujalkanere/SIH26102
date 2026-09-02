import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DataTable, KpiCard, Pagination, RiskBadge, StatusPill } from '../components/ui'

describe('KpiCard', () => {
  it('renders its label, value and hint', () => {
    render(<KpiCard label="Total Works" value="1,234" hint="across 12 states" />)
    expect(screen.getByRole('heading', { name: 'Total Works' })).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('across 12 states')).toBeInTheDocument()
  })
})

describe('RiskBadge', () => {
  it('derives the tier from the score when none is supplied', () => {
    render(<RiskBadge score={80} />)
    expect(screen.getByText(/CRITICAL/)).toBeInTheDocument()
  })

  it('honours an explicit tier', () => {
    render(<RiskBadge score={10} tier="HIGH" />)
    expect(screen.getByText(/HIGH/)).toBeInTheDocument()
  })
})

describe('StatusPill', () => {
  it('humanizes the alert status', () => {
    render(<StatusPill status="FALSE_POSITIVE" />)
    expect(screen.getByText('False Positive')).toBeInTheDocument()
  })
})

describe('DataTable', () => {
  const columns = [
    { key: 'work_id', header: 'Work ID' },
    { key: 'risk', header: 'Risk', render: (row) => `${row.risk}/100` },
  ]

  it('renders a row per record and uses custom renderers', () => {
    render(<DataTable columns={columns} rows={[{ work_id: 'W1', risk: 42 }]} />)
    expect(screen.getByText('W1')).toBeInTheDocument()
    expect(screen.getByText('42/100')).toBeInTheDocument()
  })

  it('shows the empty state when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} empty="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })
})

describe('Pagination', () => {
  const pagination = { page: 1, per_page: 25, total_records: 60, total_pages: 3 }

  it('disables Previous on the first page', () => {
    render(<Pagination pagination={pagination} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled()
  })

  it('reports the next page number', async () => {
    const onChange = vi.fn()
    render(<Pagination pagination={pagination} onChange={onChange} />)
    screen.getByRole('button', { name: /Next/ }).click()
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('renders nothing without pagination data', () => {
    const { container } = render(<Pagination pagination={null} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
