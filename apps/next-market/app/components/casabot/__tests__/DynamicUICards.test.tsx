/**
 * Vitest component tests for DynamicUICards.
 *
 * Tests verify rendering of all card types and ActionChips.
 *
 * Run: cd apps/next-market && npx vitest run app/components/casabot/__tests__/DynamicUICards.test.tsx
 */
import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import {
  ActionChips,
  SellerWizardCard,
  DiagnosisCard,
  PlantGuideCard,
  RecipeCard,
  ShoppingResultsCard,
  MarketRedirectCard,
  CommunityRedirectCard,
  ExternalSearchCard,
  PlantIdentificationCard,
  GrowSuggestionCard,
  DynamicToolCard,
} from '../DynamicUICards'

// Mock SocialShareModal
vi.mock('../../../components/SocialShareModal', () => ({
  default: ({ isOpen }: any) => isOpen ? <div data-testid="share-modal">Share Modal</div> : null,
}))

// ══════════════════════════════════════════════════════════════
// ActionChips
// ══════════════════════════════════════════════════════════════
describe('ActionChips', () => {
  test('renders chips from array and fires onActionClick', () => {
    const onClick = vi.fn()
    render(<ActionChips actions={['Tip A', 'Tip B']} onActionClick={onClick} />)
    
    expect(screen.getByText('Tip A')).toBeDefined()
    expect(screen.getByText('Tip B')).toBeDefined()
    
    fireEvent.click(screen.getByText('Tip A'))
    expect(onClick).toHaveBeenCalledWith('Tip A')
  })

  test('returns null for empty/undefined actions', () => {
    const { container: c1 } = render(<ActionChips actions={[]} />)
    expect(c1.innerHTML).toBe('')

    const { container: c2 } = render(<ActionChips actions={undefined} />)
    expect(c2.innerHTML).toBe('')
  })
})


// ══════════════════════════════════════════════════════════════
// SellerWizardCard
// ══════════════════════════════════════════════════════════════
describe('SellerWizardCard', () => {
  test('renders link with title in URL params', () => {
    render(<SellerWizardCard data={{ title: 'Fresh Oranges' }} />)
    
    const link = screen.getByText(/Create Listing/)
    expect(link).toBeDefined()
    expect(link.closest('a')?.getAttribute('href')).toContain('title=Fresh+Oranges')
    expect(link.textContent).toContain('Fresh Oranges')
  })

  test('renders generic link without title', () => {
    render(<SellerWizardCard data={{}} />)
    
    const link = screen.getByText(/Create Listing/)
    expect(link).toBeDefined()
    expect(link.closest('a')?.getAttribute('href')).toContain('/my-booth/products/new')
  })
})


// ══════════════════════════════════════════════════════════════
// DiagnosisCard
// ══════════════════════════════════════════════════════════════
describe('DiagnosisCard', () => {
  test('renders diagnosis, urgency, remedy plan, share button', () => {
    render(<DiagnosisCard data={{
      diagnosis: 'Powdery Mildew',
      urgency: 'High',
      remedy_plan: 'Spray neem oil weekly',
      suggested_next_actions: ['Buy neem oil'],
    }} />)
    
    expect(screen.getByText('Powdery Mildew')).toBeDefined()
    expect(screen.getByText('High')).toBeDefined()
    expect(screen.getByText('Spray neem oil weekly')).toBeDefined()
    expect(screen.getByText(/Share/)).toBeDefined()
    expect(screen.getByText('Buy neem oil')).toBeDefined()
  })
})


// ══════════════════════════════════════════════════════════════
// PlantGuideCard
// ══════════════════════════════════════════════════════════════
describe('PlantGuideCard', () => {
  test('renders plant name, care instructions, companion toggle', () => {
    render(<PlantGuideCard data={{
      plant_name: 'Basil',
      care_instructions: 'Full sun, moist soil.',
      companion_plants: ['Tomato', 'Pepper'],
    }} />)
    
    expect(screen.getByText('Basil')).toBeDefined()
    expect(screen.getByText('Full sun, moist soil.')).toBeDefined()
    expect(screen.getByText(/Companion Plants/)).toBeDefined()
  })
})


// ══════════════════════════════════════════════════════════════
// RecipeCard
// ══════════════════════════════════════════════════════════════
describe('RecipeCard', () => {
  test('renders dish name, ingredients list, instructions, share button', () => {
    render(<RecipeCard data={{
      dish_name: 'Tomato Soup',
      ingredients: ['Tomatoes', 'Basil', 'Garlic'],
      instructions: 'Blend and simmer for 20 minutes.',
      prep_time: '30 min',
      serving_size: '4 servings',
    }} />)
    
    expect(screen.getByText('Tomato Soup')).toBeDefined()
    expect(screen.getByText('• Tomatoes')).toBeDefined()
    expect(screen.getByText('• Basil')).toBeDefined()
    expect(screen.getByText('• Garlic')).toBeDefined()
    expect(screen.getByText('Blend and simmer for 20 minutes.')).toBeDefined()
    expect(screen.getByText('30 min · 4 servings')).toBeDefined()
    expect(screen.getByText(/Share/)).toBeDefined()
  })
})


