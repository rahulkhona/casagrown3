'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCart, type CartItem, type BoothGroup } from '../../../lib/useCart'
import { useMarketStatus } from '../../../lib/useMarketStatus'
import { createClient } from '../../../lib/supabase'
import { formatUsd } from '../../../lib/store'
import { useAuth } from '../../../lib/useAuth'
import { hasValidWindows } from '../../../lib/windowUtils'
import styles from './page.module.css'

export default function CartPage() {
  const { items, boothGroups, removeItem, updateQty, updateFulfillment, clearBooth, clearCart, refreshItems } = useCart()
  const { isOpen: marketIsOpen, loading: marketLoading } = useMarketStatus()

  const { user, isAuthenticated } = useAuth()
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
  const [stripeLoaded, setStripeLoaded] = useState(false)
  const stripeRef = useRef<any>(null)
  const cardElementRef = useRef<any>(null)
  const cardMountedRef = useRef(false)

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

  useEffect(() => {
    refreshAll()
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
    // Get existing hold
    supabase.from('market_holds').select('hold_amount_cents, spent_amount_cents')
      .eq('buyer_id', user.id).eq('status', 'active').single()
      .then(({ data }) => {
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
        const { loadStripe } = await import('@stripe/stripe-js')
        const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')
        if (!stripe) return
        stripeRef.current = stripe
        setStripeLoaded(true) // Trigger card mount effect
      } catch (err) {
        console.warn('Failed to load Stripe:', err)
      }
    }
    initStripe()
  }, [])

  // Mount card element when Stripe is loaded and the div exists
  useEffect(() => {
    if (!stripeRef.current || cardMountedRef.current || !needsCard) return
    const container = document.getElementById('cart-stripe-card-element')
    if (!container) return
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

  // Unified checkout with Stripe card entry and rollback
  const handleUnifiedCheckout = async () => {
    if (!user || !isAuthenticated) { router.push('/login?redirect=/cart'); return }
    if (!balanceLoaded) { setCheckoutError('Still loading payment info, please wait'); return }
    if (needsCard && (!stripeReady || !cardElementRef.current)) {
      setCheckoutError('Card form is loading, please wait'); return
    }
    setCheckingOut(true)
    setCheckoutError('')

    const placedOrderIds: string[] = []

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

      // Step 1: Re-validate windows + place orders (atomic per item)
      const placedProductIds: string[] = []
      let orderTotal = 0

      // Re-fetch fresh data for all products to validate windows at checkout time
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

      for (const group of orderGroups) {
        for (const item of group.items) {
          const { data: orderResult, error: orderErr } = await supabase.rpc('place_market_order', {
            p_product_id: item.product.id,
            p_quantity: item.qty,
            p_fulfillment_type: 'delivery',
          })

          if (orderErr) {
            setCheckoutError(`Failed to order ${item.product.name}: ${orderErr.message}`)
            // Rollback: cancel already-placed orders
            for (const oid of placedOrderIds) {
              await supabase.from('market_orders').update({ status: 'cancelled' }).eq('id', oid)
            }
            setCheckingOut(false)
            return
          }
          if (orderResult?.error) {
            setCheckoutError(`${item.product.name}: ${orderResult.error}`)
            for (const oid of placedOrderIds) {
              await supabase.from('market_orders').update({ status: 'cancelled' }).eq('id', oid)
            }
            setCheckingOut(false)
            return
          }

          placedOrderIds.push(orderResult.order_id)
          placedProductIds.push(item.product.id)
          orderTotal += Number(orderResult.total_usd)
        }
      }

      // Step 2: Create/top-up hold via market-hold edge function (uses first order's ID)
      const totalCents = Math.round(orderTotal * 100)
      const holdCents = Math.round(Math.max(0, orderTotal - balanceApplied) * 100)
      if (holdCents > 0 || needsCard) {
        const { data: holdResult, error: holdErr } = await supabase.functions.invoke('market-hold', {
          body: {
            order_id: placedOrderIds[0], // Required — first order triggers the hold
            amount_cents: totalCents,
            suggested_hold_cents: holdCents,
          },
        })

        if (holdErr || holdResult?.error) {
          const msg = holdResult?.error || holdErr?.message || 'Unknown error'
          setCheckoutError('Failed to authorize card: ' + msg)
          // Rollback all orders
          for (const oid of placedOrderIds) {
            await supabase.from('market_orders').update({ status: 'cancelled' }).eq('id', oid)
          }
          setCheckingOut(false)
          return
        }

        // Step 3: Confirm card payment if Stripe requires it
        if (holdResult?.requiresCardEntry) {
          if (!stripeRef.current || !cardElementRef.current) {
            // Card is required but element not mounted — rollback and error
            setCheckoutError('Card payment is required but the card form did not load. Please refresh and try again.')
            for (const oid of placedOrderIds) {
              await supabase.from('market_orders').update({ status: 'cancelled' }).eq('id', oid)
            }
            setCheckingOut(false)
            return
          }
          const { error: stripeErr } = await stripeRef.current.confirmCardPayment(
            holdResult.clientSecret,
            {
              payment_method: { card: cardElementRef.current },
              return_url: `${window.location.origin}/orders`,
            },
          )
          if (stripeErr) {
            setCheckoutError(stripeErr.message || 'Card declined')
            // Rollback: cancel all orders, balance is restored by DB trigger
            for (const oid of placedOrderIds) {
              await supabase.from('market_orders').update({ status: 'cancelled' }).eq('id', oid)
            }
            setCheckingOut(false)
            return
          }
        }

        // Link remaining orders to the same hold
        if (holdResult?.holdId && placedOrderIds.length > 1) {
          for (let i = 1; i < placedOrderIds.length; i++) {
            await supabase.from('market_orders').update({ hold_id: holdResult.holdId }).eq('id', placedOrderIds[i])
          }
        }
      }

      // Step 4: Success — remove items from cart
      for (const pid of placedProductIds) {
        removeItem(pid)
      }
      showToast(`🎉 ${placedOrderIds.length} order${placedOrderIds.length > 1 ? 's' : ''} placed!`)
      setTimeout(() => router.push('/orders?role=buying'), 1500)

    } catch (err: any) {
      setCheckoutError('Checkout failed: ' + (err?.message || 'Unknown error'))
      // Rollback any orders placed before the crash
      for (const oid of placedOrderIds) {
        try {
          await supabase.from('market_orders').update({ status: 'cancelled' }).eq('id', oid)
        } catch {} // best-effort cleanup
      }
    }
    setCheckingOut(false)
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
          <Link href="/market" className="btn btn-primary">Browse Market</Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.cartPage}>
      <h1 className={styles.cartTitle}>🛒 Your Cart</h1>
      <p className={styles.cartSubtitle}>
        {items.length} item{items.length > 1 ? 's' : ''} from {boothGroups.length} booth{boothGroups.length > 1 ? 's' : ''}
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
        return allAvailable.length > 0 && (
          <div className={styles.grandTotalSection}>
            <div className={styles.grandTotalRow}>
              <span>Grand Total ({allAvailable.length} item{allAvailable.length !== 1 ? 's' : ''})</span>
              <span className={styles.grandTotalAmount}>{formatUsd(grandTotal)}</span>
            </div>
            {balanceApplied > 0 && (
              <div className={styles.balanceRow}>
                <span>💰 Available Balance</span>
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

            {/* Stripe Card Element — only shown when card is needed */}
            {needsCard && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
                  💳 Payment
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
            </p>
          </div>
        )
      })()}

      <Link href="/market" className={styles.continueLink}>← Continue Shopping</Link>

      {/* Toast */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
