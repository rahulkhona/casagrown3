'use client'

import { useState, useEffect } from 'react'

interface MatchPair {
  pairId: number
  produceLabel: string
  produceEmoji: string
  valuePropText: string
  valuePropSub: string
  type: 'produce' | 'value_prop'
}

// 6 HARVEST PRODUCE <-> NUTRITION & LOCAL STAND PRICE MATCHING PAIRS
const VALUE_PROP_PAIRS = [
  {
    pairId: 1,
    produce: { label: 'Meyer Lemon', emoji: '🍋' },
    valueProp: { text: '53mg Vitamin C', sub: 'Immune Booster' },
  },
  {
    pairId: 2,
    produce: { label: 'Hass Avocado', emoji: '🥑' },
    valueProp: { text: '10g Fiber (36% DV)', sub: 'Healthy Fats' },
  },
  {
    pairId: 3,
    produce: { label: 'Heirloom Tomato', emoji: '🍅' },
    valueProp: { text: '$3.50 / lb', sub: 'Willow Glen Stand' },
  },
  {
    pairId: 4,
    produce: { label: 'Blueberries', emoji: '🫐' },
    valueProp: { text: 'Anthocyanins', sub: 'Brain Antioxidants' },
  },
  {
    pairId: 5,
    produce: { label: 'Fresh Basil', emoji: '🌿' },
    valueProp: { text: '$2.00 / Bouquet', sub: 'Peak Freshness' },
  },
  {
    pairId: 6,
    produce: { label: 'Honeycrisp Apple', emoji: '🍎' },
    valueProp: { text: '95 Cal & Pectin', sub: 'Gut Wellness' },
  },
]

export default function GardenMemoryCanvas({ onSolve }: { onSolve: () => void }) {
  const [cards, setCards] = useState<
    Array<{
      id: number
      pairId: number
      title: string
      sub: string
      emoji: string
      flipped: boolean
      matched: boolean
    }>
  >([])

  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [solved, setSolved] = useState(false)

  // Initialize 12 cards (6 produce cards + 6 matching nutrition/price cards)
  useEffect(() => {
    const deck: any[] = []
    let cardId = 0

    VALUE_PROP_PAIRS.forEach((pair) => {
      // Card A: Produce Item
      deck.push({
        id: cardId++,
        pairId: pair.pairId,
        title: pair.produce.label,
        sub: 'Produce Crop',
        emoji: pair.produce.emoji,
        flipped: false,
        matched: false,
      })

      // Card B: Nutrition / Local Stand Price Value Prop
      deck.push({
        id: cardId++,
        pairId: pair.pairId,
        title: pair.valueProp.text,
        sub: pair.valueProp.sub,
        emoji: '🏷️',
        flipped: false,
        matched: false,
      })
    })

    // Shuffle deck
    setCards(deck.sort(() => Math.random() - 0.5))
  }, [])

  const handleCardClick = (index: number) => {
    if (solved || cards[index].flipped || cards[index].matched || selectedCards.length >= 2) return

    const updatedCards = cards.map((c, i) => (i === index ? { ...c, flipped: true } : c))
    setCards(updatedCards)

    const newSelected = [...selectedCards, index]
    setSelectedCards(newSelected)

    if (newSelected.length === 2) {
      const [firstIdx, secondIdx] = newSelected

      // Check if both cards share the exact same pairId
      if (updatedCards[firstIdx].pairId === updatedCards[secondIdx].pairId) {
        // MATCH FOUND -> CARDS STAY OPEN FACE-UP PERMANENTLY!
        setTimeout(() => {
          const matchedDeck = updatedCards.map((c, i) =>
            i === firstIdx || i === secondIdx ? { ...c, matched: true } : c
          )
          setCards(matchedDeck)
          setSelectedCards([])

          const allMatched = matchedDeck.every((c) => c.matched)
          if (allMatched) {
            setSolved(true)
            onSolve()
          }
        }, 350)
      } else {
        // NO MATCH -> FLIP BACK FACE-DOWN
        setTimeout(() => {
          setCards(
            updatedCards.map((c, i) =>
              i === firstIdx || i === secondIdx ? { ...c, flipped: false } : c
            )
          )
          setSelectedCards([])
        }, 900)
      }
    }
  }

  const handleQuickSolve = () => {
    setCards(cards.map((c) => ({ ...c, flipped: true, matched: true })))
    setSolved(true)
    onSolve()
  }

  const matchedCount = cards.filter((c) => c.matched).length / 2

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      
      {/* VALUE PROP MATCHING INSTRUCTIONS */}
      <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 12, padding: 14, marginBottom: 16, textAlign: 'left' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#1e40af' }}>
          🥗 Match Produce with Real Nutrition & Local Stand Prices!
        </h3>
        <div style={{ fontSize: 13, color: '#1e3a8a', lineHeight: 1.5 }}>
          <div>• Flip cards to match each <strong>Harvest Crop</strong> with its <strong>USDA Nutrition or Local Stand Price</strong>!</div>
          <div>• Example: Match <strong>🥑 Hass Avocado</strong> with <strong>10g Fiber (36% DV)</strong>!</div>
        </div>
      </div>

      {/* MATCHED PROGRESS COUNTER */}
      <div style={{ background: '#ecfdf5', border: '1.5px solid #10b981', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 'bold', color: '#047857' }}>
          🎯 Pairs Matched: <span style={{ fontSize: 18, color: '#065f46' }}>{matchedCount} / 6 Pairs</span>
        </div>
        <div style={{ fontSize: 12, color: '#064e3b', fontWeight: 'bold' }}>
          {matchedCount === 6 ? '🎉 All Produce & Value Props Matched!' : 'Matched pairs stay open!'}
        </div>
      </div>

      {/* 4x3 MEMORY CARDS GRID */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 20,
        }}
      >
        {cards.map((card, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleCardClick(idx)}
            style={{
              minHeight: 96,
              borderRadius: 10,
              border: card.matched ? '2.5px solid #10b981' : card.flipped ? '2.5px solid #3b82f6' : '2px solid #059669',
              background: card.matched ? '#ecfdf5' : card.flipped ? '#eff6ff' : '#059669',
              color: card.flipped || card.matched ? '#111827' : '#ffffff',
              padding: 8,
              cursor: card.matched ? 'default' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: card.matched ? 'none' : '0 3px 8px rgba(0,0,0,0.12)',
              transition: 'all 0.2s ease',
            }}
          >
            {card.flipped || card.matched ? (
              <>
                <div style={{ fontSize: 24, marginBottom: 2 }}>{card.emoji}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{card.title}</div>
                <div style={{ fontSize: 10, color: '#059669', fontWeight: 700, marginTop: 2 }}>{card.sub}</div>
              </>
            ) : (
              <span style={{ fontSize: 28 }}>🌱</span>
            )}
          </button>
        ))}
      </div>

    </div>
  )
}
