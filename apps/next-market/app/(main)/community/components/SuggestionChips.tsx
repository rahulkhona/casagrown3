'use client'
import { useState, useEffect } from 'react'
import styles from '../page.module.css'

interface SuggestionChipsProps {
  onSelect: (text: string) => void
  /** Prefill compose box instead of sending — used for @GrowBot chip */
  onPrefill: (text: string) => void
  /** Number of user-authored (non-system) messages in chat */
  userMessageCount: number
  /** Open the sell / add-product flow */
  onSellClick?: () => void
  /** Open the find / search panel */
  onFindClick?: () => void
  /** Open the notify-me / grower management panel */
  onNotifyClick?: () => void
}

// ──────────────────────────────────────────────────────────────────
// 100+ conversation starters organized by category
// ──────────────────────────────────────────────────────────────────
const SUGGESTION_POOL: string[] = [
  // ── Gardening Advice ──
  "Any tips for keeping herbs alive indoors?",
  "Best time to plant tomatoes this season?",
  "How do you deal with aphids organically?",
  "What grows well in partial shade?",
  "Advice on starting a compost bin?",
  "How often should I water raised beds?",
  "Best soil mix for container gardening?",
  "Tips for growing avocados from seed?",
  "How do you protect plants from frost?",
  "What's the best natural fertilizer?",
  "Should I mulch around fruit trees?",
  "How to tell when melons are ripe?",
  "Drip irrigation vs. sprinklers — thoughts?",
  "Best companion plants for tomatoes?",

  // ── Seeking Services ──
  "Anyone know a good tree trimmer nearby?",
  "Looking for gardening help this weekend",
  "Can anyone recommend a local landscaper?",
  "Need help building a raised bed — any handy neighbors?",
  "Looking for someone to install a drip system",
  "Anyone know a good arborist in the area?",
  "Need recommendations for organic pest control service",
  "Who does good fence work around here?",
  "Looking for a reliable handyman for yard work",
  "Any good nurseries nearby with native plants?",

  // ── Offering Services ──
  "Happy to help with garden setup! 🌱",
  "Offering plant-sitting while you travel ✈️",
  "I can help with composting questions!",
  "Have a truck — happy to help with soil delivery",
  "Free garden consultations for new growers 🌻",
  "I build raised beds — DM me if interested",
  "Will trade gardening labor for fresh produce!",
  "Offering free seedlings — first come first served 🌿",
  "I have extra pots and planters, free to a good home",

  // ── Plant Talk ──
  "My basil is flowering — should I prune it?",
  "Check out how tall my sunflowers got! 🌻",
  "First harvest of the season! 🎉",
  "Anyone else growing jalapeños this year? 🌶️",
  "What's everyone planting this month?",
  "My lemon tree is loaded this year! 🍋",
  "Has anyone grown dragon fruit before?",
  "Struggling with my cucumber plants — any ideas?",
  "Look at these gorgeous roses! 🌹",
  "My fig tree is finally producing 🎉",
  "Anyone tried growing mushrooms at home?",
  "Best peppers for salsa?",
  "How's everyone's herb garden doing?",
  "My strawberries are coming in beautifully! 🍓",

  // ── Recipes & Cooking ──
  "Made an amazing pesto with fresh basil 🌿",
  "Best way to use up extra zucchini? 🥒",
  "Tried a new tomato sauce recipe — so good!",
  "Anyone have a good salsa verde recipe?",
  "What do you do with lots of mint? 🍃",
  "Best recipe for fresh-picked peaches? 🍑",
  "Homemade pickles from garden cucumbers!",
  "Anyone make jam with backyard berries?",
  "Fresh herb butter — game changer! 🧈",
  "What's your go-to smoothie with garden greens?",
  "Tried lacto-fermenting veggies — so easy!",
  "Best way to dry herbs for the pantry?",
  "Anyone freeze their harvest for winter?",
  "My grandma's tomato soup recipe — want it? 🍅",

  // ── Community & Social ──
  "Good morning neighbors! ☀️",
  "How's everyone's weekend going?",
  "New to the neighborhood — hi everyone! 👋",
  "Beautiful day for gardening today!",
  "Who else loves the smell of fresh basil? 🤤",
  "Happy to be part of this community!",
  "Anyone up for a neighborhood garden tour?",
  "What got you into gardening?",
  "Shoutout to everyone sharing their harvest! ❤️",
  "Weekend project ideas for the yard?",

  // ── Sustainability & Tips ──
  "How do you reduce water usage in the garden? 💧",
  "Best way to start collecting rainwater?",
  "Anyone use worm composting?",
  "Tips for going fully organic in your garden",
  "How to attract more pollinators? 🐝",
  "Best native plants for our climate?",
  "Reducing food waste with home growing 🌍",
  "Solar-powered garden lights — recommendations?",
  "How to make your own seed starter mix",
  "Cover crops for winter — worth it?",

  // ── Seasonal ──
  "What are you planning for the spring garden?",
  "Fall cleanup tips for the yard? 🍂",
  "Best winter crops to grow here?",
  "Summer heat — how do you keep plants alive? ☀️",
  "Holiday gift ideas from the garden 🎁",
  "New Year garden resolutions? 🌱",
  "Spring is here! What are you most excited to plant?",
  "End of season — what worked and what didn't?",
  "Getting the garden ready for the rainy season 🌧️",
  "Favorite warm-weather herbs to grow?",

  // ── Fun & Curiosity ──
  "What's the weirdest thing you've grown?",
  "Biggest gardening fail? Mine was epic 😂",
  "Most rewarding thing about growing your own food?",
  "If you could only grow 3 things, what would they be?",
  "What's your oldest plant?",
  "Garden hack that changed your life?",
  "Best gardening YouTube channel?",
  "Do you talk to your plants? Be honest 😄",
  "Favorite garden tool you can't live without?",
  "What's blooming in your yard right now? 🌸",
]

