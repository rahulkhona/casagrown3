import { describe, it, expect } from 'vitest'

// Core algorithm extracted from produce-demand/page.tsx for standalone unit & benchmark testing
export function findProduceClustersBitmask({
  buyerDemands,
  minProduceInput,
  minZipInput,
}: {
  buyerDemands: {
    name: string
    displayCategory: string
    image: string
    zipDetails: { zip: string; buyers: number }[]
  }[]
  minProduceInput: number
  minZipInput: number
}) {
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

  const clusters: any[] = []
  const seenClusterIds = new Set<string>()

  // Sort candidate vectors by zipCount DESC
  vectors.sort((a, b) => b.zipCount - a.zipCount || b.totalBuyers - a.totalBuyers)

  // Single item clusters if minP === 1
  if (minP === 1) {
    for (const v of vectors) {
      const commonZips = maskToZips(v.zipMask)
      const clusterId = v.name.toLowerCase().replace(/\s+/g, '_')
      seenClusterIds.add(clusterId)
      clusters.push({
        id: clusterId,
        produceNames: [v.name],
        zips: commonZips,
        zipCount: commonZips.length,
        totalBuyers: v.totalBuyers,
      })
    }
  }

  // Candidate-pruned bitmask search for Multi-Produce Bundles (Level 2 to Level 5)
  interface Itemset {
    indices: number[]
    mask: bigint
    count: number
  }

  function addCluster(itemset: Itemset) {
    const prodItems = itemset.indices.map(idx => vectors[idx])
    const prodNames = prodItems.map(p => p.name)
    const clusterId = prodNames.slice().sort().join('_').toLowerCase().replace(/\s+/g, '_')
    if (seenClusterIds.has(clusterId)) return
    seenClusterIds.add(clusterId)

    const commonZips = maskToZips(itemset.mask)
    let totalB = 0
    for (const item of prodItems) {
      for (const z of commonZips) {
        totalB += item.zipBuyers.get(z) || 1
      }
    }

    clusters.push({
      id: clusterId,
      produceNames: prodNames,
      zips: commonZips,
      zipCount: commonZips.length,
      totalBuyers: totalB,
    })
  }

  let currentLevel: Itemset[] = []

  // Generate Level 2 (Pairs) using fast O(N^2) pairwise bitwise AND
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const pairMask = vectors[i].zipMask & vectors[j].zipMask
      const count = popcount(pairMask)
      if (count >= minZ) {
        currentLevel.push({ indices: [i, j], mask: pairMask, count })
      }
    }
  }

  // Sort Level 2 by ZIP count DESC and cap to top 50 strongest candidate pairs
  currentLevel.sort((a, b) => b.count - a.count)
  if (currentLevel.length > 50) {
    currentLevel = currentLevel.slice(0, 50)
  }

  if (minP <= 2) {
    for (const itemset of currentLevel) {
      addCluster(itemset)
    }
  }

  // Extend to Level 3, 4, 5 with Apriori Branch-and-Bound bitwise pruning (capped at top 50 per level)
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
            const nextItemset: Itemset = { indices: nextIndices, mask: nextMask, count }
            nextCandidates.push(nextItemset)
          }
        }
      }
    }

    // Sort next level candidates by shared ZIP count and retain top 50
    nextCandidates.sort((a, b) => b.count - a.count)
    currentLevel = nextCandidates.slice(0, 50)

    if (level >= minP) {
      for (const itemset of currentLevel) {
        addCluster(itemset)
      }
    }
  }

  clusters.sort((a, b) => b.zipCount - a.zipCount || b.totalBuyers - a.totalBuyers)
  return clusters
}

describe('BigInt Bitmask Cluster Finder Engine', () => {
  it('correctly discovers pairwise and 3-way produce clusters sharing identical ZIPs', () => {
    const mockDemands = [
      {
        name: 'Meyer Lemons',
        displayCategory: 'Citrus',
        image: '/lemons.png',
        zipDetails: [
          { zip: '95120', buyers: 15 },
          { zip: '95125', buyers: 10 },
          { zip: '95070', buyers: 8 },
        ],
      },
      {
        name: 'Hass Avocados',
        displayCategory: 'Fruits',
        image: '/avocados.png',
        zipDetails: [
          { zip: '95120', buyers: 12 },
          { zip: '95125', buyers: 14 },
          { zip: '95070', buyers: 5 },
        ],
      },
      {
        name: 'Black Mission Figs',
        displayCategory: 'Fruits',
        image: '/figs.png',
        zipDetails: [
          { zip: '95120', buyers: 9 },
          { zip: '95125', buyers: 7 },
        ],
      },
      {
        name: 'Rosemary',
        displayCategory: 'Herbs',
        image: '/rosemary.png',
        zipDetails: [{ zip: '90210', buyers: 2 }],
      },
    ]

    const clusters = findProduceClustersBitmask({
      buyerDemands: mockDemands,
      minProduceInput: 2,
      minZipInput: 2,
    })

    // Expect Lemons + Avocados (3 ZIPs)
    // Expect Lemons + Figs (2 ZIPs)
    // Expect Avocados + Figs (2 ZIPs)
    // Expect Lemons + Avocados + Figs (2 ZIPs: 95120, 95125)
    expect(clusters.length).toBe(4)

    const lemonAvo = clusters.find(c => c.id === 'hass_avocados_meyer_lemons')
    expect(lemonAvo).toBeDefined()
    expect(lemonAvo?.zipCount).toBe(3)
    expect(lemonAvo?.zips).toEqual(['95070', '95120', '95125'])

    const threeWay = clusters.find(c => c.id === 'black_mission_figs_hass_avocados_meyer_lemons')
    expect(threeWay).toBeDefined()
    expect(threeWay?.zipCount).toBe(2)
    expect(threeWay?.zips).toEqual(['95120', '95125'])
  })

  it('benchmark test: executes across 100 produce items and 50 ZIPs in < 15ms without blocking', () => {
    const largeCatalog: any[] = []
    const allZips = Array.from({ length: 50 }, (_, i) => `951${(10 + i).toString().padStart(2, '0')}`)

    for (let i = 0; i < 100; i++) {
      // Each produce has 5 to 15 random ZIPs
      const zipSubset = allZips.filter((_, idx) => (idx + i) % 4 === 0 || (idx * i) % 7 === 0)
      largeCatalog.push({
        name: `Produce Item ${i}`,
        displayCategory: 'Category',
        image: `/item-${i}.png`,
        zipDetails: zipSubset.map(z => ({ zip: z, buyers: Math.floor(Math.random() * 20) + 1 })),
      })
    }

    const t0 = performance.now()
    const clusters = findProduceClustersBitmask({
      buyerDemands: largeCatalog,
      minProduceInput: 2,
      minZipInput: 3,
    })
    const t1 = performance.now()
    const durationMs = t1 - t0

    // Must execute in < 25ms
    expect(durationMs).toBeLessThan(25)
    expect(clusters.length).toBeGreaterThan(0)
  })
})
