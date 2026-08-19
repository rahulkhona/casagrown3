import { NextRequest, NextResponse } from 'next/server'
import { adminSupabase } from '../../../../lib/adminSupabase'

/**
 * Shared type for generated produce photo candidates.
 * Consumed by AntigravityCreativeWorkspace component.
 */
export interface GeneratedProducePhoto {
  id: string
  title: string
  produceName: string
  styleOption: 'on_trees' | 'harvest_tray' | 'box_collection' | 'market_stand' | 'macro_close_up' | 'variation'
  prompt: string
  tags?: string[]
  imageUrl: string
  aspectRatio: '1:1' | '4:5' | '9:16' | '16:9'
  sourceType: 'prompt' | 'upload_variation'
  sourceImageUrl?: string
  source?: 'ai_generated' | 'fallback'
  createdAt: string
}

/**
 * Thin proxy to the Supabase edge function `generate-produce-photos`.
 *
 * All AI image generation runs on Supabase (which has GEMINI_API_KEY configured
 * via secrets). This route simply forwards the request body and returns the
 * edge function response.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { data, error } = await adminSupabase.functions.invoke('generate-produce-photos', {
      body,
    })

    if (error) {
      console.error('[Produce Photos API] Edge function error:', error)
      return NextResponse.json(
        { error: error.message || 'Edge function invocation failed' },
        { status: 502 },
      )
    }

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[Produce Photos API] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Photo generation failed' },
      { status: 500 },
    )
  }
}
