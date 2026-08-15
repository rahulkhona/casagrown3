export const MAB_FORMATS: Record<string, { id: string; name: string; description: string; angle: string }> = {
  'MAB-1': {
    id: 'MAB-1',
    name: 'Tree Overload / Zero Waste',
    description: 'Focus on excess harvest going to waste and neighbors eager to buy.',
    angle: 'Urgent & Empowering Seller Motivation'
  },
  'MAB-2': {
    id: 'MAB-2',
    name: 'Supermarket Contrast',
    description: 'Contrast bland cold-storage store produce with sun-ripened local harvest.',
    angle: 'Flavor & Peak Freshness for Buyers'
  },
  'MAB-3': {
    id: 'MAB-3',
    name: 'Backyard Side-Hustle',
    description: 'Turn backyard trees into extra weekend income with zero vendor fees.',
    angle: 'Financial & Casual Seller Motivation'
  },
  'MAB-4': {
    id: 'MAB-4',
    name: 'Hyperlocal Bounty',
    description: 'Showcase produce grown two doors down in the neighborhood.',
    angle: 'Community Connection & Local Food'
  },
  'MAB-5': {
    id: 'MAB-5',
    name: 'Seasonal Harvest Basket / Combo',
    description: 'Showcase a vibrant combination of seasonal fruits, vegetables, or herbs.',
    angle: 'Abundance & Variety'
  }
}

export const GAME_AD_FORMATS: Record<string, { id: string; name: string; description: string; angle: string }> = {
  'GAME-1': {
    id: 'GAME-1',
    name: 'Morning Coffee Routine',
    description: 'A relaxing, enjoyable 2-minute morning habit before work.',
    angle: 'Habit Formation & Morning Ritual'
  },
  'GAME-2': {
    id: 'GAME-2',
    name: '60-Second Garden IQ Challenge',
    description: 'Test your produce knowledge and solve today’s mystery crop.',
    angle: 'Gamified Curiosity & Challenge'
  },
  'GAME-3': {
    id: 'GAME-3',
    name: 'Play & Win Local Garden Points',
    description: 'Solve daily puzzles to earn points redeemable for local garden perks.',
    angle: 'Reward & Community Competition'
  }
}

export type NarratorVoice = {
  id: string
  name: string
  gender: 'female' | 'male'
  tone: string
  accent: string
  avatarEmoji: string
  avatarColor: string
}

export const NARRATOR_VOICES: Record<string, NarratorVoice> = {
  maya: {
    id: 'maya',
    name: 'Maya',
    gender: 'female',
    tone: 'Warm, Friendly Neighbor',
    accent: 'California / Neutral US',
    avatarEmoji: '👩‍🌾',
    avatarColor: '#16A34A',
  },
  marcus: {
    id: 'marcus',
    name: 'Marcus',
    gender: 'male',
    tone: 'Upbeat Urban Grower',
    accent: 'Casual & Relatable US',
    avatarEmoji: '👨‍🌾',
    avatarColor: '#2563EB',
  },
  elena: {
    id: 'elena',
    name: 'Elena',
    gender: 'female',
    tone: 'Foodie & Home Cook',
    accent: 'Artisan & Warm',
    avatarEmoji: '👩‍🍳',
    avatarColor: '#D97706',
  },
  david: {
    id: 'david',
    name: 'David',
    gender: 'male',
    tone: 'Down-to-Earth Storyteller',
    accent: 'Calm & Authentic',
    avatarEmoji: '👨‍💼',
    avatarColor: '#7C3AED',
  },
  chloe: {
    id: 'chloe',
    name: 'Chloe',
    gender: 'female',
    tone: 'Playful & Game-Savvy',
    accent: 'Bright & Engaging',
    avatarEmoji: '🌱',
    avatarColor: '#EC4899',
  },
}
