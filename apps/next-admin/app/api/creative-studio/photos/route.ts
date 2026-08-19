import { NextRequest, NextResponse } from 'next/server'
import { getInterestImage } from '../../../../../next-market/lib/interestCatalog'

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
  createdAt: string
}

interface ImageTask {
  title: string
  produceName: string
  prompt: string
  tags?: string[]
  fallbackKey: string
}

const IMAGE_API_KEY = process.env.IMAGE_GEN_KEY || process.env.GEMINI_API_KEY || ''
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

async function callImagen3Model(prompt: string, aspectRatio: string = '4:5'): Promise<string | null> {
  if (!IMAGE_API_KEY || process.env.AI_MOCK === 'true') return null

  // Map requested aspect ratio to Imagen 3 supported formats: '1:1' | '9:16' | '16:9' | '3:4' | '4:3'
  const validAspectRatio =
    aspectRatio === '9:16' ? '9:16' :
    aspectRatio === '16:9' ? '16:9' :
    aspectRatio === '1:1' ? '1:1' :
    aspectRatio === '4:5' ? '3:4' : '3:4'

  try {
    const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:generateImages?key=${IMAGE_API_KEY}`
    const res = await fetch(imagenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: validAspectRatio,
          outputMimeType: 'image/jpeg',
        },
      }),
    })

    if (res.ok) {
      const data = await res.json()
      const base64Bytes = data.generatedImages?.[0]?.image?.imageBytes
      if (base64Bytes) {
        return `data:image/jpeg;base64,${base64Bytes}`
      }
    } else {
      const errText = await res.text()
      console.error('[Imagen 3 API Error]:', res.status, errText)
    }
  } catch (err) {
    console.error('[Imagen 3 API Exception]:', err)
  }

  return null
}

async function parsePromptWithGemini(userPrompt: string, produceContext: string[]): Promise<ImageTask[]> {
  if (!GEMINI_API_KEY || !userPrompt.trim()) {
    // Fallback default tasks if Gemini is unavailable
    return produceContext.map((produce) => ({
      title: `${produce} (Organic Harvest)`,
      produceName: produce,
      prompt: `Commercial advertising photograph of fresh ripe ${produce} growing naturally on vibrant plant with morning dew droplets, bright natural sunlight, 8k ultra detailed`,
      tags: [produce.toLowerCase(), 'produce', 'fresh', 'garden'],
      fallbackKey: produce.toLowerCase(),
    }))
  }

  try {
    const systemPrompt = `You are an expert AI commercial advertising photography director.
Analyze the user's prompt and active produce list, then decompose it into an array of distinct image generation tasks.
FAITHFULLY follow the user's explicit scene setting (e.g. tree full of fruit, vines in backyard garden, plants, containers, harvest trays, community signs, people). DO NOT force containers or crates unless the user explicitly requested them.
Return ONLY valid JSON with this exact schema:
{
  "tasks": [
    {
      "title": "Short descriptive title (max 5 words)",
      "produceName": "Produce name or subject name",
      "prompt": "Detailed photorealistic commercial photography prompt tailored for Imagen 3 following user's instructions (subject, natural environment, lighting, natural depth of field, 8k)",
      "tags": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
      "fallbackKey": "lemons" | "tomatoes" | "avocado" | "basil" | "wanted" | "neighbors"
    }
  ]
}`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\nUser Prompt: "${userPrompt}"\nActive Produce Context: ${produceContext.join(', ')}` }]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }
    )

    if (res.ok) {
      const data = await res.json()
      const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (rawJson) {
        const parsed = JSON.parse(rawJson)
        if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
          return parsed.tasks
        }
      }
    }
  } catch (err) {
    console.warn('[Prompt Parser] Fallback to default produce list:', err)
  }

  // Fallback to standard produce list
  return produceContext.map((produce) => ({
    title: `${produce} (Organic Harvest)`,
    produceName: produce,
    prompt: `Commercial advertising photograph of fresh ripe ${produce} growing naturally on vibrant plant with morning dew droplets, bright natural sunlight, 8k ultra detailed`,
    tags: [produce.toLowerCase(), 'produce', 'fresh', 'garden'],
    fallbackKey: produce.toLowerCase(),
  }))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      mode = 'text_to_image', // 'text_to_image' | 'image_variation' | 'refine_single_photo'
      produceList = ['Meyer Lemons', 'Heirloom Tomatoes', 'Haas Avocados', 'Fresh Basil'],
      count,
      styleOption = 'mixed',
      customPrompt = '',
      aspectRatio = '4:5',
      referenceImageUrl = '',
      referenceImageName = '',
    } = body

    const produceArray = Array.isArray(produceList) && produceList.length > 0
      ? produceList
      : ['Meyer Lemons', 'Heirloom Tomatoes', 'Haas Avocados', 'Fresh Basil']

    // ── MODE 3: REFINE SPECIFIC SINGLE PHOTO CANDIDATE ──
    if (mode === 'refine_single_photo') {
      const { targetPhotoId, produceName = 'Meyer Lemons', feedbackText = '', styleOption = 'crate_collection' } = body
      const cleanPrompt = `Refined commercial advertising photo of generous quantity of fresh ripe ${produceName}: ${feedbackText}, morning sunlight, 8k ultra detailed`
      const aiUrl = await callImagen3Model(cleanPrompt, aspectRatio)
      const fallbackUrl = getInterestImage(produceName)

      const refinedPhoto: GeneratedProducePhoto = {
        id: targetPhotoId || `photo-${Date.now()}`,
        title: `${produceName} (Refined)`,
        produceName,
        styleOption: styleOption as any,
        prompt: cleanPrompt,
        tags: [produceName.toLowerCase(), 'refined', 'fresh'],
        imageUrl: aiUrl || fallbackUrl,
        aspectRatio: aspectRatio as any,
        sourceType: 'prompt',
        createdAt: new Date().toISOString(),
      }

      return NextResponse.json({
        success: true,
        photo: refinedPhoto,
      })
    }

    // ── MODE 2: GENERATE VARIATIONS FOR UPLOADED PHOTO ──
    if (mode === 'image_variation' || referenceImageUrl) {
      const safeCount = count ? Math.min(Math.max(1, Number(count)), 12) : produceArray.length
      const instruction = customPrompt && customPrompt.trim()
        ? customPrompt.trim()
        : 'commercial advertising photography, enhanced warm morning sunlight, vibrant organic colors, high-end farm stand display'

      const photos = Array.from({ length: safeCount }).map((_, i) => {
        const fallbackUrl = getInterestImage(referenceImageName || 'produce')
        return {
          id: `photo-var-${Date.now()}-${i}`,
          title: referenceImageName ? `${referenceImageName} (Variation ${i + 1})` : `Photo Variation ${i + 1}`,
          produceName: referenceImageName || 'Uploaded Produce',
          styleOption: 'variation' as const,
          prompt: `${instruction}, photorealistic commercial product photography, 8k, cinematic color grade`,
          tags: [referenceImageName.toLowerCase(), 'variation', 'produce'],
          imageUrl: fallbackUrl,
          aspectRatio: aspectRatio as any,
          sourceType: 'upload_variation' as const,
          sourceImageUrl: referenceImageUrl,
          createdAt: new Date().toISOString(),
        }
      })

      return NextResponse.json({
        success: true,
        photos,
        count: photos.length,
      })
    }

    // ── MODE 1: PROMPT-DRIVEN PHOTO BATCH GENERATION ──
    // Decompose prompt with Gemini to generate distinct tailored tasks
    const tasks = await parsePromptWithGemini(customPrompt, produceArray)
    const targetTasks = count ? tasks.slice(0, Number(count)) : tasks

    const photoPromises = targetTasks.map(async (task, i) => {
      const aiUrl = await callImagen3Model(task.prompt, aspectRatio)
      const fallbackUrl = getInterestImage(task.produceName || task.fallbackKey)

      return {
        id: `photo-${Date.now()}-${i}`,
        title: task.title,
        produceName: task.produceName,
        styleOption: styleOption as any,
        prompt: task.prompt,
        tags: task.tags || [task.produceName.toLowerCase(), task.title.toLowerCase()],
        imageUrl: aiUrl || fallbackUrl,
        aspectRatio: aspectRatio as any,
        sourceType: 'prompt' as const,
        createdAt: new Date().toISOString(),
      }
    })

    const photos = await Promise.all(photoPromises)

    return NextResponse.json({
      success: true,
      photos,
      count: photos.length,
    })
  } catch (err: any) {
    console.error('[Produce Photos API] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Photo generation failed' },
      { status: 500 }
    )
  }
}
