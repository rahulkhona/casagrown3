import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Platform } from 'react-native'
import { useRouter } from 'solito/navigation'
import { useAuth, supabase } from '../auth/auth-hook'
import { uploadProfileAvatar } from './utils/media-upload'

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
  saveProfile: () => Promise<boolean>
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

   const saveProfile = async () => {
     if (!user) return false
     setLoading(true)
     console.log('💾 [Wizard] Saving Profile to Supabase...', data)
     
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
        let avatarUrl = data.avatar
        const isLocalUri = data.avatar && (
            data.avatar.startsWith('file') || 
            data.avatar.startsWith('blob') || 
            data.avatar.startsWith('data:')
        )
        if (isLocalUri && data.avatar) {
             console.log('📤 Uploading avatar:', data.avatar.substring(0, 50) + '...')
             const uploadedUrl = await uploadProfileAvatar(user.id, data.avatar)
             if (uploadedUrl) {
                 console.log('✅ Avatar uploaded:', uploadedUrl)
                 avatarUrl = uploadedUrl
             } else {
                 console.warn('⚠️ Avatar upload returned null, keeping local URI')
             }
        }

        // 2. Update Profile (including invited_by_id if present)
        const profileUpdate: Record<string, unknown> = {
            full_name: data.name,
            phone_number: data.phone,
            notify_on_wanted: data.notifyBuy,
            notify_on_available: data.notifySell,
            push_enabled: data.notifyPush,
            sms_enabled: data.notifySms,
            zip_code: data.zipCode,
            country_code: data.country, // ISO 3166-1 alpha-3 (e.g., 'USA')
            home_community_h3_index: data.community?.h3Index,
            nearby_community_h3_indices: data.nearbyCommunities,
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
        if (data.introText) {
            const { error: postError } = await supabase
                .from('posts')
                .insert({
                    user_id: user.id,
                    community_h3_index: data.community?.h3Index,
                    title: 'Hello Neighbors! 👋',
                    content: data.introText,
                    type: 'general', // or 'intro' if enum supports
                    tags: [...data.produceTags, ...data.customProduce],
                    // media_urls: ... upload mediaUri if present (separate bucket/logic needed usually)
                })
            
            if (postError) {
                console.error('Intro post failed:', postError)
                // Non-blocking, proceed
            } else {
                introPostCreated = true
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
        if (data.community?.h3Index) {
            const { data: existingJoinReward } = await supabase
                .from('point_ledger')
                .select('id')
                .eq('user_id', user.id)
                .eq('type', 'reward')
                .contains('metadata', { action_type: 'join_a_community' })
                .maybeSingle()

            if (!existingJoinReward) {
                const joinPoints = data.community.points || 50
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
                            h3_index: data.community.h3Index 
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
