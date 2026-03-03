import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Platform } from 'react-native'
import { useRouter } from 'solito/navigation'
import { useAuth, supabase } from '../auth/auth-hook'
import { uploadProfileAvatar } from './utils/media-upload'

// ────────────────────────────────────────────────────────────
// Step 1: Account & Address (mandatory)
// Step 2: Personalize (optional / skippable)
// ────────────────────────────────────────────────────────────

export type WizardData = {
  // ─── Step 1: Account & Address ───
  avatar?: string
  avatarUri?: string
  name: string
  email: string
  emailVerified: boolean

  streetAddress: string
  city: string
  stateCode: string
  zipCode: string
  zipPlus4?: string               // inferred 9-digit ZIP

  phone?: string
  phoneVerified: boolean

  // Auto-resolved from address
  country: string                  // ISO 3166-1 alpha-3
  location?: { lat: number; lng: number }
  community?: {
    h3Index: string
    name: string
  }
  nearbyCommunities: string[]

  // ─── Step 2: Personalize ───
  gardenItems: string[]            // selected from catalog
  customGardenItems: string[]      // user-added
  smsDigest: boolean               // daily SMS digest (only if phone verified)

  // ─── Campaign points (read-only, fetched) ───
  campaignPoints: Record<string, number>  // behavior → points
}

const defaultData: WizardData = {
  name: '',
  email: '',
  emailVerified: false,
  streetAddress: '',
  city: '',
  stateCode: '',
  zipCode: '',
  phone: '',
  phoneVerified: false,
  country: 'USA',
  nearbyCommunities: [],
  gardenItems: [],
  customGardenItems: [],
  smsDigest: false,
  campaignPoints: {},
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
  initializing: boolean
}

const WizardContext = createContext<WizardContextType | null>(null)

