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
  turbopack: {
    root: require('path').resolve(__dirname, '../../'),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // for google provider avatars
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      }
    ],
  },
  async redirects() {
    return [
      {
        source: '/interest',
        destination: '/market',
        permanent: false,
      },
      {
        source: '/fresh',
        destination: '/check-nutrition-loss',
        permanent: false,
      },
      {
        source: '/nutrition',
        destination: '/check-nutrition-loss',
        permanent: false,
      },
      {
        source: '/nutritionloss',
        destination: '/check-nutrition-loss',
        permanent: false,
      },
      {
        source: '/nutrition-loss',
        destination: '/check-nutrition-loss',
        permanent: false,
      },
      {
        source: '/checknutritionloss',
        destination: '/check-nutrition-loss',
        permanent: false,
      },
      {
        source: '/checknutrition',
        destination: '/check-nutrition-loss',
        permanent: false,
      },
      {
        source: '/check-nutrition',
        destination: '/check-nutrition-loss',
        permanent: false,
      },
      {
        source: '/loss',
        destination: '/check-nutrition-loss',
        permanent: false,
      },
    ]
  },
}
// Trigger Vercel rebuild 20260717-200535
