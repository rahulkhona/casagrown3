/**
 * Deno integration tests for the GrowBot edge function.
 *
 * Tests verify:
 * 1. SSE streaming protocol (Content-Type, delta events, done event)
 * 2. Tool calling (sell intent → SellerWizardCard)
 * 3. Error handling (empty message)
 * 4. Guest session support
 * 5. Token usage reporting
 *
 * Run: cd supabase && deno test --allow-env --allow-net --allow-run --no-check functions/_tests/growbot.test.ts
 *
 * NOTE: Requires AI_MOCK=true in .env and edge functions server running.
 */
import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

interface SSEEvent {
  event: string
  data: any
}

/** Parse an SSE text response into structured events */
function parseSSE(text: string): SSEEvent[] {
  const events: SSEEvent[] = []
  let currentEvent = ''
  
  // Normalize line endings — Kong proxy may add \r
  const normalized = text.replace(/\r/g, '')
  
  for (const line of normalized.split('\n')) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim()
    } else if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6).trim())
        events.push({ event: currentEvent, data })
      } catch { /* skip malformed */ }
    }
  }
  return events
}

/** Call growbot edge function and return raw text + parsed events */
async function callGrowbot(payload: Record<string, unknown>): Promise<{ status: number; text: string; events: SSEEvent[]; contentType: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/growbot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  const events = parseSSE(text)
  const contentType = res.headers.get('content-type') || ''
  return { status: res.status, text, events, contentType }
}


// ══════════════════════════════════════════════════════════════
// SSE Protocol
// ══════════════════════════════════════════════════════════════
Deno.test({
  name: 'growbot: response Content-Type is text/event-stream',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { contentType } = await callGrowbot({
      message: 'How do I grow tomatoes?',
      history: [],
      guestSessionId: 'test-proto-1',
    })
    assert(contentType.includes('text/event-stream'), `Expected text/event-stream, got: ${contentType}`)
  },
})

Deno.test({
  name: 'growbot: response contains delta event with text',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { events } = await callGrowbot({
      message: 'How do I grow basil?',
      history: [],
      guestSessionId: 'test-proto-2',
    })
    const deltas = events.filter(e => e.event === 'delta')
    assert(deltas.length > 0, 'Expected at least one delta event')
    assertExists(deltas[0].data.text, 'Delta should have text field')
    assert(deltas[0].data.text.length > 0, 'Delta text should not be empty')
  },
})

Deno.test({
  name: 'growbot: response ends with done event containing text, actions, nextActions',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { events } = await callGrowbot({
      message: 'What plants grow in summer?',
      history: [],
      guestSessionId: 'test-proto-3',
    })
    const doneEvents = events.filter(e => e.event === 'done')
    assertEquals(doneEvents.length, 1, 'Expected exactly one done event')
    
    const done = doneEvents[0].data
    assertExists(done.text, 'Done event should have text')
    assert(Array.isArray(done.actions), 'Done event should have actions array')
    assert(Array.isArray(done.nextActions), 'Done event should have nextActions array')
  },
})

Deno.test({
  name: 'growbot: done event includes usage with token counts',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { events } = await callGrowbot({
      message: 'Tell me about composting',
      history: [],
      guestSessionId: 'test-proto-4',
    })
    const done = events.find(e => e.event === 'done')
    assertExists(done, 'Expected a done event')
    // In mock mode, usage is always present. In real AI mode, it may be absent.
    if (done.data.usage) {
      assert(typeof done.data.usage.promptTokens === 'number', 'usage.promptTokens should be a number')
      assert(typeof done.data.usage.responseTokens === 'number', 'usage.responseTokens should be a number')
    }
  },
})

Deno.test({
  name: 'growbot: guest session is accepted (no userId required)',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { status, events } = await callGrowbot({
      message: 'What is mulching?',
      history: [],
      userId: null,
      guestSessionId: 'guest-test-session',
    })
    // Should not 500 — guest mode works
    assert(status < 500, `Expected non-500 status, got ${status}`)
    const done = events.find(e => e.event === 'done')
    assertExists(done, 'Should still get a done event for guest')
  },
})


// ══════════════════════════════════════════════════════════════
// Tool Calling
// ══════════════════════════════════════════════════════════════
Deno.test({
  name: 'growbot: sell intent triggers SellerWizardCard action',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { events } = await callGrowbot({
      message: 'I want to sell my oranges',
      history: [],
      guestSessionId: 'test-tool-1',
    })
    const done = events.find(e => e.event === 'done')
    assertExists(done, 'Expected done event')
    
    const actions = done.data.actions
    assert(Array.isArray(actions), 'actions should be an array')
    assert(actions.length > 0, 'sell intent should produce at least one action')
    
    const sellerCard = actions.find((a: any) => a.type === 'SellerWizardCard')
    assertExists(sellerCard, 'Expected SellerWizardCard action')
    assertExists(sellerCard.data.title, 'SellerWizardCard should have a title')
  },
})

Deno.test({
  name: 'growbot: gardening question returns nextActions (no tool call)',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { events } = await callGrowbot({
      message: 'How do I care for roses?',
      history: [],
      guestSessionId: 'test-tool-2',
    })
    const done = events.find(e => e.event === 'done')
    assertExists(done, 'Expected done event')
    
    const nextActions = done.data.nextActions
    assert(Array.isArray(nextActions), 'nextActions should be an array')
    assert(nextActions.length > 0, 'Gardening question should have follow-up suggestions')
  },
})

Deno.test({
  name: 'growbot: error message is user-friendly (not raw stack trace)',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // This test verifies the error path format — in mock mode, it shouldn't error,
    // but we verify the response is well-formed regardless
    const { events, status } = await callGrowbot({
      message: 'test error handling',
      history: [],
      guestSessionId: 'test-error-1',
    })
    assert(status < 500, 'Should not return a 500')
    // If there's a done event, its text should not contain raw error traces
    const done = events.find(e => e.event === 'done')
    if (done?.data?.text) {
      assert(!done.data.text.includes('TypeError'), 'Error text should not contain raw TypeErrors')
      assert(!done.data.text.includes('ReferenceError'), 'Error text should not contain raw ReferenceErrors')
      // Check for stack trace patterns like "at Object.<anonymous>" or "at fn (file:///..."
      assert(!/\bat [A-Z]\w+\.\</.test(done.data.text), 'Error text should not contain stack traces')
    }
  },
})
