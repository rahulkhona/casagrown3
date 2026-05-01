'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import { useSearchParams } from 'next/navigation'

export interface WizardState {
  // Step 1
  photos: string[];
  name: string;
  category: string;
  description: string;
  email: string;
  
  // Step 2
  quantity: string;
  address: string;
  city: string;
  state_code: string;
  offersDelivery: boolean;
  offersPickup: boolean;
  deliveryRadius: number;
  pickupAddress: string;
  selectedDates: string[]; 
  deliveryWindows: Record<string, string[]>;
  pickupWindows: Record<string, string[]>;
  harvestedAt: string;
  
  // Step 3
  priceUsd: string;
  unit: string;
  isFree: boolean;
  
  // Step 4
  fullName: string;
  
  // Step 5
  phoneNumber: string;
  smsEnabled: boolean;
  pushEnabled: boolean;
  agreedToTos: boolean;
  
  // Control
  currentStep: number;
  isExistingUser: boolean | null;
  isPublished: boolean;
  publishedProductId: string | null;
}

const defaultState: WizardState = {
  photos: [],
  name: '',
  category: '',
  description: '',
  email: '',
  quantity: '',
  address: '',
  city: '',
  state_code: '',
  offersDelivery: true,
  offersPickup: true,
  deliveryRadius: 5,
  pickupAddress: '',
  selectedDates: [],
  deliveryWindows: {},
  pickupWindows: {},
  harvestedAt: '',
  priceUsd: '',
  unit: 'each',
  isFree: false,
  fullName: '',
  phoneNumber: '',
  smsEnabled: true,
  pushEnabled: false,
  agreedToTos: false,
  currentStep: 1,
  isExistingUser: null,
  isPublished: false,
  publishedProductId: null,
}

interface WizardContextType {
  state: WizardState;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  updateState: (updates: Partial<WizardState> | ((prev: WizardState) => Partial<WizardState>)) => void;
  nextStep: () => void;
  prevStep: () => void;
  resetWizard: () => void;
  saveProductToDatabase: (isDraft: boolean) => Promise<string | null>;
}

const WizardContext = createContext<WizardContextType | undefined>(undefined)



