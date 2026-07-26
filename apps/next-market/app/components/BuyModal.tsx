'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { formatUsd } from '../../lib/store'
import { trackClick, trackError } from '../../lib/analytics'
import { useNotificationPrompt } from '../../lib/useNotificationPrompt'
import { useMarketStatus } from '../../lib/useMarketStatus'
import { hasValidWindows } from '../../lib/windowUtils'
import { NotificationPromptModal } from './NotificationPromptModal'
import AddressInput from './AddressInput'
import { type AddressFields, formatFullAddress, EMPTY_ADDRESS } from '../../lib/address'
import styles from './BuyModal.module.css'

interface BuyModalProps {
  product: {
    id: string; name: string; price_usd: number; unit: string;
    inventory: number; category: string; photos?: string[]; market_date?: string; expires_at?: string; created_at?: string;
    window_dates?: any[]; product_delivery_windows?: any[] | null; product_pickup_windows?: any[] | null
  }
  booth: {
    id: string; name: string; offers_delivery: boolean; offers_pickup: boolean;
    pickup_address?: string; pickup_display_address?: string; delivery_radius_miles?: number;
    pickup_zip?: string; pickup_state?: string; booth_zip?: string; booth_state?: string;
  }
  buyerZip?: string;
  buyerAddress?: string;
  onClose: () => void;
  onSuccess: (order: any) => void;
}

