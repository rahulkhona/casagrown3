'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { formatUsd } from '../../lib/store'
import { trackClick, trackError } from '../../lib/analytics'
import { useNotificationPrompt } from '../../lib/useNotificationPrompt'
import { useMarketStatus, isProductExpired } from '../../lib/useMarketStatus'
import { hasValidWindows } from '../../lib/windowUtils'
import { NotificationPromptModal } from './NotificationPromptModal'
import styles from './BuyModal.module.css'

interface BuyModalProps {
  product: {
    id: string; name: string; price_usd: number; unit: string;
    inventory: number; category: string; photos?: string[]; market_date?: string; expires_at?: string;
    window_dates?: any[]; product_delivery_windows?: any[]; product_pickup_windows?: any[]
  }
  booth: {
    id: string; name: string; offers_delivery: boolean; offers_pickup: boolean;
    pickup_address?: string; pickup_display_address?: string; delivery_radius_miles?: number
  }
  buyerZip?: string
  buyerAddress?: string
  onClose: () => void
  onSuccess: (order: any) => void
}

export default function BuyModal({ product, booth, buyerZip, buyerAddress, onClose, onSuccess }: BuyModalProps) {
  const supabase = createClient()
  const { user } = useAuth()
  const [qty, setQty] = useState(1)

  // Fulfillment: null = seller didn't enable this for the product; non-null = enabled
  const productOffersPickup = product?.product_pickup_windows != null
  const productOffersDelivery = product?.product_delivery_windows != null

  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>(
    productOffersPickup ? 'pickup' : 'delivery'
  )
  const [available, setAvailable] = useState(product.inventory)
  const [currentPrice, setCurrentPrice] = useState(product.price_usd)

  const [deliveryAddress, setDeliveryAddress] = useState(buyerAddress || '')
  const [deliveryInstructions, setDeliveryInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [taxInfo, setTaxInfo] = useState<{ rate: number; amount: number } | null>(null)
  const [stripeReady, setStripeReady] = useState(false)
  const cardElementRef = useRef<any>(null)
  const stripeRef = useRef<any>(null)
  const [availableBalance, setAvailableBalance] = useState(0) // buyer's available USD balance

  // Push notification prompt
  const { showPrompt, modalProps } = useNotificationPrompt(user?.id)

  // Market hours + product expiry
  const { isOpen: marketIsOpen, todaySchedule, productsNeverExpire, loading: marketLoading } = useMarketStatus()
  const productExpired = product.market_date ? isProductExpired(product.market_date, productsNeverExpire) : false

  // Window data state (fetched fresh or from props)
  const [windowDates, setWindowDates] = useState<any[]>(product.window_dates || [])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>(product.product_delivery_windows || [])
  const [pickupWindows, setPickupWindows] = useState<any[]>(product.product_pickup_windows || [])

  // Mode-specific window check: does the selected fulfillment mode have valid windows?
  const windowsValid = hasValidWindows(windowDates, deliveryWindows, pickupWindows, fulfillment)
  const canOrder = !productExpired && windowsValid

  const subtotal = currentPrice * qty
  const computedTax = +(subtotal * (taxInfo?.rate || 0) / 100).toFixed(2)
  const total = +(subtotal + computedTax).toFixed(2)
  const isTaxExempt = (taxInfo?.rate || 0) === 0
  const totalCents = Math.round(total * 100)
  const priceChanged = currentPrice !== product.price_usd
  const isFreeProduct = currentPrice === 0

  // Balance vs card split calculation
  const balanceApplied = Math.min(availableBalance, total)
  const cardAmount = Math.max(0, total - balanceApplied)
  const cardCents = Math.round(cardAmount * 100)
  const needsCard = !isFreeProduct && cardCents > 0

  // Fetch fresh price + inventory when buy form opens
  useEffect(() => {
    const fetchFresh = async () => {
      const { data } = await supabase
        .from('market_products')
        .select('price_usd, inventory, window_dates, product_delivery_windows, product_pickup_windows')
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
      }
    }
    fetchFresh()
  }, [product.id]) // eslint-disable-line react-hooks/exhaustive-deps


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

  // Initialize Stripe Elements (skip for free products)
  useEffect(() => {
    if (isFreeProduct) return
    const initStripe = async () => {
      try {
        const { loadStripe } = await import('@stripe/stripe-js')
        const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')
        if (!stripe) return

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

        // Mount after a short delay to ensure container is rendered
        setTimeout(() => {
          const container = document.getElementById('stripe-card-element')
          if (container) {
            cardElement.mount('#stripe-card-element')
            cardElementRef.current = cardElement
            setStripeReady(true)
          }
        }, 100)
      } catch (err) {
        console.warn('Failed to load Stripe Elements:', err)
      }
    }
    initStripe()

    return () => {
      if (cardElementRef.current) {
        try { cardElementRef.current.unmount() } catch {}
      }
    }
  }, [isFreeProduct])

  // Fetch tax rate (skip for free products)
  useEffect(() => {
    if (isFreeProduct) { setTaxInfo({ rate: 0, amount: 0 }); return }
    const fetchTax = async () => {
      if (!buyerZip || !product.category) { setTaxInfo({ rate: 0, amount: 0 }); return }

      const { data: zipData } = await supabase
        .from('zip_codes')
        .select('city_id, cities!inner(state_id, states!inner(code))')
        .eq('zip_code', buyerZip)
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
          .eq('zip_code', buyerZip)
          .gt('expires_at', new Date().toISOString())
          .single()
        setTaxInfo({ rate: cached?.combined_rate || 0, amount: 0 })
      }
    }
    fetchTax()
  }, [buyerZip, product.category]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleQtyChange = (val: string) => {
    const n = parseInt(val, 10)
    if (isNaN(n) || n < 1) setQty(1)
    else if (n > available) setQty(available)
    else setQty(n)
  }

  const handleOrder = useCallback(async () => {
    if (!user) { setError('Please sign in to make a purchase'); return }
    if (qty > available) { setError(`Only ${available} available`); return }
    if (fulfillment === 'delivery' && !deliveryAddress.trim()) { setError('Please enter a delivery address'); return }
    if (!hasValidWindows(windowDates, deliveryWindows, pickupWindows, fulfillment)) {
      setError(`No ${fulfillment} windows available. ${fulfillment === 'delivery' ? 'Try switching to Pickup.' : 'Try switching to Delivery.'}`)
      return
    }
    if (needsCard && (!stripeReady || !cardElementRef.current)) { setError('Card form is loading, please wait'); return }

    setLoading(true)
    setError('')
    trackClick('place_order', { productId: product.id, boothId: booth.id, boothName: booth.name, qty, total, fulfillment })

    try {
      // Step 1: Place order (atomic)
      const { data: orderResult, error: orderErr } = await supabase.rpc('place_market_order', {
        p_product_id: product.id,
        p_quantity: qty,
        p_fulfillment_type: fulfillment,
        p_buyer_zip: buyerZip || null,
        p_expected_price: currentPrice,
      })

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

      // Step 2: Create/top-up Stripe hold (exact order amount — no larger hold)
      const { data: holdResult, error: holdErr } = await supabase.functions.invoke('market-hold', {
        body: {
          order_id: orderResult.order_id,
          amount_cents: orderResult.total_cents,
        },
      })

      if (holdErr || holdResult?.error) {
        const msg = holdResult?.error || holdErr?.message || 'Failed to create payment hold'
        setError(msg)
        // Rollback: cancel the order we just placed
        await supabase.from('market_orders').update({ status: 'cancelled' }).eq('id', orderResult.order_id)
        setLoading(false)
        return
      }

      // Step 3: Confirm with Stripe Elements (only if card entry is needed)
      if (holdResult.requiresCardEntry && stripeRef.current && cardElementRef.current) {
        const { error: stripeErr } = await stripeRef.current.confirmCardPayment(
          holdResult.clientSecret,
          {
            payment_method: { card: cardElementRef.current },
            return_url: `${window.location.origin}/orders`,
          },
        )
        if (stripeErr) {
          setError(stripeErr.message || 'Card declined')
          setLoading(false)
          return
        }
      }

      // Success
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
    }
  }, [user, qty, available, fulfillment, deliveryAddress, buyerZip, product.id, stripeReady, supabase, onSuccess])

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
              ⏰ <strong>This product was listed for a previous market day</strong> ({product.market_date}) and is no longer available.
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
              <span className={styles.qtyAvail}>{available} {product.unit}s available</span>
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
            {fulfillment === 'pickup' && (booth.pickup_display_address || booth.pickup_address) && (
              <div className={styles.addressInfo}>
                <span className={styles.addressIcon}>📍</span>
                <span>Pickup near: <strong>{booth.pickup_display_address || booth.pickup_address}</strong></span>
              </div>
            )}

            {/* Delivery address */}
            {fulfillment === 'delivery' && (
              <>
                <input
                  className={styles.cardInput}
                  placeholder="Your delivery address"
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                  style={{ marginTop: 10 }}
                />
                <input
                  className={styles.cardInput}
                  placeholder="Delivery instructions (e.g. gate code, leave at door)"
                  value={deliveryInstructions}
                  onChange={e => setDeliveryInstructions(e.target.value)}
                  style={{ marginTop: 8 }}
                />
                {booth.delivery_radius_miles && (
                  <p className={styles.deliveryNote}>Delivery available within {booth.delivery_radius_miles} miles of seller</p>
                )}
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
                    <span>💰 From Balance</span>
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






          {/* Stripe Card Element — only when card is needed */}
          {needsCard && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Payment</div>
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
