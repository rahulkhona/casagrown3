import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function getSystemPrompt(validCategories: string[]) {
  return `You are a biological categorization expert for an agricultural marketplace.
Given a quarantine pest name and contextual notes, determine exactly which products must be quarantined natively.
Your valid top-level "sales_categories" MUST be chosen ONLY from this explicit list: ${JSON.stringify(validCategories)}.
Use 'produce' if it targets fruit/vegetables.

Your "produce_categories" should be the broad botanical family/host (e.g. ['citrus', 'grapes', 'trees', 'plants']). If it applies globally without subcategories (like soil), return an empty array [].
Your "keywords" must be an array of 5-15 common, specific names of the host product (e.g. ['oranges', 'lemons', 'grapefruit', 'limes', 'citrus']) so a dumb UI regex keyword filter can instantly block them.

Return purely a JSON response matching exactly this signature: { "sales_categories": string[], "produce_categories": string[], "keywords": string[] }`;
}

export async function askGeminiCategory(pestName: string, notes: string, validSalesCategories: string[]) {
  if (!ai || !process.env.GEMINI_API_KEY) return null; // skip if no key

  try {
    const response = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: `Pest Name: ${pestName}\nContext Notes: ${notes}`,
      config: {
        systemInstruction: getSystemPrompt(validSalesCategories),
        responseMimeType: 'application/json',
        temperature: 0,
      }
    });

    const text = response.text;
    const data = JSON.parse(text || '{}');
    if (data.sales_categories && Array.isArray(data.sales_categories)) {
      return { 
        sales_categories: data.sales_categories.map((s: string) => s.toLowerCase()), 
        produce_categories: (data.produce_categories || []).map((s: string) => s.toLowerCase()),
        keywords: (data.keywords || []).map((s: string) => s.toLowerCase())
      };
    }
    return null;
  } catch (e) {
    console.error('Gemini LLM error:', e);
    return null;
  }
}
