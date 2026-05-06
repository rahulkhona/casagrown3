import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { name, description, category } = await req.json()

    if (!name) {
      return new Response(JSON.stringify({ error: 'Missing product name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const systemPrompt = `You are CasaBot, a copywriter for CasaGrown, a neighborhood market where people sell homegrown produce.
A seller is listing: "${name}".
Their current description: "${description || 'None'}"
Category: "${category || 'Produce'}"

Your job: write 3 SHORT description extensions the seller can append to their product listing. These must read like a natural continuation of their description — painting a picture of how a buyer might enjoy this product at home.

RULES:
- Write as if you ARE the seller talking to a neighbor buyer. Use "you" to address the buyer.
- Each suggestion must be 1-2 sentences max (20-30 words).
- Make it warm, personal, and mouth-watering. This is a product listing, NOT a recipe blog.
- Do NOT write step-by-step cooking instructions. Write enticingly ("Perfect for..." "Try them in..." "These go amazing with...").
- Do NOT use Markdown. Plain text only.
- Do NOT start with emojis.

Also write a 1-sentence "intro" that bridges the seller's existing description to the suggestion. This should feel like a natural transition (e.g. "Here's what your neighbors have been making:" or "Grab a dozen and try this at home:").

Output ONLY a valid JSON object: {"intro": "...", "recipes": ["...", "...", "..."]}
Nothing else.`

    const supaUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const isLocal = supaUrl.includes('localhost') || supaUrl.includes('127.0.0.1') || supaUrl.includes('kong:')

    if (isLocal) {
      console.log('[LOCAL] Skipping Gemini — returning canned recipe suggestions')
      const cat = (category || '').toLowerCase()
      let fakeArr: string[]
      let intro: string
      if (cat === 'eggs') {
        intro = `Grab a dozen and try this at home:`
        fakeArr = [
          `Perfect scrambled low and slow with fresh garden herbs — your weekend brunch will never be the same.`,
          `Try them in a simple frittata with whatever veggies you have on hand. Feeds the whole family and takes 15 minutes!`,
          `These make the best egg salad — just add a little Dijon, fresh chives, and a squeeze of lemon. Amazing on toast.`,
        ]
      } else if (cat === 'honey') {
        intro = `Here's what your neighbors have been making:`
        fakeArr = [
          `Drizzle over a warm cheese board with sharp cheddar — instant crowd-pleaser at any gathering.`,
          `Stir a spoonful into your morning tea with lemon. Way better than anything from the store.`,
          `Whisk with olive oil and apple cider vinegar for a honey vinaigrette that makes any salad incredible.`,
        ]
      } else if (cat === 'flowers' || cat === 'flower_arrangements') {
        intro = `A few ideas to make these last:`
        fakeArr = [
          `Trim stems at an angle and change the water every 2 days — they'll stay gorgeous for over a week.`,
          `These make stunning centerpieces. Pair with a Mason jar and twine for that effortless farmhouse look.`,
          `Scatter a few petals in a warm bath for a spa-worthy evening at home. You deserve it.`,
        ]
      } else {
        intro = `Here's a favorite way to enjoy these:`
        fakeArr = [
          `Slice thin, toss with good olive oil and flaky salt, and let the freshness speak for itself.`,
          `Sauté with garlic and butter until golden — the aroma alone will have your family running to the kitchen.`,
          `Got extras? Quick-pickle them with vinegar, sugar, and salt. They'll keep for weeks and taste amazing on everything.`,
        ]
      }
      return new Response(JSON.stringify({ success: true, intro, recipes: fakeArr }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const models = [
      { name: 'gemma-4-27b-it', version: 'v1beta' },
      { name: 'gemini-2.5-flash', version: 'v1beta' },
      { name: 'gemini-2.5-flash-lite', version: 'v1beta' },
    ]
    let geminiData: any = null

    for (const model of models) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/${model.version}/models/${model.name}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
            generationConfig: {
              maxOutputTokens: 800,
              temperature: 0.7,
            },
          }),
        }
      )

      if (geminiRes.ok) {
        geminiData = await geminiRes.json()
        console.log(`[CasaBot Recipe] ${model.name} succeeded`)
        break
      } else {
        console.warn(`[CasaBot Recipe] ${model.name} failed (${geminiRes.status}), trying next...`)
        await new Promise(r => setTimeout(r, 500))
      }
    }

    if (!geminiData) {
      console.error('All Gemini models failed')
      return new Response(JSON.stringify({ error: 'AI generation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const parts = geminiData?.candidates?.[0]?.content?.parts || []
    const reply = parts.filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join('') || 
                  parts.map((p: any) => p.text || '').join('')

    let recipesArray: string[] = []
    let intro = ''
    try {
      const start = reply.indexOf('{')
      const end = reply.lastIndexOf('}')
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(reply.substring(start, end + 1))
        recipesArray = parsed.recipes || []
        intro = parsed.intro || ''
      } else {
        // Fallback: try parsing as array
        const arrStart = reply.indexOf('[')
        const arrEnd = reply.lastIndexOf(']')
        if (arrStart >= 0 && arrEnd > arrStart) {
          recipesArray = JSON.parse(reply.substring(arrStart, arrEnd + 1))
        }
      }
    } catch(e) {
      console.error('Error parsing recipes:', e)
    }

    return new Response(JSON.stringify({ success: true, intro, recipes: recipesArray }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('CasaBot Recipe error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
