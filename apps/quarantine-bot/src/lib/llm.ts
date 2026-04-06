import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const SYSTEM_PROMPT = `You are a biological categorization expert for an agricultural marketplace.
Given a quarantine pest name and contextual notes, determine exactly which products must be quarantined natively.
Your valid top-level "category" MUST be exactly one of: ['produce', 'flowers', 'flower_arrangements', 'garden_equipment', 'pots', 'soil', 'seeds', 'eggs', 'honey']. Use 'produce' if it targets fruit/vegetables.
Your "produce_category" should be the broad botanical family/host (e.g. 'citrus', 'grapes', 'trees', 'plants', 'produce').

Return purely a JSON response matching exactly this signature: { "category": string, "produce_category": string }`;

export async function askGeminiCategory(pestName: string, notes: string) {
  if (!process.env.GEMINI_API_KEY) return null; // skip if no key

  try {
    const response = await ai.models.generateContent({
      model: 'gemma-4',
      contents: `Pest Name: ${pestName}\nContext Notes: ${notes}`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        temperature: 0,
      }
    });

    const text = response.text;
    const data = JSON.parse(text || '{}');
    if (data.category && data.produce_category) {
      return { category: data.category.toLowerCase(), produce_category: data.produce_category.toLowerCase() };
    }
    return null;
  } catch (e) {
    console.error('Gemini LLM error:', e);
    return null;
  }
}
