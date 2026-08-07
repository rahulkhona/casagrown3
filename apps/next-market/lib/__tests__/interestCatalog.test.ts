import { describe, it, expect } from 'vitest'
import { EXHAUSTIVE_INTERESTS_CATALOG, getInterestImage } from '../interestCatalog'
import * as fs from 'fs'
import * as path from 'path'

describe('Interests Catalog Image Integrity', () => {
  const publicDir = path.resolve(__dirname, '../../public')

  it('has zero empty or missing image URLs across all items', () => {
    for (const item of EXHAUSTIVE_INTERESTS_CATALOG) {
      expect(item.image).toBeDefined()
      expect(item.image.length).toBeGreaterThan(0)
    }
  })

  it('resolves valid image paths for all catalog produce items', () => {
    for (const item of EXHAUSTIVE_INTERESTS_CATALOG) {
      const resolved = getInterestImage(item.name)
      expect(resolved).toBeDefined()
      expect(resolved.length).toBeGreaterThan(0)

      if (resolved.startsWith('/products/') || resolved.startsWith('/images/')) {
        const localPath = path.join(publicDir, resolved)
        expect(fs.existsSync(localPath)).toBe(true)
      }
    }
  })

  it('prevents accidental duplicate Unsplash photo IDs across distinct produce items', () => {
    const unsplashMap = new Map<string, string>()

    for (const item of EXHAUSTIVE_INTERESTS_CATALOG) {
      if (item.image.includes('images.unsplash.com')) {
        const match = item.image.match(/photo-([a-f0-9-]+)/i)
        if (match && match[1]) {
          const photoId = match[1]
          const existingItem = unsplashMap.get(photoId)
          if (existingItem) {
            const isAllowedShare =
              (existingItem.includes('Tomato') && item.name.includes('Tomato')) ||
              (existingItem.includes('Pepper') && item.name.includes('Pepper'))

            expect(
              isAllowedShare,
              `Unsplash Photo ID "${photoId}" is reused between "${existingItem}" and "${item.name}"!`
            ).toBe(true)
          }
          unsplashMap.set(photoId, item.name)
        }
      }
    }
  })
})