export const WizardProvider = ({ children }: { children: ReactNode }) => {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>(defaultData)
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const { user } = useAuth()

  // On mount: fetch existing profile data and campaign points
  useEffect(() => {
    const loadExistingProfile = async () => {
      if (!user) {
        setInitializing(false)
        return
      }

      // Reset to defaults before loading — prevents stale data from previous user
      setData(defaultData)
      setStep(0)

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select(`
            full_name, avatar_url, email, phone_number,
            email_verified, phone_verified,
            street_address, city, state_code, zip_code, zip_plus4,
            country_code, home_community_h3_index,
            nearby_community_h3_indices, sms_enabled,
            profile_completed_at
          `)
          .eq('id', user.id)
          .single()

        if (profile) {
          const updates: Partial<WizardData> = {}

          if (profile.full_name) updates.name = profile.full_name
          if (profile.avatar_url) updates.avatar = profile.avatar_url
          if (profile.email) updates.email = profile.email
          if (profile.phone_number) updates.phone = profile.phone_number
          updates.emailVerified = profile.email_verified ?? false
          updates.phoneVerified = profile.phone_verified ?? false
          if (profile.street_address) updates.streetAddress = profile.street_address
          if (profile.city) updates.city = profile.city
          if (profile.state_code) updates.stateCode = profile.state_code
          if (profile.zip_code) updates.zipCode = profile.zip_code
          if (profile.zip_plus4) updates.zipPlus4 = profile.zip_plus4
          if (profile.country_code) updates.country = profile.country_code
          if (profile.nearby_community_h3_indices) updates.nearbyCommunities = profile.nearby_community_h3_indices
          updates.smsDigest = profile.sms_enabled ?? false

          // If community is set, fetch its name
          if (profile.home_community_h3_index) {
            const { data: community } = await supabase
              .from('communities')
              .select('h3_index, name')
              .eq('h3_index', profile.home_community_h3_index)
              .single()

            if (community) {
              updates.community = {
                h3Index: community.h3_index,
                name: community.name,
              }
            }
          }

          setData(prev => ({ ...prev, ...updates }))

          // Determine starting step
          if (profile.profile_completed_at) {
            // Already completed wizard — go to step 1 (personalize)
            setStep(1)
          } else if (profile.full_name && profile.street_address) {
            // Step 1 done → start at step 1 (personalize)
            setStep(1)
          }
          // else: start at step 0 (default)
        }
      } catch (err) {
        console.warn('⚠️ [Wizard] Could not load existing profile:', err)
      }

      // Pre-populate from auth metadata (social login)
      if (user.user_metadata?.full_name) {
        setData(prev => ({
          ...prev,
          name: prev.name || user.user_metadata.full_name || '',
          avatar: prev.avatar || user.user_metadata.avatar_url || undefined,
        }))
      }
      if (user.email) {
        setData(prev => ({
          ...prev,
          email: prev.email || user.email || '',
        }))
      }

      // Fetch campaign reward points for display
      try {
        const { data: rewards } = await supabase
          .from('campaign_rewards')
          .select('behavior, points, campaign_id, incentive_campaigns!inner(is_active, starts_at, ends_at)')
          .eq('incentive_campaigns.is_active', true)
          .lte('incentive_campaigns.starts_at', new Date().toISOString())
          .gte('incentive_campaigns.ends_at', new Date().toISOString())

        if (rewards && rewards.length > 0) {
          // Group by behavior, pick latest campaign (highest points or first match)
          const pointsMap: Record<string, number> = {}
          for (const r of rewards) {
            if (!pointsMap[r.behavior] || r.points > pointsMap[r.behavior]) {
              pointsMap[r.behavior] = r.points
            }
          }
          setData(prev => ({ ...prev, campaignPoints: pointsMap }))
        }
      } catch (err) {
        console.warn('⚠️ [Wizard] Could not fetch campaign rewards:', err)
      }

      setInitializing(false)
    }

    loadExistingProfile()
  }, [user])

  const updateData = (updates: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...updates }))
  }

  const saveProfile = async (overrides?: Partial<WizardData>) => {
    if (!user) return false
    setLoading(true)
    const d = overrides ? { ...data, ...overrides } : data
    console.log('💾 [Wizard] Saving Profile...', d)

    try {
      // 0. Check for referral code
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
          }

          // Clear after use
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

      // 1. Upload Avatar if local URI
      let avatarUrl = d.avatar
      const isLocalUri = d.avatar && (
        d.avatar.startsWith('file') ||
        d.avatar.startsWith('blob') ||
        d.avatar.startsWith('data:')
      )
      if (isLocalUri && d.avatar) {
        console.log('📤 Uploading avatar...')
        const uploadedUrl = await uploadProfileAvatar(user.id, d.avatar)
        if (uploadedUrl) {
          avatarUrl = uploadedUrl
        }
      }

      // 1.5 Ensure Community exists in DB before FK link
      if (d.community?.h3Index) {
        const { error: communityError } = await supabase
          .from('communities')
          .upsert({
            h3_index: d.community.h3Index,
            name: d.community.name,
          }, { onConflict: 'h3_index' })

        if (communityError) {
          console.warn('⚠️ Could not upsert community:', communityError)
        }
      }

      // 2. Update Profile
      const profileUpdate: Record<string, unknown> = {
        full_name: d.name,
        phone_number: d.phone || null,
        street_address: d.streetAddress || null,
        city: d.city || null,
        state_code: d.stateCode || null,
        zip_code: d.zipCode || null,
        zip_plus4: d.zipPlus4 || null,
        country_code: d.country,
        home_community_h3_index: d.community?.h3Index || null,
        nearby_community_h3_indices: d.nearbyCommunities,
        avatar_url: avatarUrl,
        sms_enabled: d.smsDigest,
        profile_completed_at: new Date().toISOString(),
      }

      if (invitedById) {
        profileUpdate.invited_by_id = invitedById
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', user.id)

      if (profileError) {
        console.error('Profile update failed:', profileError)
        throw profileError
      }
      console.log('✅ Profile saved')

      // 2.5 Auto-follow inviter
      if (invitedById) {
        try {
          await supabase
            .from('followers')
            .insert({ follower_id: user.id, followed_id: invitedById })
        } catch (followErr) {
          console.warn('⚠️ Auto-follow failed:', followErr)
        }
      }

      // 3. Save Garden Items
      const allGarden = [
        ...d.gardenItems.map(name => ({ user_id: user.id, produce_name: name, is_custom: false })),
        ...d.customGardenItems.map(name => ({ user_id: user.id, produce_name: name, is_custom: true })),
      ]
      if (allGarden.length > 0) {
        const { error: gardenError } = await supabase
          .from('user_garden')
          .upsert(allGarden, { onConflict: 'user_id,produce_name' })
        if (gardenError) {
          console.warn('⚠️ Could not save garden items:', gardenError)
        } else {
          console.log(`✅ Saved ${allGarden.length} garden items`)
        }
      }

      // 4. Grant Campaign Rewards (idempotent)
      const { data: latestLedger } = await supabase
        .from('point_ledger')
        .select('balance_after')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let currentBalance = latestLedger?.balance_after ?? 0

      // 4a. Grant join_a_community reward
      if (d.community?.h3Index) {
        const { data: existingJoinReward } = await supabase
          .from('point_ledger')
          .select('id')
          .eq('user_id', user.id)
          .eq('type', 'reward')
          .contains('metadata', { action_type: 'join_a_community' })
          .maybeSingle()

        if (!existingJoinReward) {
          const joinPoints = d.campaignPoints['signup'] || 50
          const { error: rewardError } = await supabase
            .from('point_ledger')
            .insert({
              user_id: user.id,
              type: 'reward',
              amount: joinPoints,
              balance_after: 0, // trigger computes
              metadata: {
                action_type: 'join_a_community',
                h3_index: d.community.h3Index,
              }
            })

          if (!rewardError) {
            console.log(`🎉 Granted ${joinPoints} points for joining community`)
            currentBalance += joinPoints
          }
        }
      }

      // 4b. Grant inviter referral reward
      if (invitedById) {
        const { data: existingInviteReward } = await supabase
          .from('point_ledger')
          .select('id')
          .eq('user_id', invitedById)
          .eq('type', 'reward')
          .contains('metadata', { action_type: 'invitee_signing_up', invitee_id: user.id })
          .maybeSingle()

        if (!existingInviteReward) {
          const referralPoints = d.campaignPoints['per_referral'] || 50

          const { error: inviterRewardError } = await supabase
            .from('point_ledger')
            .insert({
              user_id: invitedById,
              type: 'reward',
              amount: referralPoints,
              balance_after: 0, // trigger computes
              metadata: {
                action_type: 'invitee_signing_up',
                invitee_id: user.id,
              }
            })

          if (!inviterRewardError) {
            console.log(`🎉 Granted ${referralPoints} points to inviter for referral`)
          }
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

  const nextStep = () => setStep((s) => Math.min(s + 1, 1))
  const prevStep = () => setStep((s) => Math.max(s - 1, 0))

  return (
    <WizardContext.Provider value={{ step, data, setStep, updateData, nextStep, prevStep, saveProfile, loading, initializing }}>
      {children}
    </WizardContext.Provider>
  )
}

export const useWizard = () => {
  const context = useContext(WizardContext)
  if (!context) throw new Error('useWizard must be used within WizardProvider')
  return context
}
