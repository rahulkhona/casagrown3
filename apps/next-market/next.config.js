/** @type {import('next').NextConfig} */

// Define __DEV__ globally for Turbopack
if (typeof globalThis.__DEV__ === 'undefined') {
  globalThis.__DEV__ = process.env.NODE_ENV !== 'production'
}

module.exports = {
  devIndicators: false,
  experimental: {
    scrollRestoration: true,
  },
}
