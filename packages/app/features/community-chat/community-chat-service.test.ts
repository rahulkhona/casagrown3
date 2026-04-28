import {
  fetchCommunityMessages,
  sendCommunityMessage,
  deleteCommunityMessage,
  editCommunityMessage,
  toggleMessageReaction,
  flagMessage,
  getCommunityUnreadCount,
  searchCommunityMessages,
} from './community-chat-service'
import { supabase } from '../auth/auth-hook'

// Mock data
const mockH3 = '89283082bffffff'
const mockUserId = 'e2b9c7b9-d8e2-411a-bea3-455b80aabc31' // use a stable mock ID
const mockProfileData = {
  id: mockUserId,
  email: 'test@example.com',
  full_name: 'Test User',
  home_community_h3_index: mockH3,
  is_banned: false,
  is_ghosted: false
}

// Generate a random user ID for each test run to avoid conflicts
const testUserId = `test-user-${Date.now()}`

describe('community-chat-service', () => {
  // We need an authenticated session to test RLS policies
  beforeEach(async () => {
    // Note: In a real test environment, we would use a seeded test user
    // For now we just verify the service functions are calling Supabase correctly
  })

  it('exports all expected functions', () => {
    expect(typeof fetchCommunityMessages).toBe('function')
    expect(typeof sendCommunityMessage).toBe('function')
    expect(typeof deleteCommunityMessage).toBe('function')
    expect(typeof editCommunityMessage).toBe('function')
    expect(typeof toggleMessageReaction).toBe('function')
    expect(typeof flagMessage).toBe('function')
    expect(typeof getCommunityUnreadCount).toBe('function')
    expect(typeof searchCommunityMessages).toBe('function')
  })

  // We are using a mock/stub approach here since actual DB calls need valid auth state
  // and seeded profiles in the test database.
  
  it('handles message fetching correctly', async () => {
    // Spy on the RPC call
    const spy = jest.spyOn(supabase, 'rpc').mockResolvedValue({
      data: [
        { id: '1', content: 'hello', media: [] }
      ],
      error: null
    } as any)
    
    const messages = await fetchCommunityMessages(mockH3, 'test-user')
    
    expect(spy).toHaveBeenCalledWith('get_community_chat_messages', {
      p_h3_index: mockH3,
      p_cursor: null,
      p_limit: 50
    })
    expect(messages.length).toBe(1)
    expect(messages[0].content).toBe('hello')
    
    spy.mockRestore()
  })

  it('hydrates media URLs correctly', async () => {
    const spy = jest.spyOn(supabase, 'rpc').mockResolvedValue({
      data: [
        { id: '1', content: 'hello', media: [{ storage_path: 'user/123-img.png', media_type: 'image' }] }
      ],
      error: null
    } as any)
    
    // Mock storage getPublicUrl
    const storageSpy = jest.spyOn(supabase.storage, 'from').mockReturnValue({
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/com-chat/${path}` } })
    } as any)
    
    const messages = await fetchCommunityMessages(mockH3, 'test-user')
    
    expect(messages[0].media[0].url).toBe('https://mock.supabase.co/storage/v1/object/public/com-chat/user/123-img.png')
    
    spy.mockRestore()
    storageSpy.mockRestore()
  })
})
