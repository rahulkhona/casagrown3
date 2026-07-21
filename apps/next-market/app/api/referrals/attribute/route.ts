import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const queryRef = searchParams.get('ref')
    const queryIntent = searchParams.get('intent')

    const cookieStore = await cookies()
    const cookieRef = cookieStore.get('cg_ref')?.value
    const cookieIntent = cookieStore.get('cg_intent')?.value

    const referrerId = queryRef || cookieRef || null
    let intentData = null

    if (cookieIntent) {
      try {
        intentData = JSON.parse(cookieIntent)
      } catch (e) {
        intentData = { type: queryIntent || 'follow' }
      }
    } else if (queryIntent) {
      intentData = { type: queryIntent }
    }

    return NextResponse.json({
      success: true,
      referrerId,
      intent: intentData,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Attribution failed' },
      { status: 500 }
    )
  }
}
