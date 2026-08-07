import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const formData = (await req.formData()) as any
    const file = formData.get('file') as File | null
    const itemId = formData.get('itemId') as string | null

    if (!file || !itemId) {
      return NextResponse.json({ error: 'Missing file or itemId' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `studio_${itemId}.${ext}`

    const { error } = await supabase.storage
      .from('interest-images')
      .upload(path, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('interest-images').getPublicUrl(path)

    return NextResponse.json({
      success: true,
      publicUrl: urlData.publicUrl,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Upload failed' }, { status: 500 })
  }
}