export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(defaultState)
  const { user, loading, refresh } = useAuth()
  
  const isAuthenticated = !!user
  const isAuthLoading = loading
  const searchParams = useSearchParams()

  // Initialize from URL parameters
  useEffect(() => {
    const urlEmail = searchParams.get('email')
    const urlName = searchParams.get('name')
    const urlPhone = searchParams.get('phone')
    
    if (urlEmail || urlName || urlPhone) {
      updateState(prev => ({
        ...prev,
        email: urlEmail || prev.email,
        fullName: urlName || prev.fullName,
        phoneNumber: urlPhone || prev.phoneNumber,
      }))
    }
  }, [searchParams])

  // Sync logged in user email if available
  useEffect(() => {
    if (user?.email && !state.email) {
      updateState({ email: user.email })
    }
  }, [user])

  // Auth is handled globally via useAuth, no local sync needed



  const updateState = (updates: Partial<WizardState> | ((prev: WizardState) => Partial<WizardState>)) => {
    setState((prev) => {
      const nextUpdates = typeof updates === 'function' ? updates(prev) : updates
      return { ...prev, ...nextUpdates }
    })
  }

  const nextStep = () => {
    setState((prev) => {
      let next = prev.currentStep + 1
      if (next === 4 && (isAuthenticated || prev.isExistingUser)) {
        next = 5
      }
      return { ...prev, currentStep: Math.min(6, next) }
    })
  }

  const prevStep = () => {
    setState((prev) => {
      let prevVal = prev.currentStep - 1
      if (prevVal === 4 && (isAuthenticated || prev.isExistingUser)) {
        prevVal = 3
      }
      return { ...prev, currentStep: Math.max(1, prevVal) }
    })
  }

  const resetWizard = () => {
    setState(defaultState)

  }

  const mapInlineWindows = (ids: string[]) => {
    return ids.map(id => {
      const [start] = id.split('-')
      return { id, start: `${start}:00`, end: `${parseInt(start) + 2}:00` }
    })
  }

  const saveProductToDatabase = async (isDraft: boolean): Promise<string | null> => {
    const supabase = createClient()
    
    // Record ToS agreement if not a draft
    if (!isDraft && state.agreedToTos) {
      await supabase.auth.updateUser({
        data: {
          agreed_to_tos: true,
          agreed_to_tos_at: new Date().toISOString()
        }
      })
    }
    
    try {
      const { data: userData } = await supabase.auth.getUser()
      const authUser = userData.user
      if (!authUser) throw new Error('Not authenticated')

      // Update profile if publishing so user is fully onboarded
      if (!isDraft) {
        let zipCode = ''
        let stateCode = ''
        let city = ''
        let street = state.address || ''
        
        const parts = state.address?.split(',') || []
        if (parts.length >= 3) {
          street = parts.slice(0, -2).join(',').trim()
          city = parts[parts.length - 2].trim()
          const stateZip = parts[parts.length - 1].trim().split(' ')
          if (stateZip.length >= 2) {
            stateCode = stateZip[0]
            zipCode = stateZip[1]
          }
        }

        const profileUpdate: any = {
          tos_accepted_at: state.agreedToTos ? new Date().toISOString() : undefined,
          full_name: state.fullName || undefined,
          phone_number: state.phoneNumber ? (state.phoneNumber.startsWith('+') ? state.phoneNumber : `+1${state.phoneNumber.replace(/\D/g, '')}`) : undefined,
          profile_completed_at: new Date().toISOString(),
        }
        
        if (street) profileUpdate.street_address = street
        if (city) profileUpdate.city = city
        if (stateCode) profileUpdate.state_code = stateCode
        if (zipCode) {
          profileUpdate.zip_code = zipCode.split('-')[0]
          profileUpdate.zip_plus4 = zipCode
        }

        await supabase.from('profiles').update(profileUpdate).eq('id', authUser.id)
      }

      // ── 1. Ensure a booth exists (auto-create if needed) ──
      let boothId: string | null = null
      const { data: existingBooth } = await supabase
        .from('market_booths')
        .select('id')
        .eq('owner_id', authUser.id)
        .single()

      if (existingBooth) {
        boothId = existingBooth.id
      } else {
        const boothName = state.fullName ? `${state.fullName}'s Produce Stand` : 'My Produce Stand'

        const autoWeeklyDw: Record<string, any[]> = {}
        const autoWeeklyPw: Record<string, any[]> = {}
        
        const flatDw: any[] = []
        const flatPw: any[] = []
        
        // Flatten the windows from the selected dates
        state.selectedDates.forEach(date => {
          if (state.offersDelivery && state.deliveryWindows[date]) {
            const mapped = mapInlineWindows(state.deliveryWindows[date])
            flatDw.push(...mapped)
            
            // Format date for weekly defaults
            const dayKey = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
            autoWeeklyDw[dayKey] = autoWeeklyDw[dayKey] ? [...autoWeeklyDw[dayKey], ...mapped] : mapped
          }
          if (state.offersPickup && state.pickupWindows[date]) {
            const mapped = mapInlineWindows(state.pickupWindows[date])
            flatPw.push(...mapped)
            
            // Format date for weekly defaults
            const dayKey = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
            autoWeeklyPw[dayKey] = autoWeeklyPw[dayKey] ? [...autoWeeklyPw[dayKey], ...mapped] : mapped
          }
        })

        const { data: newBooth, error: boothErr } = await supabase
          .from('market_booths')
          .insert({
            owner_id: authUser.id,
            name: boothName,
            status: 'published',
            offers_delivery: state.offersDelivery,
            offers_pickup: state.offersPickup,
            delivery_radius_miles: state.deliveryRadius,
            pickup_address: state.offersPickup ? state.pickupAddress || null : null,
            delivery_windows: flatDw,
            pickup_windows: flatPw,
            weekly_delivery_windows: autoWeeklyDw,
            weekly_pickup_windows: autoWeeklyPw,
            payment_method: 'automatic',
            decorative_theme: 'floral',
          })
          .select()
          .single()

        if (boothErr || !newBooth) throw new Error('Failed to create booth: ' + (boothErr?.message || 'unknown error'))
        boothId = newBooth.id
      }

      // ── 2. Upload photos to storage ──
      const uploadedPhotoUrls: string[] = []
      for (let i = 0; i < state.photos.length; i++) {
        const photoData = state.photos[i]
        try {
          const res = await fetch(photoData)
          const blob = await res.blob()
          const ext = blob.type.includes('png') ? 'png' : 'jpg'
          const path = `${authUser.id}/${Date.now()}_${i}.${ext}`
          const { error: uploadErr } = await supabase.storage.from('product-photos').upload(path, blob, { upsert: true })
          if (uploadErr) throw uploadErr
          const { data: urlData } = supabase.storage.from('product-photos').getPublicUrl(path)
          if (urlData?.publicUrl) uploadedPhotoUrls.push(urlData.publicUrl)
        } catch (err: any) {
          throw new Error('Photo upload failed: ' + err.message)
        }
      }

      // ── 3. Insert product ──
      let expiresAt = null
      if (state.selectedDates.length > 0) {
        const maxDateStr = state.selectedDates.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
        const maxDate = new Date(maxDateStr + 'T23:59:59')
        expiresAt = maxDate.toISOString()
      }

      const { data: insertedProduct, error: prodErr } = await supabase
        .from('market_products')
        .insert({
          seller_id: authUser.id,
          market_date: state.selectedDates.length > 0 ? state.selectedDates[0] : new Date().toISOString().split('T')[0],
          name: state.name.trim() || 'Untitled Draft',
          description: state.description.trim() || null,
          category: state.category || 'produce',
          price_usd: parseFloat(state.priceUsd || '0'),
          unit: state.unit || 'each',
          inventory: parseInt(state.quantity) || 0,
          photos: uploadedPhotoUrls,
          harvested_at: state.harvestedAt ? new Date(state.harvestedAt + 'T12:00:00').toISOString() : null,
          expires_at: expiresAt,
          is_active: !isDraft,
          is_draft: isDraft,
          delivery_radius_miles: state.deliveryRadius,
          pickup_address: state.offersPickup ? state.pickupAddress || null : null,
          product_delivery_windows: !state.offersDelivery ? null : (() => {
            const obj: Record<string, any[]> = {}
            for (const d of state.selectedDates) {
              const ids = state.deliveryWindows[d] || []
              if (ids.length > 0) obj[d] = mapInlineWindows(ids)
            }
            return Object.keys(obj).length > 0 ? obj : null
          })(),
          product_pickup_windows: !state.offersPickup ? null : (() => {
            const obj: Record<string, any[]> = {}
            for (const d of state.selectedDates) {
              const ids = state.pickupWindows[d] || []
              if (ids.length > 0) obj[d] = mapInlineWindows(ids)
            }
            return Object.keys(obj).length > 0 ? obj : null
          })(),
          window_dates: state.selectedDates,
        })
        .select('id')
        .single()

      if (prodErr || !insertedProduct) throw new Error('Failed to add product: ' + (prodErr?.message || 'Unknown error'))

      // ── 4. AI Moderation (skip blocking) ──
      if (!isDraft) {
        supabase.functions.invoke('moderate-listing', {
          body: {
            product_id: insertedProduct.id,
            seller_id: authUser.id,
            name: state.name.trim() || 'Untitled',
            description: state.description.trim() || null,
            price_usd: parseFloat(state.priceUsd || '0'),
            category: state.category || 'produce',
            photo_url: uploadedPhotoUrls[0] || null,
          },
        }).catch(() => {}) // non-blocking
      }

      if (!isDraft) {
        updateState({ isPublished: true, publishedProductId: insertedProduct.id })
      }
      
      // Refresh the global auth cache before finishing to prevent stale state redirects
      if (refresh) await refresh()
      
      return insertedProduct.id
    } catch (err: any) {
      console.error(err)
      throw err
    }
  }

  return (
    <WizardContext.Provider value={{ state, isAuthenticated, isAuthLoading, updateState, nextStep, prevStep, resetWizard, saveProductToDatabase }}>
      {children}
    </WizardContext.Provider>
  )
}

export function useWizard() {
  const context = useContext(WizardContext)
  if (context === undefined) {
    throw new Error('useWizard must be used within a WizardProvider')
  }
  return context
}
