import { describe, expect, it } from 'vitest'
import { formatCount, formatCrore, formatPercent, humanize, tierFor } from '../lib/format'
import { withQuery } from '../lib/api'
import { ROLE_PERMISSIONS } from '../lib/auth'

describe('risk tiers', () => {
  it.each([
    [0, 'LOW'],
    [25, 'LOW'],
    [26, 'MEDIUM'],
    [50, 'MEDIUM'],
    [51, 'HIGH'],
    [75, 'HIGH'],
    [76, 'CRITICAL'],
    [100, 'CRITICAL'],
  ])('maps %i to %s', (score, tier) => {
    expect(tierFor(score)).toBe(tier)
  })
})

describe('formatters', () => {
  it('renders rupees as crores with two decimals', () => {
    expect(formatCrore(12_345_678)).toBe('₹ 1.23 Cr')
    expect(formatCrore(0)).toBe('₹ 0.00 Cr')
  })

  it('groups counts using the Indian numbering system', () => {
    expect(formatCount(1234567)).toBe('12,34,567')
  })

  it('formats percentages', () => {
    expect(formatPercent(84.567)).toBe('84.6%')
  })

  it('humanizes SCREAMING_SNAKE_CASE identifiers', () => {
    expect(humanize('COST_OVERRUN')).toBe('Cost Overrun')
    expect(humanize('END_OF_YEAR_RUSH')).toBe('End Of Year Rush')
    expect(humanize(undefined)).toBe('')
  })
})

describe('withQuery', () => {
  it('omits empty and ALL values', () => {
    expect(withQuery('/works', { state: 'Goa', risk_tier: '', financial_year: 'ALL', page: 2 }))
      .toBe('/works?state=Goa&page=2')
  })

  it('returns a bare path when nothing is set', () => {
    expect(withQuery('/works', { state: '' })).toBe('/works')
  })

  it('encodes special characters', () => {
    expect(withQuery('/works', { constituency: 'Bangalore North' }))
      .toBe('/works?constituency=Bangalore+North')
  })
})

describe('role permissions mirror the backend matrix', () => {
  it('grants admin the upload permission and denies it to everyone else', () => {
    expect(ROLE_PERMISSIONS.ROLE_ADMIN).toContain('upload_data')
    const others = Object.entries(ROLE_PERMISSIONS).filter(([role]) => role !== 'ROLE_ADMIN')
    others.forEach(([, permissions]) => expect(permissions).not.toContain('upload_data'))
  })

  it('gives the public role no privileges', () => {
    expect(ROLE_PERMISSIONS.ROLE_PUBLIC).toHaveLength(0)
  })

  it('lets MPs read works but not manage alerts', () => {
    expect(ROLE_PERMISSIONS.ROLE_MP).toContain('view_works')
    expect(ROLE_PERMISSIONS.ROLE_MP).not.toContain('manage_alerts')
  })
})
