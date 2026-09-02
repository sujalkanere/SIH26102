import '@testing-library/jest-dom/vitest'

// jsdom implements neither API; Recharts' ResponsiveContainer needs both.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.matchMedia =
  global.matchMedia ||
  ((query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
