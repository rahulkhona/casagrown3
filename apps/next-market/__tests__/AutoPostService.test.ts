import { describe, it, expect, vi, beforeEach } from 'vitest'
import { autoPostProductToCommunity } from '../../../packages/app/features/community-chat/auto-post-service'

describe('autoPostProductToCommunity', () => {
  let mockSupabase: any

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      maybeSingle: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn(),
    }
  })

  it('posts using profiles.home_community_h3_index if present', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { home_community_h3_index: '87283472bffffff', full_name: 'Jane Doe' },
      error: null,
    })
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'msg-123' },
      error: null,
    })

    const res = await autoPostProductToCommunity({
      supabase: mockSupabase,
      userId: 'user-1',
      productId: 'prod-1',
      productName: 'Tomatoes',
      priceUsd: 5,
      unit: 'lb',
    })

    expect(res.success).toBe(true)
    expect(res.h3Index).toBe('87283472bffffff')
    expect(mockSupabase.insert).toHaveBeenCalledWith({
      community_h3_index: '87283472bffffff',
      author_id: 'user-1',
      content: '🌿 New listing! Tomatoes — $5/lb. Browse & order on CasaGrown Market! 🛒',
      product_listing_id: 'prod-1',
      is_system: true,
    })
  })

  it('falls back to geocoded fallbackAddress if profile H3 is missing', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { home_community_h3_index: null, full_name: 'John Smith' },
      error: null,
    })
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'msg-456' },
      error: null,
    })

    const mockGeocode = vi.fn().mockResolvedValueOnce({ lat: 37.3382, lng: -121.8863 })

    const res = await autoPostProductToCommunity({
      supabase: mockSupabase,
      userId: 'user-2',
      productId: 'prod-2',
      productName: 'Apples',
      priceUsd: '3.50',
      unit: 'bag',
      fallbackAddress: '95125',
      geocodeFn: mockGeocode,
    })

    expect(res.success).toBe(true)
    expect(res.h3Index).toBeDefined()
    expect(mockGeocode).toHaveBeenCalledWith('95125')
    
    // Verify profile is synced with resolved H3 index
    expect(mockSupabase.update).toHaveBeenCalledWith({ home_community_h3_index: res.h3Index })
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'user-2')

    // Verify community row is upserted
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      { h3_index: res.h3Index, name: 'Local Community' },
      { onConflict: 'h3_index' }
    )
  })

  it('does not update profile home_community_h3_index if profile already has one', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { home_community_h3_index: '87283472bffffff', full_name: 'Jane Doe' },
      error: null,
    })
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'msg-789' },
      error: null,
    })

    const res = await autoPostProductToCommunity({
      supabase: mockSupabase,
      userId: 'user-1',
      productId: 'prod-1',
      productName: 'Tomatoes',
      priceUsd: 5,
      unit: 'lb',
      fallbackAddress: '95125',
    })

    expect(res.success).toBe(true)
    expect(res.h3Index).toBe('87283472bffffff')
    // Should not call update on profiles since it already exists
    expect(mockSupabase.update).not.toHaveBeenCalled()
  })

  it('returns failure if no H3 index can be resolved', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { home_community_h3_index: null },
      error: null,
    })

    const mockGeocode = vi.fn().mockResolvedValueOnce(null)

    const res = await autoPostProductToCommunity({
      supabase: mockSupabase,
      userId: 'user-3',
      productId: 'prod-3',
      productName: 'Peaches',
      priceUsd: 4,
      unit: 'each',
      fallbackAddress: 'invalid-address',
      geocodeFn: mockGeocode,
    })

    expect(res.success).toBe(false)
    expect(res.reason).toBe('Could not resolve H3 index')
  })
})
