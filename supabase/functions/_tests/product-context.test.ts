/**
 * product-context.test.ts — Tests for product context extraction across all surfaces
 *
 * Validates that referral data from Facebook, Instagram, WhatsApp, and CasaGrown
 * surfaces is correctly extracted and mapped to our products.
 */
import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'

// Import the functions under test
import {
  extractMessengerReferral,
  extractInstagramReferral,
  extractWhatsAppProductRef,
  buildProductContextPrompt,
} from '../_shared/product-context.ts'

const PRODUCT_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

// ═══════════════════════════════════════════════════════════════
//  Messenger Referral Extraction
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: 'extractMessengerReferral: catalog item (COMMERCE_PRODUCT) → extracts product ID',
  fn() {
    const event = {
      message: {
        text: 'Is this available?',
        referral: {
          source: 'COMMERCE_PRODUCT',
          type: 'OPEN_THREAD',
          product: { id: PRODUCT_UUID },
        },
      },
    }
    const result = extractMessengerReferral(event)
    assertEquals(result.productId, PRODUCT_UUID)
    assertEquals(result.source, 'COMMERCE_PRODUCT')
  },
})

Deno.test({
  name: 'extractMessengerReferral: top-level referral with product → extracts product ID',
  fn() {
    const event = {
      message: { text: 'Hello' },
      referral: {
        source: 'SHORTLINK',
        product: { id: PRODUCT_UUID },
      },
    }
    const result = extractMessengerReferral(event)
    assertEquals(result.productId, PRODUCT_UUID)
    assertEquals(result.source, 'SHORTLINK')
  },
})

Deno.test({
  name: 'extractMessengerReferral: top-level referral with ref param → parses product:UUID',
  fn() {
    const event = {
      message: { text: 'Hi' },
      referral: {
        source: 'CUSTOMER_CHAT_PLUGIN',
        ref: `product:${PRODUCT_UUID}`,
      },
    }
    const result = extractMessengerReferral(event)
    assertEquals(result.productId, PRODUCT_UUID)
  },
})

Deno.test({
  name: 'extractMessengerReferral: postback referral with product → extracts product ID',
  fn() {
    const event = {
      postback: {
        title: 'Get Started',
        referral: {
          source: 'ADS',
          product: { id: PRODUCT_UUID },
        },
      },
    }
    const result = extractMessengerReferral(event)
    assertEquals(result.productId, PRODUCT_UUID)
    assertEquals(result.source, 'ADS')
  },
})

Deno.test({
  name: 'extractMessengerReferral: marketplace listing (ad_id, no product) → source is MARKETPLACE',
  fn() {
    const event = {
      message: {
        text: 'Is this still available?',
        referral: {
          source: 'MARKETPLACE',
          type: 'OPEN_THREAD',
          ad_id: '123456789',
        },
      },
    }
    const result = extractMessengerReferral(event)
    assertEquals(result.productId, null) // Can't directly map marketplace listings
    assertEquals(result.source, 'MARKETPLACE')
  },
})

Deno.test({
  name: 'extractMessengerReferral: no referral → returns null productId',
  fn() {
    const event = { message: { text: 'Hello' } }
    const result = extractMessengerReferral(event)
    assertEquals(result.productId, null)
    assertEquals(result.source, null)
  },
})

Deno.test({
  name: 'extractMessengerReferral: message-level referral takes priority over top-level',
  fn() {
    const event = {
      message: {
        text: 'Hi',
        referral: {
          source: 'COMMERCE_PRODUCT',
          product: { id: PRODUCT_UUID },
        },
      },
      referral: {
        source: 'SHORTLINK',
        product: { id: '00000000-0000-0000-0000-000000000000' },
      },
    }
    const result = extractMessengerReferral(event)
    assertEquals(result.productId, PRODUCT_UUID) // Message-level wins
    assertEquals(result.source, 'COMMERCE_PRODUCT')
  },
})

// ═══════════════════════════════════════════════════════════════
//  Instagram Referral Extraction
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: 'extractInstagramReferral: IG Shop product tap → extracts product ID',
  fn() {
    const event = {
      message: {
        text: 'How much?',
        referral: {
          source: 'INSTAGRAM_SHOP',
          product: { id: PRODUCT_UUID },
        },
      },
    }
    const result = extractInstagramReferral(event)
    assertEquals(result.productId, PRODUCT_UUID)
    assertEquals(result.source, 'INSTAGRAM_SHOP')
  },
})

Deno.test({
  name: 'extractInstagramReferral: top-level referral with ref param → parses product:UUID',
  fn() {
    const event = {
      message: { text: 'Hi' },
      referral: {
        source: 'INSTAGRAM',
        ref: `product:${PRODUCT_UUID}`,
      },
    }
    const result = extractInstagramReferral(event)
    assertEquals(result.productId, PRODUCT_UUID)
  },
})

Deno.test({
  name: 'extractInstagramReferral: no referral → returns null',
  fn() {
    const event = { message: { text: 'Hello from IG' } }
    const result = extractInstagramReferral(event)
    assertEquals(result.productId, null)
  },
})

// ═══════════════════════════════════════════════════════════════
//  WhatsApp Product Ref Extraction
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: 'extractWhatsAppProductRef: catalog product inquiry → extracts product_retailer_id',
  fn() {
    const message = {
      interactive: {
        type: 'product_inquiry',
        product_retailer_id: PRODUCT_UUID,
      },
    }
    const result = extractWhatsAppProductRef(message, null)
    assertEquals(result.productId, PRODUCT_UUID)
    assertEquals(result.source, 'WA_CATALOG_INQUIRY')
    assertEquals(result.cleanedMessage, null)
  },
})

