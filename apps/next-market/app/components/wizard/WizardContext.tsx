'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import { useSearchParams } from 'next/navigation'

import { normalizeStateCode, validateProfileFields } from '../../../lib/address'

export interface QuarantineInfo {
  pest_name: string;
  county_name: string;
  source_url: string;
  reason?: string;
}

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
  deliveryZipcodes: string[];
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
  
  // Stand / Catalog
  boothId: string | null;
  catalogItemId: string | null;

  // Control
  currentStep: number;
  isExistingUser: boolean | null;
  isPublished: boolean;
  publishedProductId: string | null;
  quarantineInfo: QuarantineInfo | null;
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
  deliveryZipcodes: [],
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
  boothId: null,
  catalogItemId: null,
  currentStep: 1,
  isExistingUser: null,
  isPublished: false,
  publishedProductId: null,
  quarantineInfo: null,
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
  checkQuarantine: () => Promise<void>;
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

  // Sync logged in user profile details if available
  useEffect(() => {
    if (!user?.id) return

    const supabase = createClient()
    
    // Fetch profile
    supabase.from('profiles')
      .select('email, full_name, street_address, city, state_code, zip_code, phone_number, profile_completed_at, tos_accepted_at')
      .eq('id', user.id)
      .single()
      .then((res: any) => {
        const profile = res.data
        if (profile) {
          updateState(prev => {
            const updates: Partial<WizardState> = {}
            if ((user.email || profile.email) && !prev.email) updates.email = user.email || profile.email
            if (profile.full_name && !prev.fullName) updates.fullName = profile.full_name
            if (profile.street_address && !prev.address) {
              updates.address = [profile.street_address, profile.city, `${profile.state_code || ''} ${profile.zip_code || ''}`.trim()].filter(Boolean).join(', ')
            }
            if (profile.city && !prev.city) updates.city = profile.city
            if (profile.state_code && !prev.state_code) updates.state_code = profile.state_code
            if (profile.phone_number && !prev.phoneNumber) updates.phoneNumber = profile.phone_number
            
            // A user has completed setup if they have a completed profile and accepted the ToS
            updates.isExistingUser = !!(profile.profile_completed_at && profile.tos_accepted_at)
            
            return updates
          })
        } else {
          updateState({ isExistingUser: false })
        }
      })
  }, [user])

  // Auth is handled globally via useAuth, no local sync needed



  const checkQuarantine = async () => {
    if (!state.category) {
      updateState({ quarantineInfo: null });
      return;
    }
    
    // Parse zip from address
    let zipCode = '';
    const parts = state.address?.split(',') || [];
    if (parts.length >= 3) {
      const stateZip = parts[parts.length - 1].trim().split(' ');
      if (stateZip.length >= 2) {
        zipCode = stateZip[1].split('-')[0];
      }
    }
    
    const supabase = createClient();
    let authUserId = user?.id;
    if (!authUserId) {
      const { data } = await supabase.auth.getUser();
      authUserId = data?.user?.id;
    }

    if (!authUserId && !zipCode) {
      updateState({ quarantineInfo: null });
      return;
    }

    const { data } = await supabase.rpc('check_quarantine_for_seller', { 
      p_seller_id: authUserId || '00000000-0000-0000-0000-000000000000', // Need UUID type for fallback
      p_category: state.category,
      p_override_zip: zipCode || null
    });

    if (data && data.length > 0) {
      updateState({ 
        quarantineInfo: { 
          pest_name: data[0].pest_name, 
          county_name: data[0].county_name, 
          source_url: data[0].source_url,
          reason: data[0].reason
        } 
      });
    } else {
      updateState({ quarantineInfo: null });
    }
  };

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

      // Decompose address fields from state.address
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
          stateCode = normalizeStateCode(stateZip[0])
          zipCode = stateZip[1]
        }
      }

      // Fallback: extract zip from anywhere in the address via regex
      if (!zipCode && state.address) {
        const zipMatch = state.address.match(/\b(\d{5}(?:-\d{4})?)\b/)
        if (zipMatch) zipCode = zipMatch[1]
      }
      // Fallback: extract state code via regex (e.g. ", CA " or " CA ")
      if (!stateCode && state.address) {
        const stMatch = state.address.match(/\b([A-Z]{2})\b/)
        if (stMatch) stateCode = normalizeStateCode(stMatch[1])
      }

      // Update profile if publishing so user is fully onboarded
      if (!isDraft) {
        // ── Required field validation ──
        const profileError = validateProfileFields({
          fullName: state.fullName,
          street: street,
          city: city,
          state: stateCode,
          zip: zipCode,
        })
        if (profileError) {
          throw new Error(profileError)
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
      let boothId: string | null = state.boothId || null

      if (!boothId) {
        // No stand selected in wizard — check if user has any existing stand
        const { data: existingBooth } = await supabase
          .from('market_booths')
          .select('id, name')
          .eq('owner_id', authUser.id)
          .limit(1)
          .single()

        if (existingBooth) {
          boothId = existingBooth.id
        } else {
          // Auto-create a stand — try create_stand RPC first, fallback to direct insert
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

          // Decompose pickup address
          const boothStr = state.address || ''
          const pickupStr = state.offersPickup && state.pickupAddress ? state.pickupAddress : boothStr
          
          let pickupStreet = ''
          let pickupCity = ''
          let pickupState = ''
          let pickupZip = ''
          
          const pParts = pickupStr.split(',').map((s: string) => s.trim())
          if (pParts.length >= 3) {
            pickupStreet = pParts.slice(0, -2).join(', ').trim()
            pickupCity = pParts[pParts.length - 2].trim()
            const sz = pParts[pParts.length - 1].trim().split(/\s+/)
            pickupState = sz[0] || ''
            pickupZip = sz.slice(1).join(' ').trim()
          } else if (pParts.length === 2) {
            pickupStreet = pParts[0]
            pickupCity = pParts[1]
          } else {
            pickupStreet = pickupStr
          }

          let boothLocation: any = null
          let pickupLocation: any = null

          try {
            const { geocodeAddress, toPostgisPoint } = await import('../../../lib/geocode')
            if (boothStr) {
              const geo = await geocodeAddress(boothStr)
              if (geo) {
                boothLocation = toPostgisPoint(geo.lat, geo.lng)
                pickupLocation = toPostgisPoint(geo.lat, geo.lng)
              }
            }
            if (pickupStr && pickupStr !== boothStr) {
              const geo = await geocodeAddress(pickupStr)
              if (geo) {
                pickupLocation = toPostgisPoint(geo.lat, geo.lng)
              }
            }
          } catch (err) {
            console.warn('Geocoding failed during booth auto-creation:', err)
          }

          const boothUpdatePayload: any = {
            offers_delivery: state.offersDelivery,
            offers_pickup: state.offersPickup,
            delivery_radius_miles: state.deliveryRadius,
            booth_address: boothStr || null,
            booth_street: street || null,
            booth_city: city || null,
            booth_state: stateCode || null,
            booth_zip: zipCode ? zipCode.split('-')[0] : null,
            pickup_address: pickupStr || null,
            pickup_street: pickupStreet || null,
            pickup_city: pickupCity || null,
            pickup_state: pickupState || null,
            pickup_zip: pickupZip ? pickupZip.split('-')[0] : null,
          }
          if (boothLocation) boothUpdatePayload.booth_location = boothLocation
          if (pickupLocation) boothUpdatePayload.pickup_location = pickupLocation

          // Try create_stand RPC first
          let rpcWorked = false
          try {
            const { data: rpcData, error: rpcErr } = await supabase.rpc('create_stand', {
              p_name: boothName,
            })
            if (!rpcErr && rpcData) {
              boothId = typeof rpcData === 'string' ? rpcData : rpcData.id || rpcData
              rpcWorked = true

              // RPC only sets name — update with fulfillment options
              const { data: updatedData, error: updateErr } = await supabase.from('market_booths').update(boothUpdatePayload).eq('id', boothId).select()
              if (updateErr) {
                throw new Error('Failed to update booth after RPC: ' + updateErr.message)
              }
              if (!updatedData || updatedData.length === 0) {
                throw new Error('Failed to update booth after RPC: no rows updated for ID ' + boothId)
              }
            }
          } catch { /* RPC may not exist yet — fallback below */ }

          if (!rpcWorked) {
            const { data: newBooth, error: boothErr } = await supabase
              .from('market_booths')
              .insert({
                owner_id: authUser.id,
                name: boothName,
                status: 'published',
                offers_delivery: state.offersDelivery,
                offers_pickup: state.offersPickup,
                delivery_radius_miles: state.deliveryRadius,
                booth_address: boothStr || null,
                booth_street: street || null,
                booth_city: city || null,
                booth_state: stateCode || null,
                booth_zip: zipCode ? zipCode.split('-')[0] : null,
                pickup_address: pickupStr || null,
                pickup_street: pickupStreet || null,
                pickup_city: pickupCity || null,
                pickup_state: pickupState || null,
                pickup_zip: pickupZip ? pickupZip.split('-')[0] : null,
                booth_location: boothLocation,
                pickup_location: pickupLocation,
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
        }
      }

      // Fetch existing booth defaults to resolve any missing values
      let boothDefaults: any = null
      if (boothId) {
        const { data: b } = await supabase
          .from('market_booths')
          .select('name, offers_delivery, offers_pickup, delivery_radius_miles, pickup_address, delivery_zipcodes, booth_address, delivery_windows, pickup_windows')
          .eq('id', boothId)
          .single()
        boothDefaults = b

        // If booth exists but has no booth_address configured, we populate all address and fulfillment fields!
        const hasAddressConfigured = b && b.booth_address
        if (!isDraft && !hasAddressConfigured) {
          const autoWeeklyDw: Record<string, any[]> = {}
          const autoWeeklyPw: Record<string, any[]> = {}
          const flatDw: any[] = []
          const flatPw: any[] = []

          state.selectedDates.forEach(date => {
            if (state.offersDelivery && state.deliveryWindows[date]) {
              const mapped = mapInlineWindows(state.deliveryWindows[date])
              flatDw.push(...mapped)
              const dayKey = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
              autoWeeklyDw[dayKey] = autoWeeklyDw[dayKey] ? [...autoWeeklyDw[dayKey], ...mapped] : mapped
            }
            if (state.offersPickup && state.pickupWindows[date]) {
              const mapped = mapInlineWindows(state.pickupWindows[date])
              flatPw.push(...mapped)
              const dayKey = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
              autoWeeklyPw[dayKey] = autoWeeklyPw[dayKey] ? [...autoWeeklyPw[dayKey], ...mapped] : mapped
            }
          })

          // Calculate geocoding
          let boothLocation: any = null
          let pickupLocation: any = null
          const boothStr = state.address || ''
          const pickupStr = state.offersPickup && state.pickupAddress ? state.pickupAddress : boothStr

          try {
            const { geocodeAddress, toPostgisPoint } = await import('../../../lib/geocode')
            if (boothStr) {
              const geo = await geocodeAddress(boothStr)
              if (geo) {
                boothLocation = toPostgisPoint(geo.lat, geo.lng)
                pickupLocation = toPostgisPoint(geo.lat, geo.lng)
              }
            }
            if (pickupStr && pickupStr !== boothStr) {
              const geo = await geocodeAddress(pickupStr)
              if (geo) {
                pickupLocation = toPostgisPoint(geo.lat, geo.lng)
              }
            }
          } catch (err) {
            console.warn('Geocoding failed during booth update:', err)
          }

          let pickupStreet = ''
          let pickupCity = ''
          let pickupState = ''
          let pickupZip = ''
          const pParts = pickupStr.split(',').map((s: string) => s.trim())
          if (pParts.length >= 3) {
            pickupStreet = pParts.slice(0, -2).join(', ').trim()
            pickupCity = pParts[pParts.length - 2].trim()
            const sz = pParts[pParts.length - 1].trim().split(/\s+/)
            pickupState = sz[0] || ''
            pickupZip = sz.slice(1).join(' ').trim()
          } else if (pParts.length === 2) {
            pickupStreet = pParts[0]
            pickupCity = pParts[1]
          } else {
            pickupStreet = pickupStr
          }

          const updatePayload: any = {
            offers_delivery: state.offersDelivery,
            offers_pickup: state.offersPickup,
            delivery_radius_miles: state.deliveryRadius,
            booth_address: boothStr || null,
            booth_street: street || null,
            booth_city: city || null,
            booth_state: stateCode || null,
            booth_zip: zipCode ? zipCode.split('-')[0] : null,
            pickup_address: pickupStr || null,
            pickup_street: pickupStreet || null,
            pickup_city: pickupCity || null,
            pickup_state: pickupState || null,
            pickup_zip: pickupZip ? pickupZip.split('-')[0] : null,
            delivery_windows: flatDw,
            pickup_windows: flatPw,
            weekly_delivery_windows: autoWeeklyDw,
            weekly_pickup_windows: autoWeeklyPw
          }
          if (boothLocation) updatePayload.booth_location = boothLocation
          if (pickupLocation) updatePayload.pickup_location = pickupLocation

          // Also set the stand's name to the correct name instead of placeholder if needed
          if (b && (b.name === "My Booth's Booth" || b.name === "My Stand's Stand" || b.name?.includes('My Booth') || b.name?.includes('My Stand'))) {
            const boothName = state.fullName ? `${state.fullName}'s Produce Stand` : 'My Produce Stand'
            updatePayload.name = boothName
          }

          const { error: updateErr } = await supabase.from('market_booths').update(updatePayload).eq('id', boothId)
          if (updateErr) throw new Error('Failed to update booth address details: ' + updateErr.message)
        }
      }

      const resolvedRadius = state.deliveryRadius !== null && state.deliveryRadius !== undefined
        ? state.deliveryRadius
        : (boothDefaults?.delivery_radius_miles || 5)

      const resolvedPickupAddress = state.offersPickup && state.pickupAddress
        ? state.pickupAddress
        : (boothDefaults?.pickup_address || boothDefaults?.booth_address || state.address || null)

      const resolvedZipcodes = state.deliveryZipcodes && state.deliveryZipcodes.length > 0
        ? state.deliveryZipcodes
        : (boothDefaults?.delivery_zipcodes || [])

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

      const productInsert: Record<string, any> = {
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
          delivery_radius_miles: resolvedRadius,
          pickup_address: state.offersPickup ? resolvedPickupAddress : null,
          delivery_zipcodes: state.offersDelivery && resolvedZipcodes.length > 0 ? resolvedZipcodes : null,
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
      }

      // Include booth_id if resolved
      if (boothId) {
        productInsert.booth_id = boothId
      }

      // Include catalog_item_id if listing is backed by a catalog item
      if (state.catalogItemId) {
        productInsert.catalog_item_id = state.catalogItemId
      }

      const { data: insertedProduct, error: prodErr } = await supabase
        .from('market_products')
        .insert(productInsert)
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
    <WizardContext.Provider value={{ state, isAuthenticated, isAuthLoading, updateState, nextStep, prevStep, resetWizard, saveProductToDatabase, checkQuarantine }}>
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
