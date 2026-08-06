import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { EXHAUSTIVE_US_PRODUCE, getProduceImage } from '../produceCatalog'

describe('Produce Catalog Image Integrity', () => {
  const publicDir = path.resolve(__dirname, '../../public')

  it('ensures every produce item in EXHAUSTIVE_US_PRODUCE has a valid image path or URL', () => {
    EXHAUSTIVE_US_PRODUCE.forEach((item) => {
      expect(item.image, `Item "${item.name}" (${item.id}) must have a defined image`).toBeTruthy()

      if (item.image.startsWith('/')) {
        const localPath = path.join(publicDir, item.image)
        expect(
          fs.existsSync(localPath),
          `Local image file for "${item.name}" does not exist at ${localPath}`
        ).toBe(true)
      } else {
        expect(
          item.image.startsWith('http://') || item.image.startsWith('https://'),
          `Image for "${item.name}" must be a local relative path or HTTP/HTTPS URL`
        ).toBe(true)
      }
    })
  })

  it('prevents accidental duplicate Unsplash photo IDs across distinct produce items', () => {
    const unsplashMap = new Map<string, string>()

    EXHAUSTIVE_US_PRODUCE.forEach((item) => {
      if (item.image.includes('images.unsplash.com')) {
        const photoIdMatch = item.image.match(/photo-([a-zA-Z0-9-]+)/)
        if (photoIdMatch && photoIdMatch[1]) {
          const photoId = photoIdMatch[1]
          const existingItem = unsplashMap.get(photoId)
          if (existingItem && existingItem !== item.name) {
            // Exceptions only allowed if intentionally sharing exact same variant (e.g. tangerines & mandarins)
            const isAllowedShare =
              (existingItem.includes('Tangerine') && item.name.includes('Mandarin')) ||
              (existingItem.includes('Honey') && item.name.includes('Honeycomb')) ||
              (existingItem.includes('Hot Pepper') && item.name.includes('Chili')) ||
              (existingItem.includes('Squash') && item.name.includes('Pumpkin')) ||
              (existingItem.includes('Seeds') && item.name.includes('Seeds'))
            
            expect(
              isAllowedShare,
              `Unsplash Photo ID "${photoId}" is reused between "${existingItem}" and "${item.name}"!`
            ).toBe(true)
          }
          unsplashMap.set(photoId, item.name)
        }
      }
    })
  })

  it('ensures getProduceImage fallback function returns valid images', () => {
    const sampleNames = ['Lemons', 'Zucchini', 'Heirloom Tomatoes', 'Nonexistent Crop XYZ']
    sampleNames.forEach((name) => {
      const img = getProduceImage(name)
      expect(img).toBeTruthy()
      if (img.startsWith('/')) {
        const localPath = path.join(publicDir, img)
        expect(
          fs.existsSync(localPath),
          `getProduceImage("${name}") returned missing file ${localPath}`
        ).toBe(true)
      }
    })
  })
})