Deno.test({
  name: 'extractWhatsAppProductRef: order from catalog → extracts first item product_retailer_id',
  fn() {
    const message = {
      order: {
        catalog_id: 'catalog_123',
        product_items: [
          { product_retailer_id: PRODUCT_UUID, quantity: 2, item_price: 5.00, currency: 'USD' },
        ],
      },
    }
    const result = extractWhatsAppProductRef(message, null)
    assertEquals(result.productId, PRODUCT_UUID)
    assertEquals(result.source, 'WA_CATALOG_ORDER')
  },
})

Deno.test({
  name: 'extractWhatsAppProductRef: referred_product context → extracts product_retailer_id',
  fn() {
    const message = {
      text: { body: 'Is this available?' },
      context: {
        referred_product: {
          catalog_id: 'catalog_123',
          product_retailer_id: PRODUCT_UUID,
        },
      },
    }
    const result = extractWhatsAppProductRef(message, 'Is this available?')
    assertEquals(result.productId, PRODUCT_UUID)
    assertEquals(result.source, 'WA_REFERRED_PRODUCT')
  },
})

Deno.test({
  name: 'extractWhatsAppProductRef: wa.me pre-filled text with ref tag → extracts UUID and cleans message',
  fn() {
    const message = { text: { body: `Hi! I'm interested in Organic Tomatoes (ref:${PRODUCT_UUID})` } }
    const userMsg = `Hi! I'm interested in Organic Tomatoes (ref:${PRODUCT_UUID})`
    const result = extractWhatsAppProductRef(message, userMsg)
    assertEquals(result.productId, PRODUCT_UUID)
    assertEquals(result.source, 'WA_ME_LINK')
    assertEquals(result.cleanedMessage, "Hi! I'm interested in Organic Tomatoes")
  },
})

Deno.test({
  name: 'extractWhatsAppProductRef: plain text message → no product context',
  fn() {
    const message = { text: { body: 'Hello, do you have any tomatoes?' } }
    const result = extractWhatsAppProductRef(message, 'Hello, do you have any tomatoes?')
    assertEquals(result.productId, null)
    assertEquals(result.source, null)
    assertEquals(result.cleanedMessage, null)
  },
})

Deno.test({
  name: 'extractWhatsAppProductRef: priority order — interactive > order > context > ref text',
  fn() {
    // When multiple signals exist, interactive should win
    const message = {
      interactive: {
        type: 'product_inquiry',
        product_retailer_id: 'interactive-product-id',
      },
      context: {
        referred_product: {
          product_retailer_id: 'context-product-id',
        },
      },
    }
    const result = extractWhatsAppProductRef(message, 'Hi (ref:text-product-id)')
    assertEquals(result.productId, 'interactive-product-id')
    assertEquals(result.source, 'WA_CATALOG_INQUIRY')
  },
})

// ═══════════════════════════════════════════════════════════════
//  Product Context Prompt Builder
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: 'buildProductContextPrompt: includes product name, price, inventory, and order link',
  fn() {
    const product = {
      id: PRODUCT_UUID,
      name: 'Organic Heirloom Tomatoes',
      price: 5.0,
      unit: 'lb',
      description: 'Vine-ripened, organic',
      boothId: 'booth-123',
      boothName: 'Oak Creek Farm',
      photos: ['https://example.com/tomato.jpg'],
      inventory: 10,
      siteUrl: 'https://casagrown.com',
    }
    const prompt = buildProductContextPrompt(product)

    // Must contain key product details
    assertNotEquals(prompt.indexOf('Organic Heirloom Tomatoes'), -1)
    assertNotEquals(prompt.indexOf('$5.00/lb'), -1)
    assertNotEquals(prompt.indexOf('10 in stock'), -1)
    assertNotEquals(prompt.indexOf('Vine-ripened, organic'), -1)
    assertNotEquals(prompt.indexOf(`/market/booth/booth-123/product/${PRODUCT_UUID}`), -1)
    assertNotEquals(prompt.indexOf('PRODUCT THE BUYER IS ASKING ABOUT'), -1)
  },
})

Deno.test({
  name: 'buildProductContextPrompt: out of stock product shows correctly',
  fn() {
    const product = {
      id: PRODUCT_UUID,
      name: 'Sold Out Item',
      price: 3.5,
      unit: 'each',
      description: null,
      boothId: 'booth-123',
      boothName: 'Test Booth',
      photos: [],
      inventory: 0,
      siteUrl: 'https://casagrown.com',
    }
    const prompt = buildProductContextPrompt(product)
    assertNotEquals(prompt.indexOf('Out of stock'), -1)
    assertNotEquals(prompt.indexOf('$3.50/each'), -1)
  },
})

Deno.test({
  name: 'buildProductContextPrompt: null description shows fallback',
  fn() {
    const product = {
      id: PRODUCT_UUID,
      name: 'Mystery Veggies',
      price: 2.0,
      unit: 'bag',
      description: null,
      boothId: 'b1',
      boothName: 'B1',
      photos: [],
      inventory: 5,
      siteUrl: 'https://casagrown.com',
    }
    const prompt = buildProductContextPrompt(product)
    assertNotEquals(prompt.indexOf('No description provided'), -1)
  },
})
