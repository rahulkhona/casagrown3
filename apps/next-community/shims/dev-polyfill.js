// Polyfill for __DEV__ used by React Native packages
// This should be imported/loaded early to ensure it's defined before RN packages load

if (typeof globalThis !== 'undefined' && typeof globalThis.__DEV__ === 'undefined') {
  globalThis.__DEV__ = process.env.NODE_ENV !== 'production'
}

if (typeof window !== 'undefined' && typeof window.__DEV__ === 'undefined') {
  window.__DEV__ = process.env.NODE_ENV !== 'production'
}

if (typeof global !== 'undefined' && typeof global.__DEV__ === 'undefined') {
  global.__DEV__ = process.env.NODE_ENV !== 'production'
}

export {}
