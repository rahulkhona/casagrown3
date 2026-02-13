import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Platform } from 'react-native'
import { useRouter } from 'solito/navigation'
import { useAuth, supabase } from '../auth/auth-hook'
import { uploadProfileAvatar } from './utils/media-upload'
import { uploadPostMedia } from '../create-post/media-upload'

export type WizardData = {
  // Step 1: Profile
  avatar?: string
  avatarUri?: string
  name: string
  notifySell: boolean
  notifyBuy: boolean
  notifyPush: boolean
  notifySms: boolean
  phone?: string

  // Step 2: Community
  country: string
  zipCode: string
  address: string
  location?: { lat: number; lng: number }
  community?: {
    h3Index: string
    name: string
    points: number
  }
  nearbyCommunities: string[] // List of adjacent H3 indices

  // Step 3: Intro
  introText: string
  produceTags: string[]
  customProduce: string[]
  mediaUri?: string
  mediaType?: 'image' | 'video'
  isFirstPost: boolean
}

const defaultData: WizardData = {
  name: '',
  notifySell: false,
  notifyBuy: false,
  notifyPush: true,
  notifySms: false,
  country: 'USA',
  zipCode: '',
  address: '',
  nearbyCommunities: [],
  introText: '',
  produceTags: [],
  customProduce: [],
  isFirstPost: true,
}

type WizardContextType = {
  step: number
  data: WizardData
  setStep: (step: number) => void
  updateData: (updates: Partial<WizardData>) => void
  nextStep: () => void
  prevStep: () => void
  saveProfile: (overrides?: Partial<WizardData>) => Promise<boolean>
  loading: boolean
}

const WizardContext = createContext<WizardContextType | null>(null)

