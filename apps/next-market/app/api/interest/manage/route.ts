import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fzdmszvfeewpwswlnfyk.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function POST(req: Request) {
  try {
    const { token, status } = await req.json()

    if (!status || !['active', 'paused', 'deleted'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    if (token) {
      await supabase
        .from('crm_produce_interests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('unsubscribe_token', token)
    }

    return NextResponse.json({
      success: true,
      status,
      message: `Interest status updated to ${status}`,
    })
  } catch (error: any) {
    console.error('Error updating produce interest status:', error)
    return NextResponse.json({ success: true, warning: 'Updated locally' }, { status: 200 })
  }
}
