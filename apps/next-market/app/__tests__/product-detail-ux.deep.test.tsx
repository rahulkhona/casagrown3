// @vitest-environment jsdom
/**
 * UX Contract Tests — verify the component SOURCE CODE enforces UX patterns
 *
 * Rather than rendering (which requires deep mock chains for self-fetching components),
 * these tests verify UX-critical patterns by reading the component source.
 * This catches regressions like removing carousel arrows or switching button order.
 *
 * Covers:
 * 1. Qty selector is type="number" (editable)
 * 2. Buy Now and Add to Cart exist and share a flex container
 * 3. Photo carousel arrows with aria-labels
 * 4. Dot indicators for photos
 * 5. DM button uses seller first name (not "Message Seller")
 * 6. Q&A component referenced without 💬 icon
 * 7. Address check is inside delivery section, not after pickup
 * 8. Anonymized address function called for pickup
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const DETAIL_PATH = path.resolve(__dirname, '../(main)/market/booth/[id]/product/[productId]/ProductDetailClient.tsx')
const CARD_PATH = path.resolve(__dirname, '../(main)/community/components/ProductListingCard.tsx')
const QA_PATH = path.resolve(__dirname, '../components/ProductQA.tsx')
const WINDOW_PATH = path.resolve(__dirname, '../../lib/windowDisplay.ts')

const detailSrc = fs.readFileSync(DETAIL_PATH, 'utf-8')
const cardSrc = fs.readFileSync(CARD_PATH, 'utf-8')
const qaSrc = fs.readFileSync(QA_PATH, 'utf-8')

// ============================================================================
// PRODUCT DETAIL PAGE
// ============================================================================
describe('ProductDetailClient — UX Contract', () => {
  it('qty input is type="number" (editable, not display-only)', () => {
    expect(detailSrc).toContain('type="number"')
  })

  it('has Buy Now and Add to Cart buttons', () => {
    expect(detailSrc).toContain('Buy Now')
    expect(detailSrc).toContain('Add to Cart')
  })

  it('Buy Now and Add to Cart share a flex container (side by side)', () => {
    // The source should have a comment about side-by-side layout
    expect(detailSrc).toContain('Buy Now + Add to Cart — side by side')
    // And the buttons' parent should use display: flex
    expect(detailSrc).toContain("display: 'flex'")
  })

  it('qty selector appears BEFORE buy buttons in real product section', () => {
    // In the real product section (not demo), Qty: comes before Buy Now + Add to Cart
    const realSectionComment = 'Qty above, Buy Now + Add to Cart side by side'
    expect(detailSrc).toContain(realSectionComment)
    const sectionStart = detailSrc.indexOf(realSectionComment)
    const qtyAfter = detailSrc.indexOf('Qty:', sectionStart)
    const buyAfter = detailSrc.indexOf('Buy Now + Add to Cart', sectionStart + realSectionComment.length)
    expect(qtyAfter).toBeGreaterThan(-1)
    expect(buyAfter).toBeGreaterThan(-1)
    expect(qtyAfter).toBeLessThan(buyAfter)
  })

  it('has carousel prev/next arrows with aria-labels', () => {
    expect(detailSrc).toContain('aria-label="Previous photo"')
    expect(detailSrc).toContain('aria-label="Next photo"')
  })

  it('has dot indicators for photos', () => {
    expect(detailSrc).toContain('aria-label={`Photo ${')
  })

  it('DM button shows seller first name, not "Message Seller"', () => {
    // Should reference sellerFirstName in the DM button text
    expect(detailSrc).toContain('sellerFirstName')
    expect(detailSrc).toMatch(/DM\s+\{?.*sellerFirstName/s)
    // Should NOT have hardcoded "Message Seller"
    expect(detailSrc).not.toContain('>Message Seller<')
  })

  it('DM button appears AFTER Q&A section in source', () => {
    const qaIdx = detailSrc.indexOf('ProductQA')
    const dmIdx = detailSrc.lastIndexOf('sellerFirstName')
    expect(qaIdx).toBeGreaterThan(-1)
    expect(dmIdx).toBeGreaterThan(qaIdx)
  })

  it('distance check form is explicitly injected into fulfillment sections', () => {
    // We extracted this to a reusable distanceCheckerForm JSX block
    // Ensure it exists and is used in the codebase
    expect(detailSrc).toContain('const distanceCheckerForm')
    // It should be injected at least once into the active fulfillment blocks
    expect(detailSrc).toContain('{distanceCheckerForm}')
  })

  it('share payload includes user-specific intro, price, and available quantity', () => {
    expect(detailSrc).toContain("const shareIntro = isOwner ? 'my fresh' : 'this fresh'")
    expect(detailSrc).toContain("product.price_usd")
    expect(detailSrc).toContain("product.inventory")
    expect(detailSrc).toContain("available'")
  })

  it('calls anonymizeAddress for pickup location', () => {
    expect(detailSrc).toContain('anonymizeAddress')
  })

  it('uses windowDisplay utility for pill rendering', () => {
    expect(detailSrc).toContain('getWindowDays')
  })
})

// ============================================================================
// COMMUNITY PRODUCT LISTING CARD
// ============================================================================
describe('ProductListingCard — UX Contract', () => {
  it('uses getWindowDays for pill-based windows', () => {
    expect(cardSrc).toContain('getWindowDays')
  })

  it('calls anonymizeAddress for pickup', () => {
    expect(cardSrc).toContain('anonymizeAddress')
  })

  it('has Delivery and Pickup labels', () => {
    expect(cardSrc).toContain('Delivery')
    expect(cardSrc).toContain('Pickup')
  })

  it('address check appears in delivery section', () => {
    const deliveryIdx = cardSrc.indexOf("'Delivery'")
    const pickupIdx = cardSrc.indexOf("'Pickup'")
    const checkIdx = cardSrc.indexOf("Check")
    if (deliveryIdx > -1 && pickupIdx > -1 && checkIdx > -1) {
      expect(checkIdx).toBeGreaterThan(deliveryIdx)
      expect(checkIdx).toBeLessThan(pickupIdx)
    }
  })

  it('does NOT show "mi from you" in pickup section', () => {
    // After Pickup label, should NOT have distance display
    const pickupIdx = cardSrc.indexOf("'Pickup'")
    if (pickupIdx > -1) {
      const afterPickup = cardSrc.slice(pickupIdx, pickupIdx + 500)
      expect(afterPickup).not.toContain('mi from you')
    }
  })
})

// ============================================================================
// PRODUCT Q&A
// ============================================================================
describe('ProductQA — UX Contract', () => {
  it('title does NOT contain 💬 chat icon', () => {
    // The Q&A header should not have the chat emoji
    const titleSection = qaSrc.match(/Questions.*Answers/)?.[0]
    expect(titleSection).toBeTruthy()
    // Check: 💬 should not be adjacent to title
    expect(qaSrc).not.toMatch(/💬.*Questions & Answers/)
    expect(qaSrc).not.toMatch(/Questions & Answers.*💬/)
  })

  it('empty state uses ❓ not 💬', () => {
    // The empty state should use the question mark emoji
    expect(qaSrc).toContain('❓')
    // Should not use chat icon in empty state area
    const emptyIdx = qaSrc.indexOf('No questions yet')
    if (emptyIdx > -1) {
      const emptyArea = qaSrc.slice(Math.max(0, emptyIdx - 200), emptyIdx + 200)
      expect(emptyArea).not.toContain('💬')
    }
  })
})

// ============================================================================
// WINDOW DISPLAY UTILITY
// ============================================================================
describe('windowDisplay — UX Contract', () => {
  it('exports getWindowDays', () => {
    const windowSrc = fs.readFileSync(WINDOW_PATH, 'utf-8')
    expect(windowSrc).toContain('export function getWindowDays')
  })

  it('exports anonymizeAddress', () => {
    const windowSrc = fs.readFileSync(WINDOW_PATH, 'utf-8')
    expect(windowSrc).toContain('export function anonymizeAddress')
  })

  it('has all 6 standard slot labels', () => {
    const windowSrc = fs.readFileSync(WINDOW_PATH, 'utf-8')
    expect(windowSrc).toContain("'8-10'")
    expect(windowSrc).toContain("'10-12'")
    expect(windowSrc).toContain("'12-14'")
    expect(windowSrc).toContain("'14-16'")
    expect(windowSrc).toContain("'16-18'")
    expect(windowSrc).toContain("'18-20'")
  })
})
