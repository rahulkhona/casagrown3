/**
 * Multi-Armed Bandit (MAB) Thompson Sampling Utilities
 * 
 * Implements Beta-distribution sampling to resolve campaign/sequence
 * node variants purely in-memory, avoiding N+1 database RPC bottlenecks.
 */

export function drawBeta(alpha: number, beta: number): number {
  let x = 0;
  let y = 0;
  const a = Math.max(1, Math.floor(alpha));
  const b = Math.max(1, Math.floor(beta));
  for (let i = 0; i < a; i++) {
    x -= Math.log(Math.random());
  }
  for (let i = 0; i < b; i++) {
    y -= Math.log(Math.random());
  }
  if (x + y === 0) return 0.5;
  return x / (x + y);
}

export function sampleVariant(variants: any[]): any {
  if (!variants || variants.length === 0) return null;
  if (variants.length === 1) return variants[0];

  let bestVariant = variants[0];
  let maxDraw = -1;

  for (const variant of variants) {
    const alpha = (variant.prior_alpha || 1) + (variant.conversions_count || 0);
    const beta = (variant.prior_beta || 9) + (variant.sends_count || 0) - (variant.conversions_count || 0);
    const draw = drawBeta(alpha, beta);
    if (draw > maxDraw) {
      maxDraw = draw;
      bestVariant = variant;
    }
  }

  return bestVariant;
}
