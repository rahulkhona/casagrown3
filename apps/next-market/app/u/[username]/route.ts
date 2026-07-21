import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const resolvedParams = await params
  const { searchParams } = new URL(request.url)

  const username = resolvedParams.username
  const ref = searchParams.get('ref') || ''
  const intent = searchParams.get('intent') || 'follow'

  const cookieStore = await cookies()
  if (ref) {
    cookieStore.set('cg_ref', ref, { maxAge: 30 * 24 * 60 * 60, path: '/' })
  }
  if (intent) {
    cookieStore.set('cg_intent', JSON.stringify({ type: intent, target: username, ref }), {
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })
  }

  return NextResponse.redirect(
    new URL(`/?ref=${ref}&intent=${intent}&user=${username}`, request.url)
  )
}
