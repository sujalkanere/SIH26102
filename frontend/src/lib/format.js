// Shared presentation helpers so formatting rules live in exactly one place.

export const RISK_COLORS = {
  LOW: '#2e7d32',
  MEDIUM: '#f9a825',
  HIGH: '#ef6c00',
  CRITICAL: '#c62828',
}

// Colour-blind support: every tier also carries a distinct glyph (NFR-ACC-001).
export const RISK_GLYPHS = { LOW: '●', MEDIUM: '▲', HIGH: '◆', CRITICAL: '■' }

export const ANOMALY_COLORS = {
  COST_OVERRUN: '#c62828',
  DUPLICATE_WORK: '#6a1b9a',
  DELAYED_PROJECT: '#ef6c00',
  STALLED_PROJECT: '#ad1457',
  LOW_UTILIZATION: '#0277bd',
  OVER_UTILIZATION: '#00838f',
  FUND_UTILIZATION_ANOMALY: '#1565c0',
  SUDDEN_UTILIZATION_SHIFT: '#4527a0',
  AMOUNT_CLUSTERING: '#2e7d32',
  END_OF_YEAR_RUSH: '#9e9d24',
  ROUND_NUMBER_BIAS: '#5d4037',
  AGENCY_CONCENTRATION: '#00695c',
}

export function tierFor(score) {
  if (score <= 25) return 'LOW'
  if (score <= 50) return 'MEDIUM'
  if (score <= 75) return 'HIGH'
  return 'CRITICAL'
}

export function formatCrore(rupees) {
  return `₹ ${(Number(rupees || 0) / 1e7).toFixed(2)} Cr`
}

export function formatRupees(rupees) {
  return `₹ ${Number(rupees || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export function formatCount(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

export function formatPercent(value, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`
}

export function humanize(text) {
  return String(text || '')
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—'
}
