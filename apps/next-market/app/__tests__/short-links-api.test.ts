// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, PATCH } from '../api/crm/short-links/route'

// Hoist mock setup to prevent temporal dead zone issues with vi.mock
const { mockSupabase, mockInsert, mockUpdate, mockEq, mockSelect, mockSingle } = vi.hoisted(() => {
  const mockSingle = vi.fn()
  const mockSelect = vi.fn()
  const mockInsert = vi.fn()
  const mockUpdate = vi.fn()
  const mockEq = vi.fn()
  
  const mockSupabase = {
    from: vi.fn(() => ({
      insert: mockInsert,
      update: mockUpdate,
    }))
  }
  return { mockSupabase, mockInsert, mockUpdate, mockEq, mockSelect, mockSingle }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}))

describe('crm/short-links route handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key'

    mockInsert.mockReturnValue({
      select: mockSelect.mockReturnValue({
        single: mockSingle.mockResolvedValue({ data: { token: 'testtoken' }, error: null })
      })
    })

    mockUpdate.mockReturnValue({
      eq: mockEq.mockResolvedValue({ error: null })
    })
  })

  it('POST creates a short link', async () => {
    const req = new NextRequest('http://localhost:3000/api/crm/short-links', {
      method: 'POST',
      body: JSON.stringify({
        destination_url: 'https://casagrown.com/destination',
        campaign_id: '12345',
        label: 'testlabel'
      })
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.token).toBe('testtoken')
    expect(json.short_url).toContain('/r/testtoken')

    expect(mockSupabase.from).toHaveBeenCalledWith('crm_short_links')
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      destination_url: 'https://casagrown.com/destination',
      campaign_id: '12345',
      label: 'testlabel'
    }))
  })

  it('PATCH updates the is_shared status', async () => {
    const req = new NextRequest('http://localhost:3000/api/crm/short-links', {
      method: 'PATCH',
      body: JSON.stringify({
        token: 'testtoken',
        is_shared: true
      })
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)

    expect(mockSupabase.from).toHaveBeenCalledWith('crm_short_links')
    expect(mockUpdate).toHaveBeenCalledWith({ is_shared: true })
    expect(mockEq).toHaveBeenCalledWith('token', 'testtoken')
  })

  it('PATCH defaults is_shared to true if not specified', async () => {
    const req = new NextRequest('http://localhost:3000/api/crm/short-links', {
      method: 'PATCH',
      body: JSON.stringify({
        token: 'testtoken'
      })
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)

    expect(mockUpdate).toHaveBeenCalledWith({ is_shared: true })
  })

  it('PATCH allows setting is_shared explicitly to false', async () => {
    const req = new NextRequest('http://localhost:3000/api/crm/short-links', {
      method: 'PATCH',
      body: JSON.stringify({
        token: 'testtoken',
        is_shared: false
      })
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)

    expect(mockUpdate).toHaveBeenCalledWith({ is_shared: false })
  })

  it('PATCH returns 400 if token is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/crm/short-links', {
      method: 'PATCH',
      body: JSON.stringify({
        is_shared: true
      })
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('token is required')
  })

  it('PATCH returns 400 on invalid JSON body', async () => {
    const req = new NextRequest('http://localhost:3000/api/crm/short-links', {
      method: 'PATCH',
      body: 'invalid-json-body'
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON')
  })

  it('PATCH returns 500 when Supabase config is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL

    const req = new NextRequest('http://localhost:3000/api/crm/short-links', {
      method: 'PATCH',
      body: JSON.stringify({
        token: 'testtoken'
      })
    })

    const res = await PATCH(req)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Server not configured')
  })
})
