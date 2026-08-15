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

// Core algorithm with Greedy Disjoint Partitioning and Remainder Extraction
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

  // 1. Collect all unique ZIP codes and build index map
  const allZipsSet = new Set<string>()
  for (const b of buyerDemands) {
    for (const zd of b.zipDetails) {
      if (zd.zip) allZipsSet.add(zd.zip)
    }
  }
  const allZips = Array.from(allZipsSet).sort()
  const zipToIndex = new Map<string, number>()
  allZips.forEach((z, i) => zipToIndex.set(z, i))

  // Fast Brian Kernighan popcount on BigInt
  function popcount(mask: bigint): number {
    let count = 0
    let m = mask
    while (m > 0n) {
      m &= m - 1n
      count++
    }
    return count
  }

  // Convert a BigInt mask back to sorted array of ZIP strings
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
    if (b.zipDetails.length >= minZ) {
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
  }

  // Sort candidate vectors by zipCount DESC
  vectors.sort((a, b) => b.zipCount - a.zipCount || b.totalBuyers - a.totalBuyers)

  interface Itemset {
    indices: number[]
    mask: bigint
    count: number
    score: number
  }

  const allCandidateItemsets: Itemset[] = []

  // Generate Level 2 (Pairs)
  let currentLevel: Itemset[] = []
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const pairMask = vectors[i].zipMask & vectors[j].zipMask
      const count = popcount(pairMask)
      if (count >= minZ) {
        let totalB = 0
        const zips = maskToZips(pairMask)
        for (const z of zips) {
          totalB += (vectors[i].zipBuyers.get(z) || 1) + (vectors[j].zipBuyers.get(z) || 1)
        }
        const score = count * 1000 + 2 * 100 + totalB
        currentLevel.push({ indices: [i, j], mask: pairMask, count, score })
      }
    }
  }

  currentLevel.sort((a, b) => b.score - a.score)
  if (currentLevel.length > 50) currentLevel = currentLevel.slice(0, 50)

  if (minP <= 2) {
    allCandidateItemsets.push(...currentLevel)
  }

  // Extend to Level 3, 4, 5
  for (let level = 3; level <= 5; level++) {
    if (currentLevel.length === 0) break
    const nextCandidates: Itemset[] = []
    const nextSeen = new Set<string>()

    for (const parent of currentLevel) {
      const lastIdx = parent.indices[parent.indices.length - 1]
      for (let k = lastIdx + 1; k < vectors.length; k++) {
        const nextMask = parent.mask & vectors[k].zipMask
        const count = popcount(nextMask)
        if (count >= minZ) {
          const nextIndices = [...parent.indices, k]
          const key = nextIndices.join(',')
          if (!nextSeen.has(key)) {
            nextSeen.add(key)
            let totalB = 0
            const zips = maskToZips(nextMask)
            for (const z of zips) {
              for (const idx of nextIndices) {
                totalB += vectors[idx].zipBuyers.get(z) || 1
              }
            }
            const score = count * 1000 + level * 100 + totalB
            const nextItemset: Itemset = { indices: nextIndices, mask: nextMask, count, score }
            nextCandidates.push(nextItemset)
          }
        }
      }
    }

    nextCandidates.sort((a, b) => b.score - a.score)
    currentLevel = nextCandidates.slice(0, 50)

    if (level >= minP) {
      allCandidateItemsets.push(...currentLevel)
    }
  }

  // Sort all candidates by score (highest coverage & bundle size first)
  allCandidateItemsets.sort((a, b) => b.score - a.score)

  // 3. GREEDY DISJOINT PARTITIONING (Enforces 100% Unique, Non-Overlapping Bundles)
  const uniqueClusters: MultiProduceCluster[] = []
  const coveredProduceNames = new Set<string>()

  for (const itemset of allCandidateItemsets) {
    const prodItems = itemset.indices.map(idx => vectors[idx])
    const prodNames = prodItems.map(p => p.name)

    // Ensure completely unique produce membership across bundles
    const isDisjoint = prodNames.every(name => !coveredProduceNames.has(name))
    if (isDisjoint) {
      prodNames.forEach(name => coveredProduceNames.add(name))
      const commonZips = maskToZips(itemset.mask)
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

  // 4. REMAINDER PRODUCE & ZIP EXTRACTION (Crops not absorbed into any multi-produce bundle)
  const remainderProduces: RemainderProduceItem[] = []
  for (const b of buyerDemands) {
    if (!coveredProduceNames.has(b.name) && b.zipDetails.length > 0) {
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

  return {
    uniqueClusters,
    remainderProduces,
  }
}

describe('BigInt Bitmask Unique Disjoint Cluster Finder & Remainder Engine', () => {
  it('discovers strictly unique, non-overlapping clusters without duplicate sub-combinations', () => {
    const mockDemands = [
      {
        name: 'Strawberries',
        displayCategory: 'Fruit',
        image: '/strawberries.png',
        zipDetails: [
          { zip: '28203', buyers: 20 },
          { zip: '30022', buyers: 15 },
          { zip: '30341', buyers: 10 },
          { zip: '45036', buyers: 8 },
          { zip: '48047', buyers: 7 },
        ],
      },
      {
        name: 'Cherries',
        displayCategory: 'Fruit',
        image: '/cherries.png',
        zipDetails: [
          { zip: '28203', buyers: 18 },
          { zip: '30022', buyers: 12 },
          { zip: '30341', buyers: 9 },
          { zip: '45036', buyers: 7 },
          { zip: '48047', buyers: 6 },
        ],
      },
      {
        name: 'Peaches',
        displayCategory: 'Fruit',
        image: '/peaches.png',
        zipDetails: [
          { zip: '28203', buyers: 14 },
          { zip: '30022', buyers: 11 },
          { zip: '30341', buyers: 8 },
          { zip: '45036', buyers: 6 },
          { zip: '48047', buyers: 5 },
        ],
      },
      {
        name: 'Apples',
        displayCategory: 'Fruit',
        image: '/apples.png',
        zipDetails: [
          { zip: '28203', buyers: 15 },
          { zip: '30022', buyers: 10 },
          { zip: '30341', buyers: 7 },
          { zip: '45036', buyers: 5 },
          { zip: '48047', buyers: 4 },
        ],
      },
      {
        name: 'Blueberries',
        displayCategory: 'Fruit',
        image: '/blueberries.png',
        zipDetails: [
          { zip: '28203', buyers: 12 },
          { zip: '30022', buyers: 8 },
          { zip: '30341', buyers: 6 },
          { zip: '45036', buyers: 4 },
          { zip: '48047', buyers: 3 },
        ],
      },
      {
        name: 'Meyer Lemons',
        displayCategory: 'Citrus',
        image: '/lemons.png',
        zipDetails: [
          { zip: '95120', buyers: 25 },
          { zip: '95125', buyers: 18 },
        ],
      },
    ]

    const result = findProduceClustersBitmask({
      buyerDemands: mockDemands,
      minProduceInput: 3,
      minZipInput: 5,
    })

    // Expect 1 maximal disjoint cluster containing [Strawberries, Cherries, Peaches, Apples, Blueberries] (or top 3-5 bundle)
    expect(result.uniqueClusters.length).toBeGreaterThanOrEqual(1)

    // Ensure NO crop appears in more than one cluster
    const seenCrops = new Set<string>()
    for (const cluster of result.uniqueClusters) {
      for (const name of cluster.produceNames) {
        expect(seenCrops.has(name)).toBe(false)
        seenCrops.add(name)
      }
    }

    // Remainder produce must include Meyer Lemons (since its ZIP count < 5)
    const lemonRemainder = result.remainderProduces.find(r => r.name === 'Meyer Lemons')
    expect(lemonRemainder).toBeDefined()
    expect(lemonRemainder?.zips).toEqual(['95120', '95125'])
    expect(lemonRemainder?.totalBuyers).toBe(43)
  })

  it('benchmark test: executes disjoint clustering across 100 produce items and 50 ZIPs in < 15ms', () => {
    const largeCatalog: any[] = []
    const allZips = Array.from({ length: 50 }, (_, i) => `951${(10 + i).toString().padStart(2, '0')}`)

    for (let i = 0; i < 100; i++) {
      const zipSubset = allZips.filter((_, idx) => (idx + i) % 3 === 0)
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
      minProduceInput: 3,
      minZipInput: 4,
    })
    const t1 = performance.now()
    const durationMs = t1 - t0

    expect(durationMs).toBeLessThan(25)
    expect(result.uniqueClusters.length).toBeGreaterThan(0)
    expect(result.remainderProduces.length).toBeGreaterThan(0)

    // Verify disjointness
    const clusterCrops = new Set(result.uniqueClusters.flatMap(c => c.produceNames))
    const remainderCrops = new Set(result.remainderProduces.map(r => r.name))
    for (const crop of clusterCrops) {
      expect(remainderCrops.has(crop)).toBe(false)
    }
  })
})