function getRandomChips(count: number = 3): string[] {
  const shuffled = [...SUGGESTION_POOL].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

export default function SuggestionChips({ onSelect, onPrefill, userMessageCount, onSellClick, onFindClick, onNotifyClick }: SuggestionChipsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    setSuggestions(getRandomChips(3))
  }, [])

  // Show random chips when user hasn't sent many messages
  // but always show the GrowBot chip + action chips
  return (
    <div className={styles.suggestionsWrapper}>
      {/* Row 1: Conversation starters */}
      <div className={styles.starterChipsRow}>
        {suggestions.map((text, i) => (
          <button 
            key={i} 
            className={styles.suggestionChip}
            onClick={() => onSelect(text)}
          >
            {text}
          </button>
        ))}
      </div>

      {/* Row 2: Action chips (closer to compose box) */}
      <div className={styles.actionChipsRow}>
        <button
          className={`${styles.suggestionChip} ${styles.growbotChip}`}
          onClick={() => onPrefill('@GrowBot ')}
          title="Ask GrowBot for gardening advice"
        >
          <img src="/growbot-avatar-v3.png" alt="" style={{ width: 14, height: 14, marginRight: 4, borderRadius: '50%' }} /> Ask GrowBot
        </button>

        {onSellClick && (
          <button
            className={`${styles.suggestionChip} ${styles.sellChip}`}
            onClick={onSellClick}
            title="List a product for sale"
          >
            🏷️ Sell
          </button>
        )}

        {onFindClick && (
          <button
            className={`${styles.suggestionChip} ${styles.findChip}`}
            onClick={onFindClick}
            title="Find produce near you"
          >
            🔍 Want
          </button>
        )}

        {onNotifyClick && (
          <button
            className={`${styles.suggestionChip} ${styles.notifyChip}`}
            onClick={onNotifyClick}
            title="Tell us what you grow & get notified when neighbors search"
          >
            🔔 Notify Me
          </button>
        )}
      </div>
    </div>
  )
}
