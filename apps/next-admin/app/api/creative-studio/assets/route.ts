import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

export interface SavedAsset {
  id: string
  type: 'video' | 'photo'
  title: string
  description?: string
  produceList: string[]
  avatarName?: string
  voiceName?: string
  mediaUrl: string
  thumbnailUrl: string
  storagePath?: string
  durationSeconds?: number
  aspectRatio: '1:1' | '4:5' | '9:16' | '16:9'
  qaScore?: number
  scenesCount?: number
  metadata?: any
  savedAt: string
}

const DATA_FILE = path.join(process.cwd(), 'data', 'saved-creative-assets.json')

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function loadAssetsFromDisk(): SavedAsset[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (err) {
    console.error('[Assets API] Error reading data file:', err)
  }
  return []
}

function saveAssetsToDisk(assets: SavedAsset[]) {
  try {
    const dir = path.dirname(DATA_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(assets, null, 2), 'utf-8')
  } catch (err) {
    console.error('[Assets API] Error writing data file:', err)
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const filterType = searchParams.get('type') // 'photo' | 'video' | null

    const assets = loadAssetsFromDisk()
    const filtered = filterType ? assets.filter(a => a.type === filterType) : assets

    return NextResponse.json({ assets: filtered })
  } catch (err: any) {
    return NextResponse.json({ assets: [], error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    let type: 'photo' | 'video' = 'photo'
    let title = 'Custom Creative Asset'
    let description = ''
    let produceList: string[] = []
    let avatarName = ''
    let voiceName = ''
    let mediaUrl = ''
    let thumbnailUrl = ''
    let durationSeconds = 15
    let aspectRatio: '1:1' | '4:5' | '9:16' | '16:9' = '4:5'
    let qaScore = 95
    let scenesCount = 1
    let metadata: any = null
    let fileBuffer: Buffer | null = null
    let fileExt = 'webm'
    let fileMime = 'video/webm'

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      type = ((formData.get('type') as string) || 'video') as 'photo' | 'video'
      title = (formData.get('title') as string) || 'Motion Video'
      description = (formData.get('description') as string) || ''
      try {
        produceList = JSON.parse((formData.get('produceList') as string) || '[]')
      } catch {
        produceList = [(formData.get('produceList') as string)].filter(Boolean)
      }
      durationSeconds = Number(formData.get('durationSeconds')) || 15
      aspectRatio = ((formData.get('aspectRatio') as string) || '9:16') as any
      thumbnailUrl = (formData.get('thumbnailUrl') as string) || ''
      mediaUrl = (formData.get('mediaUrl') as string) || ''

      const file = formData.get('file') as File | null
      if (file) {
        const arrayBuffer = await file.arrayBuffer()
        fileBuffer = Buffer.from(arrayBuffer)
        fileMime = file.type || (type === 'video' ? 'video/webm' : 'image/jpeg')
        fileExt = fileMime.includes('mp4') ? 'mp4' : fileMime.includes('png') ? 'png' : fileMime.includes('jpg') || fileMime.includes('jpeg') ? 'jpg' : 'webm'
      }
    } else {
      const body = await req.json()
      type = body.type || 'photo'
      title = body.title || 'Custom Creative Asset'
      description = body.description || ''
      produceList = Array.isArray(body.produceList) ? body.produceList : [body.produceList].filter(Boolean)
      avatarName = body.avatarName || ''
      voiceName = body.voiceName || ''
      mediaUrl = body.mediaUrl || ''
      thumbnailUrl = body.thumbnailUrl || ''
      durationSeconds = body.durationSeconds || 15
      aspectRatio = body.aspectRatio || '4:5'
      qaScore = body.qaScore || 95
      scenesCount = body.scenesCount || 1
      metadata = body.metadata || null
    }

    let finalMediaUrl = mediaUrl || thumbnailUrl
    let finalThumbnailUrl = thumbnailUrl || mediaUrl
    let storagePath: string | undefined = undefined

    const supabase = getSupabase()

    // 1. If binary fileBuffer uploaded via FormData
    if (supabase && fileBuffer) {
      try {
        const filePath = `creative-studio/${type}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('marketing-assets')
          .upload(filePath, fileBuffer, {
            contentType: fileMime,
            upsert: true,
          })

        if (!uploadErr && uploadData) {
          storagePath = filePath
          const { data: publicUrlData } = supabase.storage
            .from('marketing-assets')
            .getPublicUrl(filePath)
          if (publicUrlData?.publicUrl) {
            finalMediaUrl = publicUrlData.publicUrl
            if (!finalThumbnailUrl || finalThumbnailUrl.startsWith('data:')) {
              finalThumbnailUrl = publicUrlData.publicUrl
            }
          }
        }
      } catch (uploadErr) {
        console.error('[Assets API] Failed to upload binary file to Supabase storage:', uploadErr)
      }
    }
    // 2. If media is a base64 string
    else if (supabase && finalMediaUrl && finalMediaUrl.startsWith('data:')) {
      try {
        const mimeMatch = finalMediaUrl.match(/^data:(image\/[a-zA-Z+]+|video\/[a-zA-Z0-9+]+);base64,(.*)$/)
        if (mimeMatch) {
          const mimeType = mimeMatch[1]
          const base64Data = mimeMatch[2]
          const buffer = Buffer.from(base64Data, 'base64')
          const ext = mimeType.includes('png') ? 'png' : mimeType.includes('mp4') ? 'mp4' : mimeType.includes('webm') ? 'webm' : 'jpg'
          const filePath = `creative-studio/${type}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('marketing-assets')
            .upload(filePath, buffer, {
              contentType: mimeType,
              upsert: true,
            })

          if (!uploadErr && uploadData) {
            storagePath = filePath
            const { data: publicUrlData } = supabase.storage
              .from('marketing-assets')
              .getPublicUrl(filePath)
            if (publicUrlData?.publicUrl) {
              finalMediaUrl = publicUrlData.publicUrl
              finalThumbnailUrl = publicUrlData.publicUrl
            }
          }
        }
      } catch (uploadErr) {
        console.error('[Assets API] Failed to upload base64 media to Supabase storage:', uploadErr)
      }
    }

    // Also sync to Supabase crm_assets table if available
    if (supabase) {
      try {
        await supabase.from('crm_assets').insert({
          name: title,
          description: description || null,
          type: type === 'video' ? 'video' : 'image',
          storage_path: storagePath || null,
          content: finalMediaUrl,
          tags: ['creative-studio', type, ...(Array.isArray(produceList) ? produceList : [])],
        })
      } catch (crmErr) {
        // Non-blocking if table not accessible
      }
    }

    const newAsset: SavedAsset = {
      id: `asset-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      title,
      description,
      produceList: Array.isArray(produceList) ? produceList : [produceList].filter(Boolean),
      avatarName,
      voiceName,
      mediaUrl: finalMediaUrl,
      thumbnailUrl: finalThumbnailUrl,
      storagePath,
      durationSeconds,
      aspectRatio,
      qaScore,
      scenesCount,
      metadata,
      savedAt: new Date().toISOString(),
    }

    const currentAssets = loadAssetsFromDisk()
    const updated = [newAsset, ...currentAssets]
    saveAssetsToDisk(updated)

    return NextResponse.json({
      success: true,
      asset: newAsset,
      totalAssets: updated.length,
    })
  } catch (err: any) {
    console.error('[Assets API] Error saving asset:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to save asset' },
      { status: 500 }
    )
  }
}
