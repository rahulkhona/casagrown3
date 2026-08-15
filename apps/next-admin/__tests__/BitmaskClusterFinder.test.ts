import { describe, it, expect } from 'vitest'

export interface MultiProduceCluster {
  id: string
  produces: { name: string; displayCategory: string; image: string }[]
  produceNames: string[]
  zips: string[]
  zipCount: number
  totalBuyers: number
  adHook: string
}

export interface RemainderProduceItem {
  id: string
  name: string
  displayCategory: string
  image: string
  zips: string[]
  zipCount: number
  totalBuyers: number
  adHook: string
}

// O(N^2) Greedy Cluster Packing Algorithm using Bitmask Vectors
export function findProduceClustersBitmask({
  buyerDemands,
  minProduceInput,
  minZipInput,
}: {
  buyerDemands: {
    id?: string
    name: string
    displayCategory: string
    image: string
    zipDetails: { zip: string; buyers: number }[]
  }[]
  minProduceInput: number
  minZipInput: number
}): {
  uniqueClusters: MultiProduceCluster[]
  remainderProduces: RemainderProduceItem[]
} {
  const minP = Math.max(1, Number(minProduceInput) || 1)
  const minZ = Math.max(1, Number(minZipInput) || 1)
  const maxBundleSize = Math.min(8, Math.max(minP, minP + 4)) // up to 6-8 crops per bundle

  // 1. Index all unique ZIPs
  const allZipsSet = new Set<string>()
  for (const b of buyerDemands) {
    for (const zd of b.zipDetails) {
      if (zd.zip) allZipsSet.add(zd.zip)
    }
  }
  const allZips = Array.from(allZipsSet).sort()
  const zipToIndex = new Map<string, number>()
  allZips.forEach((z, i) => zipToIndex.set(z, i))

  function popcount(mask: bigint): number {
    let count = 0
    let m = mask
    while (m > 0n) {
      m &= m - 1n
      count++
    }
    return count
  }

  function maskToZips(mask: bigint): string[] {
    const result: string[] = []
    let m = mask
    let bit = 0
    while (m > 0n) {
      if ((m & 1n) === 1n) {
        result.push(allZips[bit])
      }
      m >>= 1n
      bit++
    }
    return result.sort()
  }

  // 2. Build Produce Bitmask Vectors
  interface ProduceVec {
    id: string
    name: string
    displayCategory: string
    image: string
    zipMask: bigint
    zipBuyers: Map<string, number>
    zipCount: number
    totalBuyers: number
  }

  const vectors: ProduceVec[] = []
  for (const b of buyerDemands) {
    let mask = 0n
    const zbMap = new Map<string, number>()
    let totalB = 0
    for (const zd of b.zipDetails) {
      const idx = zipToIndex.get(zd.zip)
      if (idx !== undefined) {
        mask |= 1n << BigInt(idx)
        zbMap.set(zd.zip, zd.buyers)
        totalB += zd.buyers
      }
    }
    const zCount = popcount(mask)
    if (zCount >= minZ) {
      vectors.push({
        id: b.id || b.name.toLowerCase().replace(/\s+/g, '_'),
        name: b.name,
        displayCategory: b.displayCategory,
        image: b.image,
        zipMask: mask,
        zipBuyers: zbMap,
        zipCount: zCount,
        totalBuyers: totalB,
      })
    }
  }

  // Sort vectors by zipCount DESC, totalBuyers DESC so highest demand crops seed first
  vectors.sort((a, b) => b.zipCount - a.zipCount || b.totalBuyers - a.totalBuyers)

  // 3. O(N^2) Sequential Cluster Grouping
  const uniqueClusters: MultiProduceCluster[] = []
  const assigned = new Uint8Array(vectors.length) // 0 = unassigned, 1 = assigned

  for (let i = 0; i < vectors.length; i++) {
    if (assigned[i]) continue

    const clusterIndices = [i]
    let clusterMask = vectors[i].zipMask

    // If minP === 1, each qualifying vector can be its own cluster
    if (minP === 1) {
      assigned[i] = 1
      const commonZips = maskToZips(clusterMask)
      const previewZips = commonZips.slice(0, 3).join(', ') + (commonZips.length > 3 ? ` + ${commonZips.length - 3} more` : '')
      const adHook = `Attention local gardeners! Neighbors in ${previewZips} are actively looking to buy fresh ${vectors[i].name}. Have surplus in your yard or garden? Turn your harvest into income on CasaGrown!`
      uniqueClusters.push({
        id: vectors[i].name.toLowerCase().replace(/\s+/g, '_'),
        produces: [{ name: vectors[i].name, displayCategory: vectors[i].displayCategory, image: vectors[i].image }],
        produceNames: [vectors[i].name],
        zips: commonZips,
        zipCount: commonZips.length,
        totalBuyers: vectors[i].totalBuyers,
        adHook,
      })
      continue
    }

    // Scan remaining unassigned items to grow this cluster
    for (let j = i + 1; j < vectors.length; j++) {
      if (assigned[j]) continue
      if (clusterIndices.length >= maxBundleSize) break

      const testMask = clusterMask & vectors[j].zipMask
      if (popcount(testMask) >= minZ) {
        clusterIndices.push(j)
        clusterMask = testMask
      }
    }

    // If we gathered at least minProduce items in this cluster
    if (clusterIndices.length >= minP) {
      for (const idx of clusterIndices) {
        assigned[idx] = 1
      }

      const commonZips = maskToZips(clusterMask)
      const prodItems = clusterIndices.map(idx => vectors[idx])
      const prodNames = prodItems.map(p => p.name)
      let totalB = 0
      for (const item of prodItems) {
        for (const z of commonZips) {
          totalB += item.zipBuyers.get(z) || 1
        }
      }

      const clusterId = prodNames.slice().sort().join('_').toLowerCase().replace(/\s+/g, '_')
      const previewZips = commonZips.slice(0, 3).join(', ') + (commonZips.length > 3 ? ` + ${commonZips.length - 3} more` : '')
      const adHook = `Attention local gardeners! Neighbors in ${previewZips} are actively looking to buy fresh ${prodNames.join(', ')}. Have surplus in your yard or garden? Turn your harvest into income on CasaGrown!`

      uniqueClusters.push({
        id: clusterId,
        produces: prodItems.map(p => ({ name: p.name, displayCategory: p.displayCategory, image: p.image })),
        produceNames: prodNames,
        zips: commonZips,
        zipCount: commonZips.length,
        totalBuyers: totalB,
        adHook,
      })
    }
  }

  // 4. Remainder Produce: crops not bundled in any cluster
  const coveredProduce = new Set(uniqueClusters.flatMap(c => c.produceNames))
  const remainderProduces: RemainderProduceItem[] = []

  for (const b of buyerDemands) {
    if (!coveredProduce.has(b.name) && b.zipDetails.length > 0) {
      const zips = b.zipDetails.map(zd => zd.zip).sort()
      const totalBuyers = b.zipDetails.reduce((acc, zd) => acc + zd.buyers, 0)
      const previewZips = zips.slice(0, 3).join(', ') + (zips.length > 3 ? ` + ${zips.length - 3} more` : '')
      const adHook = `Attention local gardeners! Neighbors in ${previewZips} are looking to buy fresh homegrown ${b.name}. Have extra harvest in your garden? Sell to your neighbors easily on CasaGrown!`

      remainderProduces.push({
        id: b.id || b.name.toLowerCase().replace(/\s+/g, '_'),
        name: b.name,
        displayCategory: b.displayCategory,
        image: b.image,
        zips,
        zipCount: zips.length,
        totalBuyers,
        adHook,
      })
    }
  }

  remainderProduces.sort((a, b) => b.totalBuyers - a.totalBuyers || b.zipCount - a.zipCount)
  uniqueClusters.sort((a, b) => b.zipCount - a.zipCount || b.totalBuyers - a.totalBuyers)

  return {
    uniqueClusters,
    remainderProduces,
  }
}

