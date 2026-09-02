import { describe, it, expect } from 'vitest';
const nextConfig = require('../next.config.js');

describe('Ad Campaign URL Redirects & Aliases', () => {
  it('should define async redirects function in next.config.js', async () => {
    expect(typeof nextConfig.redirects).toBe('function');
    const redirects = await nextConfig.redirects();
    expect(Array.isArray(redirects)).toBe(true);
    expect(redirects.length).toBeGreaterThanOrEqual(9);
  });

  const expectedRedirects = [
    { source: '/fresh', destination: '/check-nutrition-loss' },
    { source: '/nutrition', destination: '/check-nutrition-loss' },
    { source: '/nutritionloss', destination: '/check-nutrition-loss' },
    { source: '/nutrition-loss', destination: '/check-nutrition-loss' },
    { source: '/checknutritionloss', destination: '/check-nutrition-loss' },
    { source: '/checknutrition', destination: '/check-nutrition-loss' },
    { source: '/check-nutrition', destination: '/check-nutrition-loss' },
    { source: '/loss', destination: '/check-nutrition-loss' },
    { source: '/interest', destination: '/market' },
  ];

  for (const { source, destination } of expectedRedirects) {
    it(`redirects ${source} -> ${destination}`, async () => {
      const redirects = await nextConfig.redirects();
      const match = redirects.find((r: { source: string; destination: string }) => r.source === source);
      expect(match).toBeDefined();
      expect(match.destination).toBe(destination);
      expect(match.permanent).toBe(false);
    });
  }
});
