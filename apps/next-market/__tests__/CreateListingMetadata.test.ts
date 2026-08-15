import { describe, it, expect } from 'vitest'
import { generateMetadata } from '../app/(main)/create-listing/page'

describe('Create Listing Dynamic Produce Metadata', () => {
  it('generates dynamic OG title and image for lemons', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ produce: 'lemons', zip: '94025' }),
    })

    expect(metadata.title).toBe('Sell Your Backyard Lemons in 94025 | CasaGrown')
    expect(metadata.openGraph?.title).toBe('Sell Your Backyard Lemons in 94025 | CasaGrown')
    expect(metadata.openGraph?.images).toBeDefined()
    const images = metadata.openGraph?.images as any[]
    expect(images[0].url).toContain('lemon')
  })

  it('generates dynamic OG title and image for avocados', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ produce: 'avocados' }),
    })

    expect(metadata.title).toBe('Sell Your Backyard Avocados | CasaGrown')
    expect(metadata.openGraph?.title).toBe('Sell Your Backyard Avocados | CasaGrown')
    const images = metadata.openGraph?.images as any[]
    expect(images[0].url).toContain('avocado')
  })

  it('falls back to default CasaGrown OG metadata when no produce param is supplied', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    })

    expect(metadata.title).toBe('Sell Your Backyard Produce | CasaGrown')
    const images = metadata.openGraph?.images as any[]
    expect(images[0].url).toContain('og-create-listing.png')
  })
})