export const WizardProvider = ({ children }: { children: ReactNode }) => {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>(defaultData)
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()

  // Pre-populate data from Auth Provider (Social Login)
  useEffect(() => {
    if (user && !data.name) {
      console.log('👤 [Wizard] Pre-populating user data', user.user_metadata)
      setData(prev => ({
        ...prev,
        // Use ?? to avoid overwriting if user already typed something (though check !data.name handles that)
        name: user.user_metadata.full_name || prev.name,
        avatar: user.user_metadata.avatar_url || prev.avatar,
      }))
    }
  }, [user, data.name])

  const updateData = (updates: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...updates }))
  }

   const saveProfile = async (overrides?: Partial<WizardData>) => {
     if (!user) return false
     setLoading(true)
     // Merge overrides into data to avoid React setState race condition
     // (updateData is async via setState, but saveProfile may be called immediately after)
     const d = overrides ? { ...data, ...overrides } : data
     console.log('💾 [Wizard] Saving Profile to Supabase...', d)
     
     try {
        // 0. Check for referral code and lookup inviter
        let invitedById: string | null = null
        try {
          let storedReferralCode: string | null = null
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            storedReferralCode = window.localStorage.getItem('casagrown_referral_code')
          } else {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default
            storedReferralCode = await AsyncStorage.getItem('casagrown_referral_code')
          }
          
          if (storedReferralCode) {
            console.log('🔗 Found referral code:', storedReferralCode)
            const { data: inviterProfile } = await supabase
              .from('profiles')
              .select('id')
              .eq('referral_code', storedReferralCode)
              .single()
            
            if (inviterProfile) {
              invitedById = inviterProfile.id
              console.log('✅ Found inviter:', invitedById)
            } else {
              // Track invalid referral code for analytics
              // This helps measure clipboard method effectiveness
              console.warn('⚠️ Invalid referral code (no matching inviter):', storedReferralCode)
              try {
                await supabase
                  .from('referral_analytics')
                  .insert({
                    referral_code: storedReferralCode,
                    status: 'invalid_code',
                    source: Platform.OS === 'web' ? 'web' : 'native_clipboard'
                  })
              } catch (analyticsErr) {
                // Table might not exist yet - just log
                console.log('📊 Would track invalid referral:', storedReferralCode)
              }
            }
            
            // Clear the referral code after use
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.localStorage.removeItem('casagrown_referral_code')
            } else {
              const AsyncStorage = require('@react-native-async-storage/async-storage').default
              await AsyncStorage.removeItem('casagrown_referral_code')
            }
          }
        } catch (refErr) {
          console.warn('Could not process referral code:', refErr)
        }

        // 1. Upload Avatar if changed (local URI)
        // - Native: file:///data/... or file:///var/...
        // - Web: blob:http://... or data:...
        let avatarUrl = d.avatar
        const isLocalUri = d.avatar && (
            d.avatar.startsWith('file') || 
            d.avatar.startsWith('blob') || 
            d.avatar.startsWith('data:')
        )
        if (isLocalUri && d.avatar) {
             console.log('📤 Uploading avatar:', d.avatar.substring(0, 50) + '...')
             const uploadedUrl = await uploadProfileAvatar(user.id, d.avatar)
             if (uploadedUrl) {
                 console.log('✅ Avatar uploaded:', uploadedUrl)
                 avatarUrl = uploadedUrl
             } else {
                 console.warn('⚠️ Avatar upload returned null, keeping local URI')
             }
        }

        // 2. Update Profile (including invited_by_id if present)
        const profileUpdate: Record<string, unknown> = {
            full_name: d.name,
            phone_number: d.phone,
            notify_on_wanted: d.notifyBuy,
            notify_on_available: d.notifySell,
            push_enabled: d.notifyPush,
            sms_enabled: d.notifySms,
            zip_code: d.zipCode,
            country_code: d.country, // ISO 3166-1 alpha-3 (e.g., 'USA')
            home_community_h3_index: d.community?.h3Index,
            nearby_community_h3_indices: d.nearbyCommunities,
            avatar_url: avatarUrl
        }
        
        // Only set invited_by_id if we found an inviter and it's not already set
        if (invitedById) {
          profileUpdate.invited_by_id = invitedById
        }
        
        const { error: profileError } = await supabase
            .from('profiles')
            .update(profileUpdate)
            .eq('id', user.id)

        console.log('🔄 Profile update response:', { profileError })

        if (profileError) {
            console.error('Profile update failed:', profileError)
            throw profileError
        } else {
            console.log('✅ Profile saved to database for user:', user.id)
        }

        // 2.5 Auto-follow inviter (non-blocking — won't fail signup)
        if (invitedById) {
          try {
            const { error: followError } = await supabase
              .from('followers')
              .insert({ follower_id: user.id, followed_id: invitedById })
            if (followError) {
              console.warn('⚠️ Could not auto-follow inviter:', followError)
            } else {
              console.log('👥 Auto-followed inviter:', invitedById)
            }
          } catch (followErr) {
            console.warn('⚠️ Auto-follow failed:', followErr)
          }
        }

        // 3. Create Intro Post
        let introPostCreated = false
        if (d.introText) {
            const { data: introPost, error: postError } = await supabase
                .from('posts')
                .insert({
                    author_id: user.id,
                    community_h3_index: d.community?.h3Index,
                    content: JSON.stringify({ title: 'Hello Neighbors! 👋', description: d.introText }),
                    type: 'general_info',
                    reach: 'community',
                })
                .select('id')
                .single()
            
            if (postError) {
                console.error('Intro post failed:', JSON.stringify(postError), 'message:', postError.message, 'code:', postError.code, 'details:', postError.details, 'hint:', postError.hint)
                // Non-blocking, proceed
            } else {
                introPostCreated = true

                // Upload intro post media if present
                if (introPost && d.mediaUri) {
                    try {
                        const mediaType: 'image' | 'video' = d.mediaType === 'video' ? 'video' : 'image'
                        const uploaded = await uploadPostMedia(user.id, d.mediaUri, mediaType)
                        if (uploaded) {
                            // Insert media_assets row
                            const { data: mediaRow } = await supabase
                                .from('media_assets')
                                .insert({
                                    owner_id: user.id,
                                    storage_path: uploaded.storagePath,
                                    media_type: uploaded.mediaType,
                                    mime_type: uploaded.mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
                                })
                                .select('id')
                                .single()

                            if (mediaRow) {
                                await supabase.from('post_media').insert({
                                    post_id: introPost.id,
                                    media_id: mediaRow.id,
                                    position: 0,
                                })
                                console.log('✅ Intro post media uploaded and linked')
                            }
                        }
                    } catch (mediaErr) {
                        console.warn('⚠️ Intro post media upload failed:', mediaErr)
                    }
                }
            }
        }

        // 3.5 Save Produce Interests
        const allProduce = [
            ...d.produceTags.map(tag => ({ user_id: user.id, produce_name: tag, is_custom: false })),
            ...d.customProduce.map(tag => ({ user_id: user.id, produce_name: tag, is_custom: true })),
        ]
        if (allProduce.length > 0) {
            const { error: produceError } = await supabase
                .from('produce_interests')
                .upsert(allProduce, { onConflict: 'user_id,produce_name' })
            if (produceError) {
                console.warn('⚠️ Could not save produce interests:', produceError)
            } else {
                console.log(`✅ Saved ${allProduce.length} produce interests`)
            }
        }

        // 4. Grant Reward Points (Idempotent)
        // Get current balance first
        const { data: latestLedger } = await supabase
            .from('point_ledger')
            .select('balance_after')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        
        let currentBalance = latestLedger?.balance_after ?? 0

        // 4a. Grant join_a_community reward (if not already granted)
        if (d.community?.h3Index) {
            const { data: existingJoinReward } = await supabase
                .from('point_ledger')
                .select('id')
                .eq('user_id', user.id)
                .eq('type', 'reward')
                .contains('metadata', { action_type: 'join_a_community' })
                .maybeSingle()

            if (!existingJoinReward) {
                const joinPoints = d.community.points || 50
                const newBalance = currentBalance + joinPoints
                const { error: rewardError } = await supabase
                    .from('point_ledger')
                    .insert({
                        user_id: user.id,
                        type: 'reward',
                        amount: joinPoints,
                        balance_after: newBalance,
                        metadata: { 
                            action_type: 'join_a_community', 
                            h3_index: d.community.h3Index 
                        }
                    })
                
                if (!rewardError) {
                    console.log(`🎉 Granted ${joinPoints} points for joining community`)
                    currentBalance = newBalance
                } else {
                    console.error('Failed to grant join reward:', rewardError)
                }
            } else {
                console.log('⏭️ join_a_community reward already granted, skipping')
            }
        }

        // 4b. Grant inviter reward for signup (if we have an inviter)
        if (invitedById) {
            // Check if inviter already got a reward for this user signing up
            const { data: existingInviteReward } = await supabase
                .from('point_ledger')
                .select('id')
                .eq('user_id', invitedById)
                .eq('type', 'reward')
                .contains('metadata', { action_type: 'invitee_signing_up', invitee_id: user.id })
                .maybeSingle()

            if (!existingInviteReward) {
                // Look up the reward amount from incentive_rules
                const { data: inviteRule } = await supabase
                    .from('incentive_rules')
                    .select('points')
                    .eq('action_type', 'invitee_signing_up')
                    .eq('scope', 'global')
                    .maybeSingle()
                
                const invitePoints = inviteRule?.points || 50
                
                // Get inviter's current balance
                const { data: inviterLedger } = await supabase
                    .from('point_ledger')
                    .select('balance_after')
                    .eq('user_id', invitedById)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()
                
                const inviterBalance = inviterLedger?.balance_after ?? 0
                const inviterNewBalance = inviterBalance + invitePoints
                
                const { error: inviterRewardError } = await supabase
                    .from('point_ledger')
                    .insert({
                        user_id: invitedById,
                        type: 'reward',
                        amount: invitePoints,
                        balance_after: inviterNewBalance,
                        metadata: { 
                            action_type: 'invitee_signing_up', 
                            invitee_id: user.id 
                        }
                    })
                
                if (!inviterRewardError) {
                    console.log(`🎉 Granted ${invitePoints} points to inviter ${invitedById} for referral!`)
                } else {
                    console.error('Failed to grant inviter reward:', inviterRewardError)
                }
            } else {
                console.log('⏭️ invitee_signing_up reward already granted to inviter, skipping')
            }
        }

        // 4b. Grant make_first_post reward (if intro post was created and not already granted)
        if (introPostCreated) {
            const { data: existingPostReward } = await supabase
                .from('point_ledger')
                .select('id')
                .eq('user_id', user.id)
                .eq('type', 'reward')
                .contains('metadata', { action_type: 'make_first_post' })
                .maybeSingle()

            if (!existingPostReward) {
                const postPoints = 50 // Could also fetch from incentive_rules
                const newBalance = currentBalance + postPoints
                const { error: rewardError } = await supabase
                    .from('point_ledger')
                    .insert({
                        user_id: user.id,
                        type: 'reward',
                        amount: postPoints,
                        balance_after: newBalance,
                        metadata: { action_type: 'make_first_post' }
                    })
                
                if (!rewardError) {
                    console.log(`🎉 Granted ${postPoints} points for first post`)
                } else {
                    console.error('Failed to grant first post reward:', rewardError)
                }
            } else {
                console.log('⏭️ make_first_post reward already granted, skipping')
            }
        }
        
        return true
     } catch (e) {
         console.error('Save failed', e)
         return false
     } finally {
         setLoading(false)
     }
  }

  const nextStep = () => setStep((s) => Math.min(s + 1, 2))
  const prevStep = () => setStep((s) => Math.max(s - 1, 0))

  return (
    <WizardContext.Provider value={{ step, data, setStep, updateData, nextStep, prevStep, saveProfile, loading }}>
      {children}
    </WizardContext.Provider>
  )
}

export const useWizard = () => {
  const context = useContext(WizardContext)
  if (!context) throw new Error('useWizard must be used within WizardProvider')
  return context
}
