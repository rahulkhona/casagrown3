'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCart, type CartItem, type BoothGroup } from '../../../lib/useCart'
import { useMarketStatus } from '../../../lib/useMarketStatus'
import { createClient } from '../../../lib/supabase'
import { formatUsd } from '../../../lib/store'
import { useAuth } from '../../../lib/useAuth'
import { useQuickSetup } from '../../../lib/useQuickSetup'
import { hasValidWindows } from '../../../lib/windowUtils'
import AddressInput from '../../components/AddressInput'
import { type AddressFields, formatFullAddress } from '../../../lib/address'
import styles from './page.module.css'

export default function CartPage() {
  const { items, boothGroups, removeItem, updateQty, updateFulfillment, clearBooth, clearCart, refreshItems } = useCart()
  const { isOpen: marketIsOpen, loading: marketLoading } = useMarketStatus()

  const { user, isAuthenticated } = useAuth()
  const { requireAuth } = useQuickSetup()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [availableBalance, setAvailableBalance] = useState(0)
  const [existingHoldRemaining, setExistingHoldRemaining] = useState(0)
  const [stripeReady, setStripeReady] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [balanceLoaded, setBalanceLoaded] = useState(false)
  const [deliveryAddressFields, setDeliveryAddressFields] = useState<AddressFields>({ street: '', city: '', state: '', zip: '' })
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryInstructions, setDeliveryInstructions] = useState('')
  const [stripeLoaded, setStripeLoaded] = useState(false)
  const stripeRef = useRef<any>(null)
  const cardElementRef = useRef<any>(null)
  const cardMountedRef = useRef(false)
  const checkoutBusyRef = useRef(false)

  // Quarantine tracking: product_id -> quarantine info
  const [quarantinedProducts, setQuarantinedProducts] = useState<Record<string, { pest_name: string; county_name: string }>>({})

  // Redirect if cart feature is off (wait for settings to load first)
  useEffect(() => {
  }, [marketLoading, router])

  // Refresh all product data on mount
  const refreshAll = useCallback(async () => {
    if (items.length === 0) { setLoading(false); return }

    const productIds = items.map(i => i.product.id)
    const { data } = await supabase.rpc('refresh_product_data', { product_ids: productIds })

    if (data && Array.isArray(data)) {
      refreshItems(data.map((d: any) => ({
        id: d.id,
        inventory: d.inventory,
        price_usd: Number(d.price_usd),
        is_active: d.is_active,
        expires_at: d.expires_at || null,
        window_dates: d.window_dates || [],
        product_delivery_windows: d.product_delivery_windows || [],
        product_pickup_windows: d.product_pickup_windows || [],
      })))
    }
    setLoading(false)
  }, [items.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Check quarantine status for all cart items
  const checkQuarantines = useCallback(async () => {
    if (items.length === 0) return
    const qMap: Record<string, { pest_name: string; county_name: string }> = {}
    for (const item of items) {
      const { data } = await supabase.rpc('check_quarantine_for_product', { p_product_id: item.product.id })
      if (data && data.length > 0) {
        qMap[item.product.id] = { pest_name: data[0].pest_name, county_name: data[0].county_name }
      }
    }
    setQuarantinedProducts(qMap)
  }, [items.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refreshAll()
    checkQuarantines()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // Handle "accept adjusted qty" — set qty to latest inventory
  const acceptAdjusted = (item: CartItem) => {
    if (item.latestInventory && item.latestInventory > 0) {
      updateQty(item.product.id, item.latestInventory)
      showToast(`Qty adjusted to ${item.latestInventory}`)
    }
  }

  // Proceed with available items only (drop unavailable ones from a booth)
  const proceedWithAvailable = (group: BoothGroup) => {
    for (const item of group.items) {
      if (item.unavailable === 'sold_out' || item.unavailable === 'inactive') {
        removeItem(item.product.id)
      } else if (item.unavailable === 'insufficient' && item.latestInventory) {
        updateQty(item.product.id, item.latestInventory)
      }
    }
    showToast('Cart updated — unavailable items removed')
  }

  // Count unavailable items in a booth group
  const getUnavailCount = (group: BoothGroup) =>
    group.items.filter(i => i.unavailable).length

  // Get checkout-ready items for a booth
  const getCheckoutItems = (group: BoothGroup) =>
    group.items.filter(i => !i.unavailable)

  // Fetch buyer's available balance + existing hold on mount
  useEffect(() => {
    if (!user) return
    // Get balance from transaction summary
    const fetchBalance = async () => {
      try {
        const { data } = await supabase.rpc('get_transaction_summary', {})
        if (data?.available_usd) setAvailableBalance(Number(data.available_usd))
      } catch {}
      setBalanceLoaded(true)
    }
    fetchBalance()
    // Pre-fill delivery address from profile
    supabase.from('profiles')
      .select('street_address, city, state_code, zip_code')
      .eq('id', user.id).single()
      .then(({ data }: { data: any }) => {
        if (data && (data.street_address || data.city || data.zip_code)) {
          const fields: AddressFields = {
            street: data.street_address || '',
            city: data.city || '',
            state: data.state_code || '',
            zip: data.zip_code || '',
          }
          setDeliveryAddressFields(fields)
          setDeliveryAddress(formatFullAddress(fields))
        }
      })
    // Get existing hold
    supabase.from('market_holds').select('hold_amount_cents, spent_amount_cents')
      .eq('buyer_id', user.id).eq('status', 'active').single()
      .then(({ data }: { data: any }) => {
        if (data) {
          setExistingHoldRemaining(Math.max(0, data.hold_amount_cents - data.spent_amount_cents))
        }
      })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute checkout amounts (must be before Stripe mount effect)
  const grandTotal = boothGroups.reduce((sum, g) => sum + g.subtotal, 0)
  const balanceApplied = Math.min(Math.max(0, availableBalance), grandTotal) // clamp: never negative
  const cardAmount = Math.max(0, grandTotal - balanceApplied)
  const cardCents = Math.round(cardAmount * 100)
  const needsCard = balanceLoaded && cardCents > 0 && existingHoldRemaining < cardCents

  // Initialize Stripe Elements — load Stripe once
  useEffect(() => {
    const initStripe = async () => {
      try {
        const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
        const { loadStripe } = await import('@stripe/stripe-js')
        const stripe = await loadStripe(key)
        if (!stripe) return
        stripeRef.current = stripe
        setStripeLoaded(true) // Trigger card mount effect
      } catch (err) {
        console.warn('Failed to load Stripe:', err)
      }
    }
    initStripe()
  }, [])

  // Mount card + address elements when Stripe is loaded and the div exists
  useEffect(() => {
    if (!stripeRef.current || cardMountedRef.current || !needsCard) return
    const cardContainer = document.getElementById('cart-stripe-card-element')
    if (!cardContainer) return
    const elements = stripeRef.current.elements()
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
    cardElement.mount('#cart-stripe-card-element')
    cardElementRef.current = cardElement
    cardMountedRef.current = true
    setStripeReady(true)

    return () => {
      try { cardElement.unmount() } catch {}
      cardMountedRef.current = false
    }
  }, [needsCard, balanceLoaded, stripeLoaded]) // Re-run when needsCard changes OR Stripe finishes loading

  // Unified checkout with Stripe card entry — HOLD-FIRST flow
  const handleUnifiedCheckout = async () => {
    // BUG-2: Prevent double-click race condition
    if (checkoutBusyRef.current) return
    checkoutBusyRef.current = true

    if (!user || !isAuthenticated) {
      checkoutBusyRef.current = false
      requireAuth({
        trigger: 'checkout',
        onReady: () => handleUnifiedCheckout(),
      })
      return
    }
    if (!balanceLoaded) { setCheckoutError('Still loading payment info, please wait'); checkoutBusyRef.current = false; return }
    if (needsCard && (!stripeReady || !cardElementRef.current)) {
      setCheckoutError('Card form is loading, please wait'); checkoutBusyRef.current = false; return
    }
    setCheckingOut(true)
    setCheckoutError('')

    try {
      // Group available items by booth
      const orderGroups = boothGroups.map(group => ({
        booth: group.booth,
        items: getCheckoutItems(group),
        subtotal: group.subtotal,
      })).filter(g => g.items.length > 0)

      if (orderGroups.length === 0) {
        showToast('No available items to checkout')
        setCheckingOut(false)
        return
      }

      // Step 1: Re-validate windows
      const allProductIds = orderGroups.flatMap(g => g.items.map(i => i.product.id))
      const { data: freshData } = await supabase.rpc('refresh_product_data', { product_ids: allProductIds })
      const freshMap = new Map((freshData as any[] || []).map((d: any) => [d.id, d]))

      // Check for expired windows per item's selected fulfillment mode
      const expiredItems: string[] = []
      for (const group of orderGroups) {
        for (const item of group.items) {
          const fresh = freshMap.get(item.product.id)
          if (fresh && !hasValidWindows(fresh.window_dates, fresh.product_delivery_windows, fresh.product_pickup_windows, item.fulfillmentMode)) {
            expiredItems.push(`${item.product.name} (${item.fulfillmentMode})`)
          }
        }
      }
      if (expiredItems.length > 0) {
        setCheckoutError(`Cannot checkout: ${expiredItems.join(', ')} — ${expiredItems.length === 1 ? 'window has' : 'windows have'} passed. Remove or switch fulfillment mode.`)
        // Trigger a refresh to update badges
        if (freshData) {
          refreshItems((freshData as any[]).map((d: any) => ({
            id: d.id, inventory: d.inventory, price_usd: Number(d.price_usd),
            is_active: d.is_active, expires_at: d.expires_at || null,
            window_dates: d.window_dates || [], product_delivery_windows: d.product_delivery_windows || [],
            product_pickup_windows: d.product_pickup_windows || [],
          })))
        }
        setCheckingOut(false)
        return
      }

      // Step 2: Create/top-up hold FIRST (before any orders)
      const totalCents = Math.round(grandTotal * 100)
      const holdCents = Math.round(Math.max(0, grandTotal - balanceApplied) * 100)
      let holdResult: any = null

      if (holdCents > 0 || needsCard || totalCents > 0) {
        const { data: hr, error: holdErr } = await supabase.functions.invoke('market-hold', {
          body: {
            amount_cents: totalCents,
            suggested_hold_cents: holdCents,
          },
        })

        if (holdErr || hr?.error) {
          const msg = hr?.error || holdErr?.message || 'Unknown error'
          setCheckoutError('Failed to authorize payment: ' + msg)
          setCheckingOut(false)
          return
        }
        holdResult = hr

        // Step 3: Confirm card payment if Stripe requires it
        if (holdResult?.requiresCardEntry) {
          if (!stripeRef.current || !cardElementRef.current) {
            setCheckoutError('Card payment is required but the card form did not load. Please refresh and try again.')
            setCheckingOut(false)
            return
          }

          // Build billing address from our AddressInput fields
          const billingDetails: any = {}
          if (deliveryAddressFields.street || deliveryAddressFields.city) {
            billingDetails.address = {
              line1: deliveryAddressFields.street || undefined,
              city: deliveryAddressFields.city || undefined,
              state: deliveryAddressFields.state || undefined,
              postal_code: deliveryAddressFields.zip || undefined,
              country: 'US',
            }
          }

          const { error: stripeErr } = await stripeRef.current.confirmCardPayment(
            holdResult.clientSecret,
            {
              payment_method: {
                card: cardElementRef.current,
                ...(billingDetails.name || billingDetails.address ? { billing_details: billingDetails } : {}),
              },
              return_url: `${window.location.origin}/orders`,
            },
          )
          if (stripeErr) {
            setCheckoutError(stripeErr.message || 'Card declined')
            setCheckingOut(false)
            return
          }
        }
      }

      // BUG-7: Re-check prices haven't changed since cart was loaded
      let priceChanged = false
      for (const group of orderGroups) {
        for (const item of group.items) {
          const fresh = freshMap.get(item.product.id)
          if (fresh && Number(fresh.price_usd) !== item.product.price_usd) {
            priceChanged = true
            // Update the cart with fresh prices
            refreshItems((freshData as any[]).map((d: any) => ({
              id: d.id, inventory: d.inventory, price_usd: Number(d.price_usd),
              is_active: d.is_active, expires_at: d.expires_at || null,
              window_dates: d.window_dates || [], product_delivery_windows: d.product_delivery_windows || [],
              product_pickup_windows: d.product_pickup_windows || [],
            })))
          }
        }
      }
      if (priceChanged) {
        setCheckoutError('Some prices have been updated. Please review your cart and try again.')
        setCheckingOut(false)
        checkoutBusyRef.current = false
        return
      }

      // Step 4: Place orders ONLY after payment is secured
      // BUG-1: Track successful orders for partial rollback on failure
      const placedOrderIds: string[] = []
      const placedProductIds: string[] = []
      const failedItems: string[] = []
      let partialFailure = false

      for (const group of orderGroups) {
        for (const item of group.items) {
          let { data: orderResult, error: orderErr } = await supabase.rpc('place_market_order', {
            p_product_id: item.product.id,
            p_quantity: item.qty,
            p_fulfillment_type: item.fulfillmentMode || 'delivery',
            p_hold_id: holdResult?.holdId || null,
          })

          // BUG-10: Handle tax_cache_miss — ask user to retry (cache will be warmed by first attempt)
          if (orderResult?.code === 'tax_cache_miss') {
            // The place_market_order RPC internally calls with buyer's zip from profile.
            // On first attempt, get-tax-rate warms the cache. A simple retry should succeed.
            failedItems.push(item.product.name + ' (tax rate loading, please retry)')
            partialFailure = true
            continue
          }

          if (orderErr || orderResult?.error) {
            failedItems.push(item.product.name)
            partialFailure = true
            continue // Try remaining items instead of aborting
          }

          placedOrderIds.push(orderResult.order_id)
          placedProductIds.push(item.product.id)
        }
      }

      // BUG-1: If some orders failed, adjust hold to release unused portion
      if (partialFailure && holdResult?.holdId) {
        // Calculate the total for successfully placed orders only
        const successfulTotal = orderGroups.reduce((sum, group) => {
          return sum + group.items
            .filter(item => placedProductIds.includes(item.product.id))
            .reduce((s, item) => s + (item.product.price_usd * item.qty), 0)
          }, 0)

        // Adjust the hold down to only cover successful orders
        const adjustCents = Math.round(successfulTotal * 100)
        if (adjustCents < totalCents) {
          await supabase.functions.invoke('market-hold', {
            body: {
              action: 'adjust',
              hold_id: holdResult.holdId,
              new_amount_cents: adjustCents,
            },
          }).catch(() => {}) // Best-effort adjustment
        }
      }

      // Step 5: Remove successfully ordered items from cart
      for (const pid of placedProductIds) {
        removeItem(pid)
      }

      if (placedOrderIds.length > 0 && failedItems.length > 0) {
        // Partial success
        showToast(`⚠️ ${placedOrderIds.length} order(s) placed. Failed: ${failedItems.join(', ')}`)
        setCheckoutError(`Some items could not be ordered: ${failedItems.join(', ')}. Your hold was adjusted.`)
      } else if (placedOrderIds.length > 0) {
        // Full success
        showToast(`🎉 ${placedOrderIds.length} order${placedOrderIds.length > 1 ? 's' : ''} placed!`)
        setTimeout(() => router.push('/orders?role=buying'), 1500)
      } else {
        // All failed
        setCheckoutError(`All orders failed: ${failedItems.join(', ')}. Your payment hold has been released.`)
        // Release entire hold
        if (holdResult?.holdId) {
          await supabase.functions.invoke('market-hold', {
            body: { action: 'adjust', hold_id: holdResult.holdId, new_amount_cents: 0 },
          }).catch(() => {})
        }
      }

    } catch (err: any) {
      setCheckoutError('Checkout failed: ' + (err?.message || 'Unknown error'))
    } finally {
      setCheckingOut(false)
      checkoutBusyRef.current = false
    }
  }



  if (loading) {
    return (
      <div className={styles.cartPage}>
        <h1 className={styles.cartTitle}>🛒 Your Cart</h1>
        <p style={{ textAlign: 'center', color: 'var(--gray-500)', padding: 40 }}>Refreshing cart...</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={styles.cartPage}>
        <div className={styles.emptyCart}>
          <div className={styles.emptyIcon}>🛒</div>
          <h2 className={styles.emptyTitle}>Your cart is empty</h2>
          <p className={styles.emptyDesc}>
            Browse the market and add some fresh produce!
          </p>
          <button className="btn btn-primary" onClick={() => router.back()}>
            ← Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.cartPage}>
      <h1 className={styles.cartTitle}>🛒 Your Cart</h1>
      <p className={styles.cartSubtitle}>
        {items.length} item{items.length > 1 ? 's' : ''} from {boothGroups.length} stand{boothGroups.length > 1 ? 's' : ''}
      </p>

      {boothGroups.map(group => {
        const unavailCount = getUnavailCount(group)
        const hasUnavailable = unavailCount > 0
        const availableItems = getCheckoutItems(group)

        return (
          <div key={group.booth.id} className={styles.boothGroup}>
            {/* Booth header */}
            <div className={styles.boothHeader}>
              <span>🏪</span>
              <span>{group.booth.name}</span>
            </div>

            {/* Unavailability banner */}
            {hasUnavailable && (
              <div className={styles.unavailBanner}>
                <p>
                  <strong>⚠️ {unavailCount} item{unavailCount > 1 ? 's' : ''} changed</strong>{' '}
                  since you added {unavailCount > 1 ? 'them' : 'it'}.
                </p>
                <div className={styles.unavailActions}>
                  <button
                    className={styles.unavailBtnProceed}
                    onClick={() => proceedWithAvailable(group)}
                    disabled={availableItems.length === 0}
                  >
                    {availableItems.length > 0
                      ? `Keep ${availableItems.length} available item${availableItems.length > 1 ? 's' : ''}`
                      : 'No items available'}
                  </button>
                  <button
                    className={styles.unavailBtnCancel}
                    onClick={() => { clearBooth(group.booth.id); showToast('All items removed') }}
                  >
                    Remove all
                  </button>
                </div>
              </div>
            )}

            {/* Cart items */}
            {group.items.map(item => {
              const price = item.latestPrice ?? item.product.price_usd
              const priceChanged = item.latestPrice != null && item.latestPrice !== item.product.price_usd

              return (
                <div
                  key={item.product.id}
                  className={`${styles.cartItem} ${item.unavailable ? styles.cartItemUnavailable : ''}`}
                >
                  {/* Product image */}
                  {item.product.photos?.[0] ? (
                    <img src={item.product.photos[0]} alt={item.product.name} className={styles.itemImage} />
                  ) : (
                    <div className={styles.itemPlaceholder}>🥬</div>
                  )}

                  {/* Details */}
                  <div className={styles.itemDetails}>
                    <p className={styles.itemName}>{item.product.name}</p>
                    <p className={styles.itemPrice}>
                      {formatUsd(price)} / {item.product.unit}
                      {priceChanged && (
                        <span className={styles.priceChanged}> (was {formatUsd(item.product.price_usd)})</span>
                      )}
                    </p>

                    {/* Unavailability badge */}
                    {item.unavailable === 'sold_out' && (
                      <span className={`${styles.unavailBadge} ${styles.badgeSoldOut}`}>Sold Out</span>
                    )}
                    {item.unavailable === 'inactive' && (
                      <span className={`${styles.unavailBadge} ${styles.badgeInactive}`}>No Longer Available</span>
                    )}
                    {item.unavailable === 'expired' && (
                      <span className={`${styles.unavailBadge} ${styles.badgeInactive}`} style={{ background: '#fef3c7', color: '#92400e', borderColor: '#f59e0b' }}>
                        ⏰ No {item.fulfillmentMode} windows available
                      </span>
                    )}
                    {false && quarantinedProducts[item.product.id] && !item.unavailable && (
                      <span className={`${styles.unavailBadge}`} style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d' }}>
                        ⚠️ Potential Quarantine — {quarantinedProducts[item.product.id].pest_name}
                      </span>
                    )}
                    {item.unavailable === 'insufficient' && (
                      <>
                        <span className={`${styles.unavailBadge} ${styles.badgeInsufficient}`}>
                          Only {item.latestInventory} left
                        </span>
                        <div className={styles.acceptRow}>
                          <button className={styles.acceptBtn} onClick={() => acceptAdjusted(item)}>
                            Accept {item.latestInventory}
                          </button>
                          <button className={styles.acceptRemoveBtn} onClick={() => removeItem(item.product.id)}>
                            Remove
                          </button>
                        </div>
                      </>
                    )}

                    {/* Fulfillment mode selector */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      {item.booth.offers_pickup && (
                        <button
                          onClick={() => updateFulfillment(item.product.id, 'pickup')}
                          style={{
                            padding: '3px 10px', fontSize: 12, borderRadius: 12,
                            border: `1px solid ${item.fulfillmentMode === 'pickup' ? '#16a34a' : '#d1d5db'}`,
                            background: item.fulfillmentMode === 'pickup' ? '#ecfdf5' : '#f9fafb',
                            color: item.fulfillmentMode === 'pickup' ? '#065f46' : '#6b7280',
                            fontWeight: item.fulfillmentMode === 'pickup' ? 600 : 400,
                            cursor: 'pointer',
                          }}
                        >📍 Pickup</button>
                      )}
                      {item.booth.offers_delivery && (
                        <button
                          onClick={() => updateFulfillment(item.product.id, 'delivery')}
                          style={{
                            padding: '3px 10px', fontSize: 12, borderRadius: 12,
                            border: `1px solid ${item.fulfillmentMode === 'delivery' ? '#2563eb' : '#d1d5db'}`,
                            background: item.fulfillmentMode === 'delivery' ? '#eff6ff' : '#f9fafb',
                            color: item.fulfillmentMode === 'delivery' ? '#1e40af' : '#6b7280',
                            fontWeight: item.fulfillmentMode === 'delivery' ? 600 : 400,
                            cursor: 'pointer',
                          }}
                        >🚗 Delivery</button>
                      )}
                    </div>

                    {/* Pickup location display */}
                    {item.fulfillmentMode === 'pickup' && item.booth.pickup_address && (
                      <div style={{ fontSize: 12, color: '#374151', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>📍</span>
                        <span>Pickup near: <strong>{item.booth.pickup_address}</strong></span>
                      </div>
                    )}

                    {/* Delivery radius note */}
                    {item.fulfillmentMode === 'delivery' && item.booth.delivery_radius_miles && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                        🚗 Delivery within {item.booth.delivery_radius_miles} miles of seller
                      </div>
                    )}

                    {/* Qty controls (only for available items) */}
                    {!item.unavailable && (
                      <div className={styles.qtyRow}>
                        <button
                          className={styles.qtyBtn}
                          onClick={() => updateQty(item.product.id, item.qty - 1)}
                          disabled={item.qty <= 1}
                        >−</button>
                        <span className={styles.qtyVal}>{item.qty}</span>
                        <button
                          className={styles.qtyBtn}
                          onClick={() => updateQty(item.product.id, item.qty + 1)}
                          disabled={item.qty >= (item.latestInventory ?? item.product.inventory)}
                        >+</button>
                      </div>
                    )}
                  </div>

                  {/* Remove button */}
                  <button
                    className={styles.removeBtn}
                    onClick={() => { removeItem(item.product.id); showToast('Removed from cart') }}
                    title="Remove"
                  >✕</button>
                </div>
              )
            })}

            {/* Booth subtotal */}
            <div className={styles.boothFooter}>
              <div className={styles.subtotalRow}>
                <span>Subtotal ({availableItems.length} item{availableItems.length !== 1 ? 's' : ''})</span>
                <span>{formatUsd(group.subtotal)}</span>
              </div>
            </div>
          </div>
        )
      })}

      {/* Grand total and unified checkout */}
      {(() => {
        const allAvailable = boothGroups.flatMap(g => getCheckoutItems(g))
        const hasQuarantined = false && allAvailable.some(i => quarantinedProducts[i.product.id])
        const quarantinedCount = allAvailable.filter(i => quarantinedProducts[i.product.id]).length
        return allAvailable.length > 0 && (
          <div className={styles.grandTotalSection}>
            <div className={styles.grandTotalRow}>
              <span>Grand Total ({allAvailable.length} item{allAvailable.length !== 1 ? 's' : ''})</span>
              <span className={styles.grandTotalAmount}>{formatUsd(grandTotal)}</span>
            </div>
            {balanceApplied > 0 && (
              <div className={styles.balanceRow}>
                <span>💰 Balance Applied (Hold)</span>
                <span style={{ color: '#16a34a' }}>-{formatUsd(balanceApplied)}</span>
              </div>
            )}
            {cardAmount > 0 && (
              <div className={styles.balanceRow}>
                <span>Card authorization</span>
                <span>{formatUsd(cardAmount)}</span>
              </div>
            )}
            {balanceLoaded && !needsCard && cardAmount > 0 && (
              <p style={{ fontSize: 13, color: '#16a34a', margin: '8px 0 0' }}>
                ✅ Covered by your existing hold — no card entry needed.
              </p>
            )}
            {balanceLoaded && !needsCard && cardAmount <= 0 && grandTotal > 0 && (
              <p style={{ fontSize: 13, color: '#16a34a', margin: '8px 0 0' }}>
                ✅ Fully covered by your balance — no card entry needed.
              </p>
            )}

            {/* Delivery address — shown when any item is set to delivery */}
            {allAvailable.some(i => i.fulfillmentMode === 'delivery') && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
                  🚗 Delivery Address
                </div>
                <AddressInput
                  value={deliveryAddressFields}
                  onChange={(fields) => {
                    setDeliveryAddressFields(fields)
                    setDeliveryAddress(formatFullAddress(fields))
                  }}
                  showPrivacyNote={false}
                />
                <input
                  type="text"
                  placeholder="Delivery instructions (e.g. gate code, leave at door)"
                  value={deliveryInstructions}
                  onChange={e => setDeliveryInstructions(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid #d1d5db', fontSize: 14, marginTop: 8,
                    background: '#fff', color: '#374151',
                  }}
                />
              </div>
            )}

            {/* Stripe Card Element + Billing Address — only shown when card is needed */}
            {needsCard && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
                  💳 Payment & Billing
                </div>
                {/* Billing address — always shows all fields */}
                <div style={{ marginBottom: 12 }}>
                  <AddressInput
                    value={deliveryAddressFields}
                    onChange={(fields) => {
                      setDeliveryAddressFields(fields)
                      setDeliveryAddress(formatFullAddress(fields))
                    }}
                    showPrivacyNote={false}
                  />
                </div>
                <div style={{
                  border: '1px solid #d1d5db', borderRadius: 8, padding: '12px 14px',
                  background: '#fff',
                }}>
                  <div id="cart-stripe-card-element" />
                </div>
                {(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '').startsWith('pk_test') && (
                  <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                    🧪 Test mode — use <strong>4242 4242 4242 4242</strong>, any future expiry, any CVC
                  </p>
                )}
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                  🔒 Secured by Stripe. Your card details never touch our servers.
                </p>
              </div>
            )}

            {/* Quarantine warning */}
            {hasQuarantined && (
              <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, margin: '12px 0' }}>
                <p style={{ margin: 0, fontSize: 13, color: '#b45309', fontWeight: 600 }}>
                  ⚠️ {quarantinedCount} item{quarantinedCount > 1 ? 's' : ''} may be affected by an agricultural quarantine. Please double check local regulations before proceeding.
                </p>
              </div>
            )}

            {/* Error display */}
            {checkoutError && (
              <p style={{ color: '#dc2626', fontSize: 14, margin: '12px 0 0', fontWeight: 500 }}>
                ⚠️ {checkoutError}
              </p>
            )}

            <button
              className={styles.unifiedCheckoutBtn}
              onClick={handleUnifiedCheckout}
              disabled={checkingOut || !balanceLoaded || (needsCard && !stripeReady)}
            >
              {checkingOut
                ? '⏳ Processing...'
                : !balanceLoaded
                  ? '⏳ Loading...'
                  : needsCard
                    ? `Pay ${formatUsd(cardAmount)} & Place Orders`
                    : `Place Orders — ${formatUsd(grandTotal)}`}
            </button>
            <p className={styles.checkoutNotice}>
              Your card is only charged after delivery is confirmed and the order is complete.
              <br /><br />
              Reminder: Please check your local agricultural guidelines before purchasing agricultural products.
            </p>
          </div>
        )
      })()}

      <Link href="/market" className={styles.continueLink}>← Continue Shopping</Link>

      {/* Quick Setup Modal (for guest auth gate) */}


      {/* Toast */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