// ══════════════════════════════════════════════════════════════
// ShoppingResultsCard
// ══════════════════════════════════════════════════════════════
describe('ShoppingResultsCard', () => {
  test('renders grouped results with expand/collapse', () => {
    render(<ShoppingResultsCard data={{
      result_count: 2,
      search_intent: 'tomatoes',
      backend_results: {
        'CasaGrown Marketplace (2)': [
          { name: 'Cherry Tomatoes', seller: 'Joe', price: '$5', source: 'casagrown' },
          { name: 'Heirloom Tomatoes', seller: 'Jane', price: '$8', source: 'casagrown' },
        ],
      },
    }} />)
    
    expect(screen.getByText('Shopping Results')).toBeDefined()
    expect(screen.getByText('2 found')).toBeDefined()
    // First group is expanded by default
    expect(screen.getByText('Cherry Tomatoes')).toBeDefined()
  })

  test('shows empty message with 0 results', () => {
    render(<ShoppingResultsCard data={{
      result_count: 0,
      backend_results: null,
    }} />)
    
    expect(screen.getByText(/No results found/)).toBeDefined()
  })
})


// ══════════════════════════════════════════════════════════════
// MarketRedirectCard
// ══════════════════════════════════════════════════════════════
describe('MarketRedirectCard', () => {
  test('renders browse link with search query', () => {
    render(<MarketRedirectCard data={{
      search_query: 'organic herbs',
      message: 'Check the marketplace!',
    }} />)
    
    expect(screen.getByText('Check the marketplace!')).toBeDefined()
    expect(screen.getByText(/organic herbs/)).toBeDefined()
    
    const link = screen.getByText('Browse CasaGrown Market')
    expect(link.closest('a')?.getAttribute('href')).toContain('q=organic')
  })
})


// ══════════════════════════════════════════════════════════════
// CommunityRedirectCard
// ══════════════════════════════════════════════════════════════
describe('CommunityRedirectCard', () => {
  test('renders community link with copy button', () => {
    render(<CommunityRedirectCard data={{
      message: 'Ask the community!',
      suggested_post: 'Anyone growing lavender?',
    }} />)
    
    expect(screen.getByText('Ask the community!')).toBeDefined()
    expect(screen.getByText(/"Anyone growing lavender\?"/)).toBeDefined()
    expect(screen.getByText(/Copy post/)).toBeDefined()
    
    const link = screen.getByText('Go to Community Board')
    expect(link.closest('a')?.getAttribute('href')).toBe('/community')
  })
})


// ══════════════════════════════════════════════════════════════
// ExternalSearchCard
// ══════════════════════════════════════════════════════════════
describe('ExternalSearchCard', () => {
  test('renders Google + DuckDuckGo links with query', () => {
    render(<ExternalSearchCard data={{
      search_query: 'companion planting chart',
      message: 'Try searching online:',
    }} />)
    
    expect(screen.getByText('Try searching online:')).toBeDefined()
    
    const googleLink = screen.getByText('Google')
    expect(googleLink.closest('a')?.getAttribute('href')).toContain('google.com/search?q=companion')
    
    const ddgLink = screen.getByText('DuckDuckGo')
    expect(ddgLink.closest('a')?.getAttribute('href')).toContain('duckduckgo.com/?q=companion')
  })
})


// ══════════════════════════════════════════════════════════════
// PlantIdentificationCard
// ══════════════════════════════════════════════════════════════
describe('PlantIdentificationCard', () => {
  test('renders common name, scientific name, edibility', () => {
    render(<PlantIdentificationCard data={{
      common_name: 'Rosemary',
      scientific_name: 'Salvia rosmarinus',
      description: 'Aromatic herb',
      edibility: 'Edible',
      care_instructions: 'Full sun, dry soil',
    }} />)
    
    expect(screen.getByText('Rosemary')).toBeDefined()
    expect(screen.getByText('Salvia rosmarinus')).toBeDefined()
    expect(screen.getByText('Aromatic herb')).toBeDefined()
    expect(screen.getByText('Edible')).toBeDefined()
    expect(screen.getByText('Full sun, dry soil')).toBeDefined()
  })
})


// ══════════════════════════════════════════════════════════════
// GrowSuggestionCard
// ══════════════════════════════════════════════════════════════
describe('GrowSuggestionCard', () => {
  test('renders suggestion list with season badge', () => {
    render(<GrowSuggestionCard data={{
      suggestions: ['Kale', 'Swiss Chard', 'Broccoli'],
      season: 'Fall',
    }} />)
    
    expect(screen.getByText('What to Grow')).toBeDefined()
    expect(screen.getByText('Fall')).toBeDefined()
    expect(screen.getByText('Kale')).toBeDefined()
    expect(screen.getByText('Swiss Chard')).toBeDefined()
    expect(screen.getByText('Broccoli')).toBeDefined()
  })

  test('handles string suggestions (comma-separated)', () => {
    render(<GrowSuggestionCard data={{
      suggestions: 'Mint, Thyme, Oregano',
    }} />)
    
    expect(screen.getByText('Mint')).toBeDefined()
    expect(screen.getByText('Thyme')).toBeDefined()
    expect(screen.getByText('Oregano')).toBeDefined()
  })
})


// ══════════════════════════════════════════════════════════════
// DynamicToolCard (generic fallback)
// ══════════════════════════════════════════════════════════════
describe('DynamicToolCard', () => {
  test('renders key-value pairs from action data', () => {
    render(<DynamicToolCard action={{
      type: 'WeatherForecast',
      data: {
        location: 'San Jose, CA',
        temperature: '72°F',
        suggested_next_actions: ['Check soil moisture'],
      },
    }} />)
    
    expect(screen.getByText('Weather Forecast')).toBeDefined()
    expect(screen.getByText('San Jose, CA')).toBeDefined()
    expect(screen.getByText('72°F')).toBeDefined()
    // suggested_next_actions is hidden from key-value but rendered as chips
    expect(screen.getByText('Check soil moisture')).toBeDefined()
  })
})
