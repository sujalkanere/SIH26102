// Shared presentation helpers so formatting rules live in exactly one place.

export const RISK_COLORS = {
  LOW: '#12b886',
  MEDIUM: '#f59f00',
  HIGH: '#fd7e14',
  CRITICAL: '#f03e3e',
}

export const RISK_SOFT = {
  LOW: '#e6fcf5',
  MEDIUM: '#fff9db',
  HIGH: '#fff4e6',
  CRITICAL: '#fff5f5',
}

// Colour-blind support: every tier also carries a distinct glyph (NFR-ACC-001).
export const RISK_GLYPHS = { LOW: '●', MEDIUM: '▲', HIGH: '◆', CRITICAL: '■' }

export const ANOMALY_COLORS = {
  COST_OVERRUN: '#f03e3e',
  DUPLICATE_WORK: '#7048e8',
  DELAYED_PROJECT: '#fd7e14',
  STALLED_PROJECT: '#e8590c',
  LOW_UTILIZATION: '#1c7ed6',
  OVER_UTILIZATION: '#0ca678',
  FUND_UTILIZATION_ANOMALY: '#4c6ef5',
  SUDDEN_UTILIZATION_SHIFT: '#ae3ec9',
  AMOUNT_CLUSTERING: '#12b886',
  END_OF_YEAR_RUSH: '#f59f00',
  ROUND_NUMBER_BIAS: '#868e96',
  AGENCY_CONCENTRATION: '#099268',
}

export const ANOMALY_ICONS = {
  COST_OVERRUN: '💸',
  DUPLICATE_WORK: '⧉',
  DELAYED_PROJECT: '⏱',
  STALLED_PROJECT: '⛔',
  LOW_UTILIZATION: '📉',
  OVER_UTILIZATION: '📈',
  FUND_UTILIZATION_ANOMALY: '⚖',
  SUDDEN_UTILIZATION_SHIFT: '⚡',
  AMOUNT_CLUSTERING: '🎯',
  END_OF_YEAR_RUSH: '🏃',
  ROUND_NUMBER_BIAS: '🔢',
  AGENCY_CONCENTRATION: '🏢',
}

export const CATEGORY_PALETTE = [
  '#4c6ef5', '#12b886', '#fd7e14', '#7048e8', '#1c7ed6',
  '#f03e3e', '#0ca678', '#f59f00', '#ae3ec9',
]

export function tierFor(score) {
  if (score <= 25) return 'LOW'
  if (score <= 50) return 'MEDIUM'
  if (score <= 75) return 'HIGH'
  return 'CRITICAL'
}

export function formatCrore(rupees) {
  return `₹ ${(Number(rupees || 0) / 1e7).toFixed(2)} Cr`
}

/** Picks the natural Indian unit — crore for large sums, lakh below that. */
export function formatCompactRupees(rupees) {
  const value = Number(rupees || 0)
  if (Math.abs(value) >= 1e7) return `₹${(value / 1e7).toFixed(2)}Cr`
  if (Math.abs(value) >= 1e5) return `₹${(value / 1e5).toFixed(1)}L`
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
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

export function initialsOf(name) {
  const parts = String(name || '?').trim().split(/[\s_]+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}
