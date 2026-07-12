import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { data } = await req.json()
    
    // Get key from environment
    const apiKey = process.env.GEMINI_API_KEY || "AIzaSyDMvneeL43ULKSTZ3eQ0RBorBYhvBbHgnc"
    const model = "gemini-2.5-flash"
    
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const prompt = `You are a professional conversion rate optimization (CRO) analyst for CasaGrown.
Analyze the following JSON traffic and listing funnel conversion data.
Write a clear, structured executive summary for the team. Include:
1. A brief overview of wizard starts vs. completions.
2. An analysis of where the biggest drop-offs happen (Step 1 email gate vs Step 2+ details form).
3. Day of week and timezone findings.
4. 2-3 specific, actionable recommendations to improve conversion.

IMPORTANT RULES FOR FORMATTING:
- Use today's date: ${currentDate}.
- Do NOT include any mock email/memo headers (e.g., do NOT output 'To:', 'From:', 'Date:', 'Subject:' headers).
- Start directly with the report content or title.
- Keep the summary professional, concise, and formatted in clean markdown.

DATA:
${JSON.stringify(data, null, 2)}
`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.3,
          },
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      return NextResponse.json({ error: `Gemini API error: ${response.status} - ${errText}` }, { status: 500 })
    }

    const resJson = await response.json()
    const text = resJson?.candidates?.[0]?.content?.parts?.[0]?.text || "No summary generated."
    
    return NextResponse.json({ summary: text })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 })
  }
}