export default function BuyModal({ product, booth, buyerZip, buyerAddress, onClose, onSuccess }: BuyModalProps) {
  const supabase = createClient()
  const { user } = useAuth()
  const [qty, setQty] = useState(1)
  const [productRadius, setProductRadius] = useState<number | null>(null)
  const [productPickupAddress, setProductPickupAddress] = useState<string | null>(null)

  // Fulfillment: null = seller didn't enable this for the product; non-null = enabled
  const productOffersPickup = product?.product_pickup_windows != null
  const productOffersDelivery = product?.product_delivery_windows != null

  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>(
    productOffersPickup ? 'pickup' : 'delivery'
  )
  const [available, setAvailable] = useState(product.inventory)
  const [currentPrice, setCurrentPrice] = useState(product.price_usd)

  const [buyerZipState, setBuyerZipState] = useState(buyerZip || '')
  const [deliveryAddressFields, setDeliveryAddressFields] = useState<AddressFields>(() => {
    if (buyerAddress) {
      const parts = buyerAddress.split(',').map(s => s.trim())
      if (parts.length >= 3) {
        const stateZip = parts[parts.length - 1].split(/\s+/)
        return { street: parts.slice(0, -2).join(', '), city: parts[parts.length - 2], state: stateZip[0] || '', zip: stateZip.slice(1).join(' ') || buyerZip || '' }
      }
    }
    return { street: buyerAddress || '', city: '', state: '', zip: buyerZip || '' }
  })
  const [deliveryAddress, setDeliveryAddress] = useState(buyerAddress || '')
  const [deliveryInstructions, setDeliveryInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [taxInfo, setTaxInfo] = useState<{ rate: number; amount: number } | null>(null)
  const [stripeReady, setStripeReady] = useState(false)
  const cardElementRef = useRef<any>(null)
  const addressElementRef = useRef<any>(null)
  const stripeRef = useRef<any>(null)
  const orderBusyRef = useRef(false) // BUG-3: Prevent double-click race
  const [availableBalance, setAvailableBalance] = useState(0) // buyer's available USD balance

  // Push notification prompt
  const { showPrompt, modalProps } = useNotificationPrompt(user?.id)

  // Pre-fill address from user's profile if available
  useEffect(() => {
    if (!user?.id) return
    const fetchProfileAddress = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('street_address, city, state, zip_code')
        .eq('id', user.id)
        .single()
      if (data) {
        setDeliveryAddressFields(prev => ({
          street: prev.street || data.street_address || '',
          city: prev.city || data.city || '',
          state: prev.state || data.state || '',
          zip: prev.zip || data.zip_code || buyerZip || ''
        }))
        if (data.street_address || data.city) {
          const full = formatFullAddress({
            street: data.street_address || '',
            city: data.city || '',
            state: data.state || '',
            zip: data.zip_code || buyerZip || ''
          })
          setDeliveryAddress(prev => prev || full)
        }
        if (data.zip_code) {
          setBuyerZipState(prev => prev || data.zip_code)
        }
      }
    }
    fetchProfileAddress()
  }, [user?.id, buyerZip])

  // Market hours + product expiry
  const { isOpen: marketIsOpen, todaySchedule, productsNeverExpire, loading: marketLoading } = useMarketStatus()
  
  const [expiresAt, setExpiresAt] = useState<string | null>(product.expires_at || null)
  const [createdAt, setCreatedAt] = useState<string | null>(product.created_at || null)

  const productExpired = useMemo(() => {
    if (productsNeverExpire) return false
    if (expiresAt) {
      return new Date(expiresAt) < new Date()
    }
    // Fallback: listing date (createdAt) + 7 days
    const listingDate = createdAt ? new Date(createdAt) : new Date()
    const fallbackExpiry = new Date(listingDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    return fallbackExpiry < new Date()
  }, [expiresAt, createdAt, productsNeverExpire])

  // Window data state (fetched fresh or from props)
  const [windowDates, setWindowDates] = useState<any[]>(product.window_dates || [])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>(product.product_delivery_windows || [])
  const [pickupWindows, setPickupWindows] = useState<any[]>(product.product_pickup_windows || [])

  // Mode-specific window check: does the selected fulfillment mode have valid windows?
  const windowsValid = hasValidWindows(windowDates, deliveryWindows, pickupWindows, fulfillment)
  const canOrder = !productExpired && windowsValid

  // BUG-8: Use integer cents for tax calculations to avoid floating-point rounding errors
  const subtotal = currentPrice * qty
  const subtotalCents = Math.round(subtotal * 100)
  const taxCents = Math.round(subtotalCents * (taxInfo?.rate || 0) / 100)
  const totalCents = subtotalCents + taxCents
  const computedTax = taxCents / 100
  const total = totalCents / 100
  const isTaxExempt = (taxInfo?.rate || 0) === 0
  const priceChanged = currentPrice !== product.price_usd
  const isFreeProduct = currentPrice === 0

  // Balance vs card split calculation
  const balanceApplied = Math.min(availableBalance, total)
  const cardAmount = Math.max(0, total - balanceApplied)
  const cardCents = Math.round(cardAmount * 100)
  const needsCard = !isFreeProduct && cardCents > 0

  // Fetch product data fresh on mount (or when product.id changes)
  useEffect(() => {
    const fetchFresh = async () => {
      const { data } = await supabase
        .from('market_products')
        .select('price_usd, inventory, window_dates, product_delivery_windows, product_pickup_windows, delivery_radius_miles, pickup_address, expires_at, created_at')
        .eq('id', product.id)
        .single()
      if (data) {
        setCurrentPrice(Number(data.price_usd))
        setAvailable(data.inventory)
        if (qty > data.inventory) setQty(Math.max(1, data.inventory))
        // Refresh window data directly from product
        if (data.window_dates) setWindowDates(data.window_dates)
        if (data.product_delivery_windows) setDeliveryWindows(data.product_delivery_windows)
        if (data.product_pickup_windows) setPickupWindows(data.product_pickup_windows)
        if (data.delivery_radius_miles !== undefined) setProductRadius(data.delivery_radius_miles)
        if (data.pickup_address) setProductPickupAddress(data.pickup_address)
        if (data.expires_at) setExpiresAt(data.expires_at)
        if (data.created_at) setCreatedAt(data.created_at)
      }
    }
    fetchFresh()
  }, [product.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveRadius = productRadius !== null && productRadius !== undefined
    ? productRadius
    : booth.delivery_radius_miles;

  const effectivePickupDisplay = productPickupAddress
    ? (productPickupAddress.split(',')[0] + ', ' + (productPickupAddress.split(',')[1] || '').trim())
    : (booth.pickup_display_address || booth.pickup_address);


  // Fetch buyer's available balance
  useEffect(() => {
    if (!user) return
    const fetchBalance = async () => {
      const { data } = await supabase.rpc('get_transaction_summary', {})
      if (data?.available_usd) {
        setAvailableBalance(Number(data.available_usd))
      }
    }
    fetchBalance()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize Stripe Elements (skip for free products or when no card needed)
  useEffect(() => {
    if (!needsCard) return
    let active = true
    let addressElem: any = null

    const initStripe = async () => {
      try {
        const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''

        const { loadStripe } = await import('@stripe/stripe-js')
        const stripe = await loadStripe(key)
        if (!stripe || !active) return

        stripeRef.current = stripe
        const elements = stripe.elements()

        const cardElement = elements.create('card', {
          style: {
            base: {
              fontSize: '15px',
              fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
              color: '#1f2937',
              '::placeholder': { color: '#9ca3af' },
            },
            invalid: { color: '#b91c1c' },
          },
        })

        try {
          addressElem = elements.create('address', {
            mode: 'billing',
            allowedCountries: ['US'],
            autocomplete: { mode: 'disabled' },
            defaultValues: {
              name: (user as any)?.user_metadata?.full_name || '',
              address: {
                line1: deliveryAddressFields.street || '',
                city: deliveryAddressFields.city || '',
                state: deliveryAddressFields.state || '',
                postal_code: deliveryAddressFields.zip || buyerZipState || '',
                country: 'US',
              },
            },
          })
        } catch (addrErr) {
          console.warn('[BuyModal] Address Element create warning:', addrErr)
        }

        const mountElements = () => {
          const cardContainer = document.getElementById('stripe-card-element')
          const addressContainer = document.getElementById('stripe-address-element')
          if (!cardContainer || !active) return false

          let cardMounted = !!cardElementRef.current
          if (!cardMounted) {
            cardContainer.innerHTML = ''
            try {
              cardElement.mount('#stripe-card-element')
              cardElementRef.current = cardElement
              cardMounted = true
            } catch (mountErr) {
              console.warn('[BuyModal] CardElement mount warning:', mountErr)
            }
          }

          if (addressContainer && addressElem && !addressElementRef.current) {
            addressContainer.innerHTML = ''
            try {
              addressElem.mount('#stripe-address-element')
              addressElementRef.current = addressElem
            } catch (e) {
              console.warn('[BuyModal] Address Element mount warning:', e)
            }
          }

          if (cardMounted) {
            setStripeReady(true)
            return true
          }
          return false
        }

        if (!mountElements()) {
          const observer = new MutationObserver(() => {
            if (mountElements()) observer.disconnect()
          })
          observer.observe(document.body, { childList: true, subtree: true })
          setTimeout(() => observer.disconnect(), 5000)
        }
      } catch (err) {
        console.warn('Failed to load Stripe Elements:', err)
      }
    }

    initStripe()

    return () => {
      active = false
      setStripeReady(false)
      if (cardElementRef.current) {
        try { cardElementRef.current.destroy() } catch {}
        cardElementRef.current = null
      }
      if (addressElementRef.current) {
        try { addressElementRef.current.destroy() } catch {}
        addressElementRef.current = null
      }
      if (addressElem) {
        try { addressElem.destroy() } catch {}
      }
    }
  }, [needsCard])

  // Fetch tax rate (skip for free products)
  useEffect(() => {
    if (isFreeProduct) { setTaxInfo({ rate: 0, amount: 0 }); return }
    const fetchTax = async () => {
      const activeZip = fulfillment === 'pickup'
        ? (booth.pickup_zip || booth.booth_zip || (booth.pickup_address ? booth.pickup_address.match(/\b\d{5}\b/)?.[0] : null))
        : buyerZipState;

      if (!activeZip || !product.category) { setTaxInfo({ rate: 0, amount: 0 }); return }

      const { data: zipData } = await supabase
        .from('zip_codes')
        .select('city_id, cities!inner(state_id, states!inner(code))')
        .eq('zip_code', activeZip)
        .limit(1)
        .single()

      if (!zipData) { setTaxInfo({ rate: 0, amount: 0 }); return }
      const stateCode = (zipData as any).cities?.states?.code
      if (!stateCode) { setTaxInfo({ rate: 0, amount: 0 }); return }

      const { data: rule } = await supabase
        .from('category_tax_rules')
        .select('*')
        .eq('state_code', stateCode)
        .eq('category_name', product.category)
        .is('effective_until', null)
        .limit(1)
        .single()

      if (!rule) { setTaxInfo({ rate: 0, amount: 0 }); return }

      if (rule.rule_type === 'fixed') {
        setTaxInfo({ rate: rule.rate_pct || 0, amount: 0 })
      } else {
        const { data: cached } = await supabase
          .from('zip_tax_cache')
          .select('combined_rate')
          .eq('zip_code', activeZip)
          .gt('expires_at', new Date().toISOString())
          .single()

        if (cached) {
          setTaxInfo({ rate: cached.combined_rate || 0, amount: 0 })
        } else {
          // Cache miss: fetch rate dynamically via get-tax-rate edge function
          let streetAddress: string | null = null
          let city: string | null = null

          if (fulfillment === 'pickup') {
            streetAddress = booth.pickup_address || null
            city = booth.pickup_address ? booth.pickup_address.split(',')[1]?.trim() || null : null
          } else if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('street_address, city')
              .eq('id', user.id)
              .single()
            if (profile) {
              streetAddress = profile.street_address
              city = profile.city
            }
          }

          const { data: rateData } = await supabase.functions.invoke('get-tax-rate', {
            body: {
              zip_code: activeZip,
              state_code: stateCode,
              category: product.category,
              product_name: product.name,
              street_address: streetAddress,
              city: city
            },
          })
          setTaxInfo({ rate: rateData?.rate_pct || 0, amount: 0 })
        }
      }
    }
    fetchTax()
  }, [buyerZip, product.category, fulfillment, booth.pickup_zip, booth.booth_zip, booth.pickup_address, user?.id])

  const handleQtyChange = (val: string) => {
    const n = parseInt(val, 10)
    if (isNaN(n) || n < 1) setQty(1)
    else if (n > available) setQty(available)
    else setQty(n)
  }

  const handleOrder = async () => {
    // BUG-3: Prevent double-click race condition
    if (orderBusyRef.current) return
    orderBusyRef.current = true

    if (!user) { setError('Please sign in to make a purchase'); orderBusyRef.current = false; return }
    if (qty <= 0) { setError('Quantity must be at least 1'); orderBusyRef.current = false; return }
    if (qty > available) { setError(`Only ${available} available`); orderBusyRef.current = false; return }
    if (fulfillment === 'delivery' && !deliveryAddress.trim()) { setError('Please enter a delivery address'); orderBusyRef.current = false; return }
    if (!hasValidWindows(windowDates, deliveryWindows, pickupWindows, fulfillment)) {
      setError(`No ${fulfillment} windows available. ${fulfillment === 'delivery' ? 'Try switching to Pickup.' : 'Try switching to Delivery.'}`)
      orderBusyRef.current = false
      return
    }
    if (needsCard && (!stripeReady || !cardElementRef.current)) { setError('Card form is loading, please wait'); orderBusyRef.current = false; return }

    setLoading(true)
    setError('')
    trackClick('place_order', { productId: product.id, boothId: booth.id, boothName: booth.name, qty, total, fulfillment })

    try {
      const totalCents = Math.round(total * 100)

      // Step 1: Create Stripe hold (BEFORE order — no order_id needed)
      const { data: holdResult, error: holdErr } = await supabase.functions.invoke('market-hold', {
        body: {
          amount_cents: totalCents,
        },
      })

      if (holdErr || holdResult?.error) {
        const msg = holdResult?.error || holdErr?.message || 'Failed to create payment hold'
        setError(msg)
        setLoading(false)
        return
      }

      // Diagnostic: log hold result for debugging PI-not-found issues
      console.log('[BuyModal] Hold result:', {
        holdId: holdResult.holdId,
        holdAmountCents: holdResult.holdAmountCents,
        balanceAppliedCents: holdResult.balanceAppliedCents,
        requiresCardEntry: holdResult.requiresCardEntry,
        clientSecretPrefix: holdResult.clientSecret?.substring(0, 20),
      })

      // Step 2: Confirm with Stripe Elements (only if card entry is needed)
      if (holdResult.requiresCardEntry && stripeRef.current && cardElementRef.current) {
        console.log('[BuyModal] Confirming card payment with client_secret prefix:', holdResult.clientSecret?.substring(0, 20))

        // Extract billing address from Stripe Address Element
        let billingName = (user as any)?.user_metadata?.full_name || (user as any)?.full_name || undefined
        let billingAddress: any = {
          line1: deliveryAddressFields.street || undefined,
          city: deliveryAddressFields.city || undefined,
          state: deliveryAddressFields.state || undefined,
          postal_code: deliveryAddressFields.zip || buyerZipState || undefined,
          country: 'US',
        }

        if (addressElementRef.current) {
          try {
            const addrResult = await addressElementRef.current.getValue()
            if (addrResult?.complete && addrResult?.value) {
              billingName = addrResult.value.name || billingName
              billingAddress = {
                line1: addrResult.value.address?.line1 || billingAddress.line1,
                line2: addrResult.value.address?.line2 || undefined,
                city: addrResult.value.address?.city || billingAddress.city,
                state: addrResult.value.address?.state || billingAddress.state,
                postal_code: addrResult.value.address?.postal_code || billingAddress.postal_code,
                country: addrResult.value.address?.country || 'US',
              }
            }
          } catch (e) {
            console.warn('[BuyModal] Address Element getValue warning:', e)
          }
        }

        const { error: stripeErr } = await stripeRef.current.confirmCardPayment(
          holdResult.clientSecret,
          {
            payment_method: {
              card: cardElementRef.current,
              billing_details: {
                name: billingName,
                email: user?.email || undefined,
                address: billingAddress,
              },
            },
            return_url: `${window.location.origin}/orders`,
          },
        )
        if (stripeErr) {
          console.error('[BuyModal] confirmCardPayment FAILED:', stripeErr.type, stripeErr.code, stripeErr.message, stripeErr.decline_code)
          setError(stripeErr.message || 'Card declined')
          setLoading(false)
          return
        }
        console.log('[BuyModal] confirmCardPayment succeeded')
      }

      // Contextual Data Capture: If buyer has missing zip/address on profile, save it
      if (user) {
        try {
          const { data: currentProfile } = await supabase
            .from('profiles')
            .select('zip_code, street_address')
            .eq('id', user.id)
            .single()

          const profileUpdates: Record<string, any> = {}
          if (!currentProfile?.zip_code && buyerZip) {
            profileUpdates.zip_code = buyerZip
          }
          if (Object.keys(profileUpdates).length > 0) {
            profileUpdates.updated_at = new Date().toISOString()
            await supabase.from('profiles').update(profileUpdates).eq('id', user.id)
          }
        } catch (profileErr) {
          console.warn('[BuyModal] Contextual profile update warning:', profileErr)
        }
      }

      // Step 3: Place order ONLY after payment is secured
      const fbPsid = typeof window !== 'undefined' ? sessionStorage.getItem('fb_psid') : null
      const fbPageId = typeof window !== 'undefined' ? sessionStorage.getItem('fb_page_id') : null
      const fbChannel = typeof window !== 'undefined' ? sessionStorage.getItem('fb_channel') : null
      const fbMetadata = fbPsid ? { fb_psid: fbPsid, fb_page_id: fbPageId, fb_channel: fbChannel } : null

      let { data: orderResult, error: orderErr } = await supabase.rpc('place_market_order', {
        p_product_id: product.id,
        p_quantity: qty,
        p_fulfillment_type: fulfillment,
        p_buyer_zip: buyerZip || null,
        p_expected_price: currentPrice,
        p_hold_id: holdResult.holdId || null,
        p_fb_metadata: fbMetadata || null,
        p_delivery_instructions: fulfillment === 'delivery' ? deliveryInstructions : null,
      })

      // BUG-10: Handle tax_cache_miss — warm cache and retry once
      if (orderResult?.code === 'tax_cache_miss') {
        const activeZip = fulfillment === 'pickup'
          ? (booth.pickup_zip || booth.booth_zip || (booth.pickup_address ? booth.pickup_address.match(/\b\d{5}\b/)?.[0] : null))
          : buyerZip;
        if (activeZip) {
          // Fetch stateCode from zip_codes
          const { data: zipData } = await supabase
            .from('zip_codes')
            .select('cities!inner(states!inner(code))')
            .eq('zip_code', activeZip)
            .limit(1)
            .single()
          const stateCode = (zipData as any)?.cities?.states?.code || null

          // Fetch street_address and city
          let streetAddress: string | null = null
          let city: string | null = null

          if (fulfillment === 'pickup') {
            streetAddress = booth.pickup_address || null
            city = booth.pickup_address ? booth.pickup_address.split(',')[1]?.trim() || null : null
          } else if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('street_address, city')
              .eq('id', user.id)
              .single()
            if (profile) {
              streetAddress = profile.street_address
              city = profile.city
            }
          }

          await supabase.functions.invoke('get-tax-rate', {
            body: {
              zip_code: activeZip,
              state_code: stateCode,
              category: product.category,
              product_name: product.name,
              street_address: streetAddress,
              city: city
            },
          })
          const retry = await supabase.rpc('place_market_order', {
            p_product_id: product.id,
            p_quantity: qty,
            p_fulfillment_type: fulfillment,
            p_buyer_zip: buyerZip || null,
            p_expected_price: currentPrice,
            p_hold_id: holdResult.holdId || null,
            p_fb_metadata: fbMetadata || null,
            p_delivery_instructions: fulfillment === 'delivery' ? deliveryInstructions : null,
          })
          orderResult = retry.data
          orderErr = retry.error
        }
      }

      if (orderErr) { setError(orderErr.message); setLoading(false); return }
      if (orderResult?.error) {
        // Handle price change: refresh price and show clear message
        if (orderResult.code === 'price_changed') {
          setCurrentPrice(Number(orderResult.current_price))
          setError(`Price changed from $${Number(orderResult.expected_price).toFixed(2)} to $${Number(orderResult.current_price).toFixed(2)}. Please review and try again.`)
          setLoading(false)
          return
        }

        setError(orderResult.error); setLoading(false); return
      }

      // Success — order created with payment secured
      onSuccess({
        orderId: orderResult.order_id,
        quantity: qty,
        total: orderResult.total_usd,
        holdAmount: (holdResult.holdAmountCents || 0) / 100,
        balanceApplied: (holdResult.balanceAppliedCents || 0) / 100,
        isTopUp: holdResult.isTopUp,
      })

      // Prompt for push notifications after successful order
      showPrompt()
    } catch (err: any) {
      trackError('order_failed', { productId: product.id, error: err.message })
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
      orderBusyRef.current = false
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerThumb}>
            {product.photos?.[0]
              ? <img src={product.photos[0]} alt={product.name} />
              : <span style={{ fontSize: 24 }}>🥬</span>
            }
          </div>
          <div className={styles.headerInfo}>
            <h3 className={styles.headerName}>{product.name}</h3>
            <span className={styles.headerPrice}>{formatUsd(currentPrice)} / {product.unit} · from {booth.name}</span>
            {priceChanged && (
              <span className={styles.priceUpdated}>Price updated by seller</span>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {error && <div className={styles.error}>{error}</div>}



          {/* Expired product banner */}
          {productExpired && (
            <div className={styles.error} style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fca5a5' }}>
              ⏰ <strong>This product has expired</strong> and is no longer available.
            </div>
          )}

          {/* No valid windows for selected mode */}
          {!productExpired && !windowsValid && (
            <div className={styles.error} style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}>
              ⏰ <strong>No {fulfillment} windows available.</strong> {fulfillment === 'delivery'
                ? 'Try switching to Pickup if available.'
                : 'Try switching to Delivery if available.'}
            </div>
          )}



          {/* Quantity */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Quantity ({product.unit}s)</div>
            <div className={styles.qtyRow}>
              <button className={styles.qtyBtn} onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1}>−</button>
              <input
                className={styles.qtyInput}
                type="number"
                value={qty}
                onChange={e => handleQtyChange(e.target.value)}
                min={1}
                max={available}
              />
              <button className={styles.qtyBtn} onClick={() => setQty(Math.min(available, qty + 1))} disabled={qty >= available}>+</button>
              <span className={styles.qtyAvail}>{available}{product.unit ? ` ${product.unit === 'dozen' ? product.unit : product.unit === 'box' && available !== 1 ? 'boxes' : product.unit === 'bag' && available !== 1 ? 'bags' : product.unit !== 'piece' ? (available !== 1 ? product.unit + 's' : product.unit) : ''}` : ''} available</span>
            </div>
          </div>

          {/* Fulfillment */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Fulfillment</div>
            <div className={styles.fulfillRow}>
              {productOffersPickup && (
                <button className={`${styles.fulfillBtn} ${fulfillment === 'pickup' ? styles.fulfillActive : ''}`}
                  onClick={() => setFulfillment('pickup')}>📍 Pickup</button>
              )}
              {productOffersDelivery && (
                <button className={`${styles.fulfillBtn} ${fulfillment === 'delivery' ? styles.fulfillActive : ''}`}
                  onClick={() => setFulfillment('delivery')}>🚗 Delivery</button>
              )}
            </div>

            {/* Pickup address (approximate — full address shown after purchase) */}
            {fulfillment === 'pickup' && effectivePickupDisplay && (
              <div className={styles.addressInfo}>
                <span className={styles.addressIcon}>📍</span>
                <span>Pickup near: <strong>{effectivePickupDisplay}</strong></span>
              </div>
            )}

            {/* Delivery address */}
            {fulfillment === 'delivery' && (
              <>
                <div style={{ marginTop: 10 }}>
                  <div className={styles.sectionLabel} style={{ marginBottom: 6 }}>Delivery Address</div>
                  <AddressInput
                    value={deliveryAddressFields}
                    onChange={(fields) => {
                      setDeliveryAddressFields(fields)
                      const full = formatFullAddress(fields)
                      setDeliveryAddress(full)
                      if (fields.zip) setBuyerZipState(fields.zip)
                    }}
                    showPrivacyNote={false}
                  />
                </div>
                <input
                  className={styles.cardInput}
                  placeholder="Delivery instructions (e.g. gate code, leave at door)"
                  value={deliveryInstructions}
                  onChange={e => setDeliveryInstructions(e.target.value)}
                  style={{ marginTop: 8 }}
                />
                {effectiveRadius ? (
                  <p className={styles.deliveryNote}>Delivery available within {effectiveRadius} miles of seller</p>
                ) : null}
              </>
            )}
          </div>

          {/* Price Breakdown — hidden for free products */}
          {!isFreeProduct && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Price Breakdown</div>
            <div className={styles.breakdown}>
              <div className={styles.breakdownRow}>
                <span>Subtotal ({qty} {product.unit}{qty > 1 ? 's' : ''} × {formatUsd(currentPrice)})</span>
                <span>{formatUsd(subtotal)}</span>
              </div>
              <div className={styles.breakdownRow}>
                <span>Sales Tax {isTaxExempt ? '(Exempt)' : `(${taxInfo?.rate}%)`}</span>
                <span>{isTaxExempt ? '—' : formatUsd(computedTax)}</span>
              </div>
              <div className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
                <span>Total</span>
                <span>{formatUsd(total)}</span>
              </div>
              {balanceApplied > 0 && (
                <>
                  <div className={styles.breakdownRow} style={{ color: '#16a34a', fontWeight: 500 }}>
                    <span>💰 Balance Applied (Hold)</span>
                    <span>−{formatUsd(balanceApplied)}</span>
                  </div>
                  <div className={styles.breakdownRow} style={{ fontWeight: 600 }}>
                    <span>💳 {cardAmount > 0 ? 'Card Hold' : 'No card needed'}</span>
                    <span>{cardAmount > 0 ? formatUsd(cardAmount) : '$0.00'}</span>
                  </div>
                </>
              )}
            </div>
          </div>
          )}

          {/* Free product info */}
          {isFreeProduct && (
            <div className={styles.section}>
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '12px 16px', fontSize: 14, color: '#065f46' }}>
                🌱 <strong>Free sharing</strong> — This produce is being shared at no cost in compliance with local regulations. No payment required.
              </div>
            </div>
          )}






          {/* Stripe Address + Card Elements — only when card is needed */}
          {needsCard && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Payment & Billing</div>
              <div style={{ marginBottom: 12 }}>
                <div id="stripe-address-element" />
              </div>
              <div className={styles.stripeCard}>
                <div id="stripe-card-element" />
              </div>
              {(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '').startsWith('pk_test') && (
                <p className={styles.stripeTestHint}>
                  🧪 Test mode — use card <strong>4242 4242 4242 4242</strong>, any future expiry, any CVC
                </p>
              )}
              <p className={styles.stripeNote}>
                🔒 Secured by Stripe. Your card details never touch our servers.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.orderBtn} disabled={loading || available === 0 || !canOrder || (!isFreeProduct && needsCard && !stripeReady)} onClick={handleOrder}>
            {loading ? 'Processing...' : productExpired ? '⏰ Product Expired' : !windowsValid ? `⏰ No ${fulfillment} windows` : available === 0 ? 'Sold Out' : isFreeProduct ? `🌱 Claim (Free) — ${qty} ${product.unit}${qty > 1 ? 's' : ''}` : `Place Order — ${formatUsd(total)}`}
          </button>
          {!isFreeProduct && (
          <p className={styles.holdNotice}>
            {needsCard
              ? `Your card will be authorized for ${formatUsd(cardAmount)}${balanceApplied > 0 ? ` (${formatUsd(balanceApplied)} from balance)` : ''}. Your card is only charged after delivery is confirmed and the order is complete.`
              : balanceApplied > 0
                ? `${formatUsd(balanceApplied)} will be applied from your balance. No card authorization needed.`
                : `This order is covered by your existing hold. No additional card authorization needed.`
            }
          </p>
          )}
        </div>
      </div>
      <NotificationPromptModal {...modalProps} />
    </div>
  )
}
