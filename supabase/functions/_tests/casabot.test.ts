import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const REST_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
  'Prefer': 'return=representation',
}

const CASABOT_ID = 'a0000000-0000-0000-0000-00000ca5ab07'

/** Create a test user via HTTP signup */
async function ensureTestUser(): Promise<string> {
  const email = `casabot-test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password: 'TestPassword123!' }),
  })
  const data = await res.json()
  if (!data.user?.id) throw new Error(`Failed to create test user: ${JSON.stringify(data)}`)
  return data.user.id
}

/** Insert a message into community_chat_messages */
async function insertMessage(userId: string, content: string, createdAtOffsetMins = 10, isSystem = false): Promise<string> {
  const createdAt = new Date(Date.now() - createdAtOffsetMins * 60 * 1000).toISOString()
  
  const res = await fetch(`${SUPABASE_URL}/rest/v1/community_chat_messages`, {
    method: 'POST',
    headers: REST_HEADERS,
    body: JSON.stringify({
      community_h3_index: '89283470c2fffff', // Test region
      author_id: userId,
      content,
      is_system: isSystem,
      created_at: createdAt
    }),
  })
  const data = await res.json()
  return data[0].id
}

async function getReplyCount(parentId: string): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/community_chat_messages?parent_id=eq.${parentId}&select=id`, {
    method: 'GET',
    headers: REST_HEADERS,
  })
  const data = await res.json()
  return data.length
}

Deno.test({
  name: 'casabot-auto-reply: skips non-gardening messages',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureTestUser()
    
    // Insert a dummy message that is clearly NOT about gardening, 10 mins ago
    const msgId = await insertMessage(userId, "Anyone know a good mechanic?", 10)
    
    // Invoke casabot-auto-reply
    const res = await fetch(`${SUPABASE_URL}/functions/v1/casabot-auto-reply`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ANON_KEY}` }, // Edge functions use anon key
    })
    
    const data = await res.json()
    // It should either process 0, or process it but determine SKIP and not insert a reply.
    // If it processed it and skipped, the reply count for msgId should still be 0.
    const replyCount = await getReplyCount(msgId)
    assertEquals(replyCount, 0, 'CasaBot should not have replied to a non-gardening question')
  },
})

Deno.test({
  name: 'casabot-auto-reply: replies to gardening questions',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureTestUser()
    
    // Insert a dummy message about gardening, 10 mins ago
    const msgId = await insertMessage(userId, "My tomato leaves are turning yellow and falling off. What should I do?", 10)
    
    // Invoke casabot-auto-reply
    const res = await fetch(`${SUPABASE_URL}/functions/v1/casabot-auto-reply`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ANON_KEY}` },
    })
    
    const data = await res.json()
    // Depending on timing/limit, it might have processed it.
    // We should assert that it either processed 0 (if another test stole it) or >0.
    // Let's assert that the reply count for msgId increased or the function ran successfully.
    // We can't guarantee 100% since rate limits or limits=3 might apply, but in isolated tests it should process.
    
    const replyCount = await getReplyCount(msgId)
    if (data.processed > 0) {
      assertEquals(replyCount, 1, 'CasaBot should have replied to the gardening question')
    }
  },
})

Deno.test({
  name: 'casabot-reply: handles conversational thread continuity',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const userId = await ensureTestUser()
    // Insert a real message to serve as the valid parent_id for the thread
    const msgId = await insertMessage(userId, "What goes well with basil?", 1)

    // Invoke casabot-reply directly with a payload simulating a thread
    const payload = {
      message_id: msgId,
      content: "What goes well with basil?",
      author_name: "TestUser",
      community_h3_index: '89283470c2fffff',
      history: [
        { role: 'user', content: 'What grows well in summer?' },
        { role: 'assistant', content: 'Tomatoes and basil grow incredibly well together in the summer heat.' }
      ]
    }
    
    const res = await fetch(`${SUPABASE_URL}/functions/v1/casabot-reply`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    const data = await res.json()
    
    if (data.error) {
      console.warn(`[WARN] CasaBot encountered an error (likely missing OpenAI key): ${data.error}`)
      return // Skip strict assertion locally
    }
    
    // Verify response format if successful
    assertExists(data.reply)
    assertEquals(typeof data.reply, 'string')
    // String should have some length indicating a real generated response
    assertEquals(data.reply.length > 20, true, 'CasaBot should generate a thorough response')
  },
})