describe('O(N^2) Sequential Bitmask Cluster Grouping & Remainder Engine', () => {
  it('bundles all combineable crops into unique multi-crop bundles without missing pairs', () => {
    const mockDemands = [
      // Cluster 1: 5 crops in 15 ZIPs
      { name: 'Blueberries', displayCategory: 'Fruit', image: '/1.png', zipDetails: [{ zip: '30094', buyers: 10 }, { zip: '30253', buyers: 10 }, { zip: '48174', buyers: 10 }] },
      { name: 'Avocados', displayCategory: 'Fruit', image: '/2.png', zipDetails: [{ zip: '30094', buyers: 10 }, { zip: '30253', buyers: 10 }, { zip: '48174', buyers: 10 }] },
      { name: 'Bell Peppers', displayCategory: 'Vegetables', image: '/3.png', zipDetails: [{ zip: '30094', buyers: 10 }, { zip: '30253', buyers: 10 }, { zip: '48174', buyers: 10 }] },
      { name: 'Pears', displayCategory: 'Fruit', image: '/4.png', zipDetails: [{ zip: '30094', buyers: 10 }, { zip: '30253', buyers: 10 }, { zip: '48174', buyers: 10 }] },
      { name: 'Zucchini', displayCategory: 'Vegetables', image: '/5.png', zipDetails: [{ zip: '30094', buyers: 10 }, { zip: '30253', buyers: 10 }, { zip: '48174', buyers: 10 }] },

      // Cluster 2: Cucumbers and Basil and Lemons in multiple ZIPs
      { name: 'Cucumbers', displayCategory: 'Vegetables', image: '/6.png', zipDetails: [{ zip: '28203', buyers: 5 }, { zip: '30022', buyers: 5 }] },
      { name: 'Basil', displayCategory: 'Herbs', image: '/7.png', zipDetails: [{ zip: '28203', buyers: 5 }, { zip: '30022', buyers: 5 }] },
      { name: 'Lemons', displayCategory: 'Citrus', image: '/8.png', zipDetails: [{ zip: '28203', buyers: 5 }, { zip: '30022', buyers: 5 }] },

      // Remainder: Solo crop
      { name: 'Rare Passionfruit', displayCategory: 'Fruit', image: '/9.png', zipDetails: [{ zip: '99999', buyers: 1 }] },
    ]

    const result = findProduceClustersBitmask({
      buyerDemands: mockDemands,
      minProduceInput: 2,
      minZipInput: 2,
    })

    // Expect at least 2 clusters: Cluster 1 (5 items) AND Cluster 2 (Cucumbers + Basil + Lemons)
    expect(result.uniqueClusters.length).toBe(2)

    const cucumberCluster = result.uniqueClusters.find(c => c.produceNames.includes('Cucumbers'))
    expect(cucumberCluster).toBeDefined()
    expect(cucumberCluster?.produceNames).toContain('Basil')
    expect(cucumberCluster?.produceNames).toContain('Lemons')

    // Cucumbers, Basil, Lemons must NOT be in remainder!
    expect(result.remainderProduces.find(r => r.name === 'Cucumbers')).toBeUndefined()
    expect(result.remainderProduces.find(r => r.name === 'Basil')).toBeUndefined()
    expect(result.remainderProduces.find(r => r.name === 'Lemons')).toBeUndefined()
    expect(result.remainderProduces.find(r => r.name === 'Rare Passionfruit')).toBeDefined()
  })

  it('benchmark: executes O(N^2) cluster search across 100 crops and 50 ZIPs in < 10ms', () => {
    const largeCatalog: any[] = []
    const allZips = Array.from({ length: 50 }, (_, i) => `951${(10 + i).toString().padStart(2, '0')}`)

    for (let i = 0; i < 100; i++) {
      const zipSubset = allZips.filter((_, idx) => (idx + i) % 4 === 0)
      largeCatalog.push({
        name: `Produce Item ${i}`,
        displayCategory: 'Category',
        image: `/item-${i}.png`,
        zipDetails: zipSubset.map(z => ({ zip: z, buyers: Math.floor(Math.random() * 20) + 1 })),
      })
    }

    const t0 = performance.now()
    const result = findProduceClustersBitmask({
      buyerDemands: largeCatalog,
      minProduceInput: 2,
      minZipInput: 2,
    })
    const t1 = performance.now()
    const durationMs = t1 - t0

    expect(durationMs).toBeLessThan(10) // Ultra fast (<10ms)
    expect(result.uniqueClusters.length).toBeGreaterThan(0)
  })
})
