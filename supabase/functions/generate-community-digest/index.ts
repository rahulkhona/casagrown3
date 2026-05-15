/**
 * generate-community-digest — AI-powered summary of recent community discussions
 *
 * Runs hourly via pg_cron. Skips if no new messages since last digest.
 * Summarizes the last 10 messages into a 2-3 sentence teaser for share/invite messages.
 */
import { serveWithCors, jsonOk } from '../_shared/serve-with-cors.ts'

const AI_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? "";
const AI_URL = Deno.env.get("AI_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemma-4-31b-it";

serveWithCors(async (req, { supabase, corsHeaders }) => {
  // 1. Get the latest existing digest
  const { data: latestDigest } = await supabase
    .from('community_digests')
    .select('id, last_message_id, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // 2. Get the most recent message ID
  const { data: latestMessage } = await supabase
    .from('community_chat_messages')
    .select('id')
    .is('parent_id', null)
    .eq('is_system', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // 3. Skip if no messages at all
  if (!latestMessage) {
    return jsonOk({ skipped: true, reason: 'No community messages found' }, corsHeaders)
  }

  // 4. Skip if no new messages since last digest
  if (latestDigest && latestDigest.last_message_id === latestMessage.id) {
    return jsonOk({ skipped: true, reason: 'No new messages since last digest' }, corsHeaders)
  }

  // 5. Fetch last 10 non-system, top-level messages with author names
  const { data: messages, error: msgError } = await supabase
    .from('community_chat_messages')
    .select('content, created_at, author_id')
    .is('parent_id', null)
    .eq('is_system', false)
    .order('created_at', { ascending: false })
    .limit(10)

  if (msgError || !messages || messages.length === 0) {
    return jsonOk({ skipped: true, reason: 'Could not fetch messages' }, corsHeaders)
  }

  // 6. Get author names
  const authorIds = [...new Set(messages.map((m: any) => m.author_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', authorIds)

  const nameMap: Record<string, string> = {}
  for (const p of (profiles || [])) {
    nameMap[p.id] = p.full_name?.split(' ')[0] || 'A neighbor'
  }

  // 7. Format messages for AI
  const formattedMessages = messages
    .reverse()
    .map((m: any) => {
      const name = nameMap[m.author_id] || 'A neighbor'
      // Strip media JSON, keep text only
      const content = m.content.replace(/\[image\]|\[photo\]/gi, '').trim()
      return `${name}: ${content}`
    })
    .join('\n')

  // 8. Call AI
  if (!AI_KEY) {
    return jsonOk({ skipped: true, reason: 'AI credentials not configured' }, corsHeaders)
  }

  const prompt = `You are writing a short, enticing summary of recent conversations in a neighborhood gardening community called CasaGrown.

Here are the last ${messages.length} messages from the community chat:

${formattedMessages}

Write a 2-3 sentence summary that:
- Highlights what neighbors are talking about (growing, trading, asking about)
- Feels warm, lively, and welcoming
- Makes someone want to join the conversation
- Uses emoji sparingly (1-2 max)
- Does NOT mention specific usernames
- Is under 280 characters total

Return ONLY the summary text, no quotes or labels.`

  try {
    const aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
        "HTTP-Referer": "https://casagrown.com",
        "X-Title": "CasaGrown Community Digest",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('AI call failed:', aiRes.status, errText)
      return jsonOk({ skipped: true, reason: `AI call failed: ${aiRes.status}` }, corsHeaders)
    }

    const aiData = await aiRes.json()
    const summary = (aiData.choices?.[0]?.message?.content ?? '')
      .replace(/```/g, '')
      .replace(/^["']|["']$/g, '')
      .trim()

    if (!summary || summary.length < 20) {
      return jsonOk({ skipped: true, reason: 'AI returned empty or too-short summary' }, corsHeaders)
    }

    // 9. Store the digest
    const { error: insertError } = await supabase
      .from('community_digests')
      .insert({
        summary,
        message_count: messages.length,
        last_message_id: latestMessage.id,
      })

    if (insertError) {
      console.error('Failed to insert digest:', insertError)
      return jsonOk({ error: insertError.message }, corsHeaders)
    }

    // 10. Cleanup: keep only last 24 digests (1 day of hourly)
    const { data: oldDigests } = await supabase
      .from('community_digests')
      .select('id')
      .order('created_at', { ascending: false })
      .range(24, 1000)

    if (oldDigests && oldDigests.length > 0) {
      await supabase
        .from('community_digests')
        .delete()
        .in('id', oldDigests.map((d: any) => d.id))
    }

    return jsonOk({
      success: true,
      summary,
      messageCount: messages.length,
      lastMessageId: latestMessage.id,
    }, corsHeaders)

  } catch (err: any) {
    console.error('Community digest generation failed:', err)
    return jsonOk({ error: err.message }, corsHeaders)
  }
})
