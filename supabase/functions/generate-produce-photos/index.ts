// -----------------------------------------------------------------------------
// Supabase Edge Function: generate-produce-photos
//
// Generates AI produce photos via Gemini image generation models, uploads to
// Supabase Storage, and returns persistent public URLs. Called from the
// Next.js admin API route /api/creative-studio/photos (thin proxy).
//
// Modes:
//   - text_to_image:       Prompt → Gemini decomposition → batch image generation
//   - refine_single_photo: Feedback text → single refined image generation
//   - image_variation:     Variation generation for uploaded reference photos
// -----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// IMAGE_GEN_KEY is the paid/provisioned key specifically for image generation;
// falls back to general GEMINI_API_KEY / GOOGLE_API_KEY
const GEMINI_API_KEY = Deno.env.get("IMAGE_GEN_KEY") || Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY") || ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// Model fallback chain for image generation
const IMAGE_GEN_MODELS = ["gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"]

// Catalog fallback images — used only when AI generation fails entirely
const FALLBACK_IMAGES: Record<string, string> = {
  blueberries: "/images/catalog/studio_blueberries.jpg",
  tomatoes: "/images/catalog/studio_tomatoes.jpg",
  apples: "/images/catalog/studio_apples.jpg",
  strawberries: "/images/catalog/studio_strawberries.jpg",
  avocados: "/images/catalog/studio_avocados.jpg",
  "bell peppers": "/images/catalog/studio_bell_peppers.jpg",
  lemons: "/images/catalog/studio_lemons.jpg",
  basil: "/images/catalog/studio_basil.jpg",
  figs: "/images/catalog/studio_figs.jpg",
  peaches: "/images/catalog/studio_peaches.jpg",
}

function getFallbackImage(name: string): string {
  const normalized = name.toLowerCase().trim()
  for (const [key, url] of Object.entries(FALLBACK_IMAGES)) {
    if (normalized.includes(key)) return url
  }
  return "/images/produce_placeholder.jpg"
}

// ---------------------------------------------------------------------------
// Image generation via Gemini generateContent with IMAGE modality
// ---------------------------------------------------------------------------
async function generateImage(
  supabase: ReturnType<typeof createClient>,
  prompt: string,
  filePrefix: string,
): Promise<{ url: string; source: "ai_generated" | "fallback" }> {
  if (!GEMINI_API_KEY) {
    console.error("[generate-produce-photos] No GEMINI_API_KEY configured")
    return { url: getFallbackImage(filePrefix), source: "fallback" }
  }

  for (const model of IMAGE_GEN_MODELS) {
    try {
      const apiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          }),
        },
      )

      if (apiRes.ok) {
        const data = await apiRes.json()
        const parts = data?.candidates?.[0]?.content?.parts || []
        const imagePart = parts.find((p: any) => p.inlineData?.data)

        if (imagePart?.inlineData?.data) {
          const mimeType = imagePart.inlineData.mimeType || "image/png"
          const ext = mimeType === "image/jpeg" ? "jpg" : "png"

          // Convert base64 to bytes and upload to Supabase Storage
          const binStr = atob(imagePart.inlineData.data)
          const bytes = new Uint8Array(binStr.length)
          for (let i = 0; i < binStr.length; i++) {
            bytes[i] = binStr.charCodeAt(i)
          }

          const safePrefix = filePrefix.toLowerCase().replace(/[^a-z0-9]/g, "_")
          const fileName = `creative-studio/${safePrefix}_${Date.now()}.${ext}`

          const { error: uploadErr } = await supabase.storage
            .from("marketing-assets")
            .upload(fileName, bytes, {
              contentType: mimeType,
              upsert: true,
            })

          if (!uploadErr) {
            const { data: publicUrlData } = supabase.storage
              .from("marketing-assets")
              .getPublicUrl(fileName)
            console.log(`[generate-produce-photos] ${model} success: ${publicUrlData.publicUrl}`)
            return { url: publicUrlData.publicUrl, source: "ai_generated" }
          } else {
            console.error(`[generate-produce-photos] Storage upload failed:`, uploadErr)
          }
        } else {
          console.warn(`[generate-produce-photos] ${model} returned OK but no image data`)
        }
      } else {
        const errText = await apiRes.text()
        console.error(`[generate-produce-photos] ${model} error:`, apiRes.status, errText.substring(0, 300))
      }
    } catch (err: any) {
      console.error(`[generate-produce-photos] ${model} exception:`, err?.message)
    }
  }

  console.error("[generate-produce-photos] All models failed — using fallback")
  return { url: getFallbackImage(filePrefix), source: "fallback" }
}

