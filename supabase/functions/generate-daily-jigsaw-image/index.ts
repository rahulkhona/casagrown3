// -----------------------------------------------------------------------------
// Supabase Edge Function: generate-daily-jigsaw-image
//
// Description: Generates 1 daily produce image via Google Imagen 3 API,
// uploads to Supabase Storage bucket 'produce-images', and inserts into
// jigsaw_image_pool (enforcing 1,000 pool cap & support email alerts on error).
// -----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

const CROPS = [
  "Meyer Lemons", "Organic Strawberries", "Heirloom Tomatoes", "Fresh Basil", 
  "Mission Figs", "Baby Spinach", "Green Zucchini", "Garlic Bulbs", 
  "Bell Peppers", "Sweet Carrots", "Spearmint", "Navel Oranges",
  "Hass Avocados", "Red Radishes", "Juicy Pears", "Crisp Apples"
]

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    })
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const todayStr = new Date().toISOString().split("T")[0]

    let forceFailure = false
    try {
      const body = await req.json()
      forceFailure = body?.force_failure === true
    } catch {}

    // 1. Check if an image was already generated for today
    const { data: existingPool } = await supabase
      .from("jigsaw_image_pool")
      .select("image_url, crop_name")
      .filter("created_at", "gte", `${todayStr}T00:00:00Z`)
      .limit(1)

    if (existingPool && existingPool.length > 0 && !forceFailure) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Today's jigsaw image already exists",
          imageUrl: existingPool[0].image_url,
          cropName: existingPool[0].crop_name,
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    }

    // 1b. Check total AI-generated image count in jigsaw_image_pool
    const { count: aiGeneratedCount } = await supabase
      .from("jigsaw_image_pool")
      .select("*", { count: "exact", head: true })
      .eq("source", "ai_generated")

    if (aiGeneratedCount && aiGeneratedCount >= 1000) {
      console.log("Reached 1,000 AI generated images! Stopping new generation and reusing pool.")
      const { data: existingImage } = await supabase.rpc("get_or_create_daily_jigsaw_image", { p_date: todayStr })
      return new Response(
        JSON.stringify({
          success: true,
          message: "1,000 AI generated image milestone reached — reusing existing pool",
          imageUrl: existingImage || "/images/catalog/studio_mandarins.jpg",
          source: "1000_ai_image_cap_reached",
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    }

    // 2. Select crop deterministically based on date seed
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
    const cropName = CROPS[dayOfYear % CROPS.length]

    // 3. Call Gemini Image Generation API
    // NOTE: imagen-3.0-generate-002:generateImages is a Vertex AI enterprise endpoint (404 on standard keys).
    // Use gemini-3.1-flash-image via generateContent with responseModalities: ['IMAGE'].
    const prompt = `Photorealistic top-down studio photography of fresh organic ${cropName} harvested from a garden, vibrant natural colors, bright morning sunlight, 4k ultra detailed, professional produce catalog photo.`

    let imageUrl: string | null = null

    const IMAGE_GEN_MODELS = ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']

    if (GEMINI_API_KEY && !forceFailure) {
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
            }
          )

          if (apiRes.ok) {
            const apiData = await apiRes.json()
            const parts = apiData?.candidates?.[0]?.content?.parts || []
            const imagePart = parts.find((p: any) => p.inlineData?.data)
            if (imagePart?.inlineData?.data) {
              const mimeType = imagePart.inlineData.mimeType || "image/png"
              const ext = mimeType === "image/jpeg" ? "jpg" : "png"

              // Convert base64 to Uint8Array and upload to Supabase Storage
              const binStr = atob(imagePart.inlineData.data)
              const bytes = new Uint8Array(binStr.length)
              for (let i = 0; i < binStr.length; i++) {
                bytes[i] = binStr.charCodeAt(i)
              }

              const fileName = `jigsaw_${todayStr}_${Date.now()}.${ext}`
              const { data: uploadData, error: uploadErr } = await supabase.storage
                .from("produce-images")
                .upload(`jigsaw_pool/${fileName}`, bytes, {
                  contentType: mimeType,
                  upsert: true,
                })

              if (!uploadErr && uploadData) {
                const { data: publicUrlData } = supabase.storage
                  .from("produce-images")
                  .getPublicUrl(`jigsaw_pool/${fileName}`)
                imageUrl = publicUrlData.publicUrl
                console.log(`Jigsaw image generated via ${model}: ${imageUrl}`)
                break // Success — stop trying other models
              }
            } else {
              console.warn(`${model} returned OK but no image data`)
            }
          } else {
            const errText = await apiRes.text()
            console.error(`${model} API Error:`, apiRes.status, errText.substring(0, 200))
            await supabase.rpc("log_jigsaw_generation_failure", { p_reason: `${model} returned HTTP ${apiRes.status}: ${errText.substring(0, 300)}` })
          }
        } catch (err: any) {
          console.error(`${model} Fetch Exception:`, err)
          await supabase.rpc("log_jigsaw_generation_failure", { p_reason: `${model} exception: ${err?.message || "Fetch exception"}` })
        }
      }
    }

    // 4. Fallback Engine: If Imagen 3 API failed or API key missing, pick from fallback hierarchy
    let isFallback = false
    if (!imageUrl) {
      isFallback = true
      console.warn("Imagen 3 generation unavailable — engaging Fallback Engine...")
      if (forceFailure) {
        await supabase.rpc("log_jigsaw_generation_failure", { p_reason: "Simulated failure via force_failure parameter" }).catch(() => {})
      }
      const { data: fallbackImage } = await supabase.rpc("get_or_create_daily_jigsaw_image", { p_date: todayStr })
      imageUrl = fallbackImage || "/images/catalog/studio_mandarins.jpg"
    } else {
      // Insert new AI generated image into jigsaw_image_pool (enforcing 1,000 cap via trigger)
      await supabase.from("jigsaw_image_pool").insert({
        image_url: imageUrl,
        crop_name: cropName,
        source: "ai_generated",
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: imageUrl,
        cropName: cropName,
        source: isFallback ? "fallback_engine" : "imagen-3",
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
