/**
 * Stripe return_url regression test
 *
 * Stripe requires return_url in confirmCardPayment for 3D Secure redirects.
 * This test reads the source files and asserts the parameter is present,
 * preventing accidental removal.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

describe('Stripe return_url requirement', () => {
  it('BuyModal includes return_url in confirmCardPayment', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'components', 'BuyModal.tsx'), 'utf-8'
    )
    expect(src).toContain('confirmCardPayment')
    expect(src).toContain('return_url')
  })

  it('Cart checkout includes return_url in confirmCardPayment', () => {
    const src = fs.readFileSync(
      path.join(ROOT, '(main)', 'cart', 'page.tsx'), 'utf-8'
    )
    expect(src).toContain('confirmCardPayment')
    expect(src).toContain('return_url')
  })
})
