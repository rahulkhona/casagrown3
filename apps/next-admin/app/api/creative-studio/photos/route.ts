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

const IMAGE_API_KEY = process.env.IMAGE_GEN_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || process.env.GOOGLE_GENAI_API_KEY || ''
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || process.env.GOOGLE_GENAI_API_KEY || ''

// Image generation model chain: gemini-3.1-flash-image → gemini-3.1-flash-lite-image
// NOTE: imagen-3.0-generate-002 is a Vertex AI enterprise endpoint (404 on standard Gemini API keys).
// The correct models for generateContent-based image generation are the gemini-3.1-*-image family.
const IMAGE_GEN_MODELS = ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']

async function callImagen3Model(prompt: string, aspectRatio: string = '4:5'): Promise<string | null> {
  const apiKey = process.env.IMAGE_GEN_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || process.env.GOOGLE_GENAI_API_KEY || ''
  if (!apiKey || process.env.AI_MOCK === 'true') return null

  for (const model of IMAGE_GEN_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const parts = data?.candidates?.[0]?.content?.parts || []
        const imagePart = parts.find((p: any) => p.inlineData?.data)
        if (imagePart?.inlineData?.data) {
          const mimeType = imagePart.inlineData.mimeType || 'image/png'
          return `data:${mimeType};base64,${imagePart.inlineData.data}`
        }
        console.warn(`[Image Gen] ${model} returned OK but no image data`)
      } else {
        const errText = await res.text()
        console.error(`[Image Gen] ${model} error:`, res.status, errText.substring(0, 200))
      }
    } catch (err) {
      console.error(`[Image Gen] ${model} exception:`, err)
    }
  }

  console.error('[Image Gen] All models failed — no image generated')
  return null
}

async function parsePromptWithGemini(userPrompt: string, produceContext: string[]): Promise<ImageTask[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || process.env.GOOGLE_GENAI_API_KEY || ''
  if (!apiKey || !userPrompt.trim()) {
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
FAITHFULLY follow the user's explicit instructions:
- If the user asks for produce images (e.g. tree full of fruit, vines, plants in garden soil), create an image task for each requested produce item.
- If the user asks for additional non-produce images (e.g. "several neighbors saying I Want", "community members smiling", "farm stand banner", "buyers in front of garden"), ALWAYS create separate image tasks for each of those requested images.
- If the user specifies an order (e.g. "This should be the first image"), arrange the tasks array in that exact requested sequence.
- DO NOT force containers or crates unless the user explicitly requested them.
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
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
    const targetTasks = customPrompt && customPrompt.trim() ? tasks : (count ? tasks.slice(0, Number(count)) : tasks)

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
