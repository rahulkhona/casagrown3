import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encode } from 'https://deno.land/std@0.208.0/encoding/base64.ts'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

async function run() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  
  // 1. Create a 1x1 red pixel JPEG base64 string
  const base64Img = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
  const binaryString = atob(base64Img)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  
  const path = `test-user/test-vision-${Date.now()}.jpg`
  
  console.log('Uploading photo to community-chat-media bucket...')
  const { error: uploadErr } = await supabase.storage
    .from('community-chat-media')
    .upload(path, bytes.buffer, { contentType: 'image/jpeg' })
    
  if (uploadErr) {
    console.error('Upload failed:', uploadErr)
    return
  }
  console.log('Upload success:', path)

  // 2. Insert message with media
  console.log('Inserting message into community_chat_messages...')
  const { data: msgData, error: insertErr } = await supabase
    .from('community_chat_messages')
    .insert({
      community_h3_index: '89283470c2fffff',
      author_id: '11111111-1111-1111-1111-111111111111', // Dummy user
      content: 'Hello @casabot, what is this red pixel?',
      media: [{ storage_path: path, media_type: 'image/jpeg' }],
      is_system: false,
    })
    .select('id')
    .single()
    
  if (insertErr) {
    console.error('Insert failed:', insertErr)
    return
  }
  
  const msgId = msgData.id
  console.log('Inserted message ID:', msgId)
  
  // 3. Invoke casabot-reply
  console.log('Invoking casabot-reply...')
  const payload = {
    message_id: msgId,
    content: 'Hello @casabot, what is this red pixel?',
    community_h3_index: '89283470c2fffff',
    author_name: 'Vision Tester'
  }
  
  const res = await fetch(`${SUPABASE_URL}/functions/v1/casabot-reply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  
  const result = await res.json()
  console.log('--- CASABOT REPLY ---')
  console.log(result.reply || result.error)
  console.log('---------------------')
}

run().catch(console.error)