// ---------------------------------------------------------------------------
// Prompt decomposition via Gemini text model
// ---------------------------------------------------------------------------
interface ImageTask {
  title: string
  produceName: string
  prompt: string
  tags?: string[]
  fallbackKey: string
}

async function parsePromptWithGemini(userPrompt: string, produceContext: string[], aspectRatio: string = "4:5"): Promise<ImageTask[]> {
  if (!GEMINI_API_KEY || !userPrompt.trim()) {
    return produceContext.map((produce) => ({
      title: `${produce} (Organic Harvest)`,
      produceName: produce,
      prompt: `Commercial advertising photograph of fresh ripe ${produce} growing naturally on vibrant plant with morning dew droplets, bright natural sunlight, 8k ultra detailed`,
      tags: [produce.toLowerCase(), "produce", "fresh", "garden"],
      fallbackKey: produce.toLowerCase(),
    }))
  }

  try {
    const systemPrompt = `You are an expert AI commercial advertising photography director.
Analyze the user's prompt and active produce list, then decompose it into an array of distinct image generation tasks.

CRITICAL RULES:
1. PRESERVE the user's exact scene description in each image prompt. Do NOT paraphrase, reinterpret, or substitute the user's words. If the user says "produce tree with lots of produce on it", the image prompt must say exactly that — do not change it to "close-up of produce" or "produce in a bowl" or "produce on a branch".
2. If the user requests non-produce images (e.g. "group of neighbors saying I want"), create a separate dedicated image task for that scene exactly as described. Do NOT replace it with a produce image.
3. If the user specifies ordering (e.g. "this should be the first image"), arrange the tasks array accordingly.
4. Do NOT add props, containers, or settings that the user did not ask for.
5. Append the following technical modifiers to the end of each image prompt: "photorealistic, natural lighting, ${aspectRatio} aspect ratio, 8k". The aspect ratio is important — compose the scene to fit the ${aspectRatio} frame (${aspectRatio === "9:16" ? "tall vertical portrait" : aspectRatio === "16:9" ? "wide horizontal landscape" : aspectRatio === "1:1" ? "square" : "vertical portrait"}).

Return ONLY valid JSON with this exact schema:
{
  "tasks": [
    {
      "title": "Short descriptive title (max 5 words)",
      "produceName": "Produce name or subject name",
      "prompt": "The user's exact scene description for this item, composed for ${aspectRatio} aspect ratio, photorealistic, natural lighting, 8k",
      "tags": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
      "fallbackKey": "lemons" | "tomatoes" | "avocado" | "basil" | "wanted" | "neighbors"
    }
  ]
}`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\nUser Prompt: "${userPrompt}"\nActive Produce Context: ${produceContext.join(", ")}` }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      },
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
    console.warn("[generate-produce-photos] Prompt parser fallback:", err)
  }

  // Fallback to standard produce list
  return produceContext.map((produce) => ({
    title: `${produce} (Organic Harvest)`,
    produceName: produce,
    prompt: `Commercial advertising photograph of fresh ripe ${produce} growing naturally on vibrant plant with morning dew droplets, bright natural sunlight, 8k ultra detailed`,
    tags: [produce.toLowerCase(), "produce", "fresh", "garden"],
    fallbackKey: produce.toLowerCase(),
  }))
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    })
  }

  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const body = await req.json()

    const {
      mode = "text_to_image",
      produceList = ["Meyer Lemons", "Heirloom Tomatoes", "Haas Avocados", "Fresh Basil"],
      count,
      styleOption = "mixed",
      customPrompt = "",
      aspectRatio = "4:5",
      referenceImageUrl = "",
      referenceImageName = "",
    } = body

    const produceArray = Array.isArray(produceList) && produceList.length > 0
      ? produceList
      : ["Meyer Lemons", "Heirloom Tomatoes", "Haas Avocados", "Fresh Basil"]

    // ── MODE 3: REFINE SPECIFIC SINGLE PHOTO CANDIDATE ──
    if (mode === "refine_single_photo") {
      const { targetPhotoId, produceName = "Meyer Lemons", feedbackText = "", styleOption: refineStyle = "crate_collection" } = body
      const cleanPrompt = `Refined commercial advertising photo of generous quantity of fresh ripe ${produceName}: ${feedbackText}, morning sunlight, 8k ultra detailed`

      const result = await generateImage(supabase, cleanPrompt, produceName)

      return new Response(
        JSON.stringify({
          success: true,
          photo: {
            id: targetPhotoId || `photo-${Date.now()}`,
            title: `${produceName} (Refined)`,
            produceName,
            styleOption: refineStyle,
            prompt: cleanPrompt,
            tags: [produceName.toLowerCase(), "refined", "fresh"],
            imageUrl: result.url,
            aspectRatio,
            sourceType: "prompt",
            source: result.source,
            createdAt: new Date().toISOString(),
          },
        }),
        { headers: corsHeaders },
      )
    }

    // ── MODE 2: GENERATE VARIATIONS FOR UPLOADED PHOTO ──
    if (mode === "image_variation" || referenceImageUrl) {
      const safeCount = count ? Math.min(Math.max(1, Number(count)), 12) : produceArray.length
      const instruction = customPrompt && customPrompt.trim()
        ? customPrompt.trim()
        : "commercial advertising photography, enhanced warm morning sunlight, vibrant organic colors, high-end farm stand display"

      const photoPromises = Array.from({ length: safeCount }).map(async (_, i) => {
        const varPrompt = `${instruction}, photorealistic commercial product photography of ${referenceImageName || "fresh produce"}, variation ${i + 1}, 8k, cinematic color grade`
        const result = await generateImage(supabase, varPrompt, referenceImageName || "produce")

        return {
          id: `photo-var-${Date.now()}-${i}`,
          title: referenceImageName ? `${referenceImageName} (Variation ${i + 1})` : `Photo Variation ${i + 1}`,
          produceName: referenceImageName || "Uploaded Produce",
          styleOption: "variation",
          prompt: varPrompt,
          tags: [(referenceImageName || "produce").toLowerCase(), "variation", "produce"],
          imageUrl: result.url,
          aspectRatio,
          sourceType: "upload_variation",
          sourceImageUrl: referenceImageUrl,
          source: result.source,
          createdAt: new Date().toISOString(),
        }
      })

      const photos = await Promise.all(photoPromises)

      return new Response(
        JSON.stringify({
          success: true,
          photos,
          count: photos.length,
        }),
        { headers: corsHeaders },
      )
    }

    // ── MODE 1: PROMPT-DRIVEN PHOTO BATCH GENERATION ──
    const tasks = await parsePromptWithGemini(customPrompt, produceArray, aspectRatio)
    const targetTasks = customPrompt && customPrompt.trim() ? tasks : (count ? tasks.slice(0, Number(count)) : tasks)

    const photoPromises = targetTasks.map(async (task, i) => {
      const result = await generateImage(supabase, task.prompt, task.produceName || task.fallbackKey)

      return {
        id: `photo-${Date.now()}-${i}`,
        title: task.title,
        produceName: task.produceName,
        styleOption,
        prompt: task.prompt,
        tags: task.tags || [task.produceName.toLowerCase(), task.title.toLowerCase()],
        imageUrl: result.url,
        aspectRatio,
        sourceType: "prompt",
        source: result.source,
        createdAt: new Date().toISOString(),
      }
    })

    const photos = await Promise.all(photoPromises)
    const aiCount = photos.filter((p) => p.source === "ai_generated").length
    const fallbackCount = photos.filter((p) => p.source === "fallback").length

    return new Response(
      JSON.stringify({
        success: true,
        photos,
        count: photos.length,
        aiGenerated: aiCount,
        fallbackUsed: fallbackCount,
      }),
      { headers: corsHeaders },
    )
  } catch (err: any) {
    console.error("[generate-produce-photos] Error:", err)
    return new Response(
      JSON.stringify({ error: err.message || "Photo generation failed" }),
      { status: 500, headers: corsHeaders },
    )
  }
})
