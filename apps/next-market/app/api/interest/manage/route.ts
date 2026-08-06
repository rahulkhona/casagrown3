import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fzdmszvfeewpwswlnfyk.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function POST(req: Request) {
  try {
    const { id, token, status, action, user_id } = await req.json()

    const targetStatus = status || (action === 'delete' ? 'deleted' : null)

    if (action !== 'delete' && (!targetStatus || !['active', 'paused', 'deleted'].includes(targetStatus))) {
      return NextResponse.json({ error: 'Invalid status or action' }, { status: 400 })
    }

    if (!id && !token) {
      return NextResponse.json({ error: 'Missing interest ID or token' }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    if (action === 'delete' || targetStatus === 'deleted') {
      let query = supabase.from('crm_produce_interests').delete()
      if (id) {
        query = query.eq('id', id)
        if (user_id) query = query.eq('user_id', user_id)
      } else if (token) {
        query = query.eq('unsubscribe_token', token)
      }

      const { error: delErr } = await query
      if (delErr) {
        console.error('Error deleting produce interest:', delErr)
        return NextResponse.json({ success: false, error: delErr.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action: 'deleted',
        message: 'Produce interest deleted successfully',
      })
    }

    // Otherwise update status ('active' | 'paused')
    let query = supabase
      .from('crm_produce_interests')
      .update({ status: targetStatus, updated_at: new Date().toISOString() })

    if (id) {
      query = query.eq('id', id)
      if (user_id) query = query.eq('user_id', user_id)
    } else if (token) {
      query = query.eq('unsubscribe_token', token)
    }

    const { error: updateErr } = await query
    if (updateErr) {
      console.error('Error updating produce interest status:', updateErr)
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      status: targetStatus,
      message: `Interest status updated to ${targetStatus}`,
    })
  } catch (error: any) {
    console.error('Error in interest management endpoint:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 })
  }
}

