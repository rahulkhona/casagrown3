'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { formatUsd } from '../../lib/store'
import { trackClick, trackError } from '../../lib/analytics'
import { useNotificationPrompt } from '../../lib/useNotificationPrompt'
import { useMarketStatus, isProductExpired } from '../../lib/useMarketStatus'
import { NotificationPromptModal } from './NotificationPromptModal'
import styles from './BuyModal.module.css'

interface BuyModalProps {
  product: {
    id: string; name: string; price_usd: number; unit: string;
    inventory: number; category: string; photos?: string[]; market_date?: string
  }
  booth: {
    id: string; name: string; offers_delivery: boolean; offers_pickup: boolean;
    pickup_address?: string; delivery_radius_miles?: number
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
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>(
    booth.offers_pickup ? 'pickup' : 'delivery'
  )
  const [available, setAvailable] = useState(product.inventory)
  const [currentPrice, setCurrentPrice] = useState(product.price_usd)
  const [holdAmountStr, setHoldAmountStr] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState(buyerAddress || '')
  const [deliveryInstructions, setDeliveryInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [taxInfo, setTaxInfo] = useState<{ rate: number; amount: number } | null>(null)
  const [stripeReady, setStripeReady] = useState(false)
  const cardElementRef = useRef<any>(null)
  const stripeRef = useRef<any>(null)
  const [existingHold, setExistingHold] = useState<{ holdAmountCents: number; spentAmountCents: number } | null>(null)
  const [availableBalance, setAvailableBalance] = useState(0) // buyer's available USD balance

  // Push notification prompt
  const { showPrompt, modalProps } = useNotificationPrompt(user?.id)

  // Market hours + product expiry
  const { isOpen: marketIsOpen, todaySchedule, productsNeverExpire, loading: marketLoading } = useMarketStatus()
  const productExpired = product.market_date ? isProductExpired(product.market_date, productsNeverExpire) : false
  const canOrder = marketIsOpen && !productExpired

  const MINIMUM_ORDER_USD = 5.00
  const subtotal = currentPrice * qty
  const computedTax = +(subtotal * (taxInfo?.rate || 0) / 100).toFixed(2)
  const total = +(subtotal + computedTax).toFixed(2)
  const isTaxExempt = (taxInfo?.rate || 0) === 0
  const totalCents = Math.round(total * 100)
  const priceChanged = currentPrice !== product.price_usd
  const belowMinimum = subtotal < MINIMUM_ORDER_USD
  const minQtyForOrder = Math.ceil(MINIMUM_ORDER_USD / (currentPrice || 1))
  const canReachMinimum = currentPrice * available >= MINIMUM_ORDER_USD

  // Balance vs card split calculation
  const balanceApplied = Math.min(availableBalance, total)
  const cardAmount = Math.max(0, total - balanceApplied)
  const cardCents = Math.round(cardAmount * 100)
  const holdRemaining = existingHold
    ? existingHold.holdAmountCents - existingHold.spentAmountCents
    : 0
  const needsCard = cardCents > 0 && (!existingHold || holdRemaining < cardCents)
  const additionalNeeded = needsCard ? (cardCents - holdRemaining) / 100 : 0
  const suggestedAdditional = needsCard ? Math.max(cardAmount * 3, additionalNeeded) : 0

  // Fetch fresh price + inventory when buy form opens
  useEffect(() => {
    const fetchFresh = async () => {
      const { data } = await supabase
        .from('market_products')
        .select('price_usd, inventory')
        .eq('id', product.id)
        .single()
      if (data) {
        setCurrentPrice(Number(data.price_usd))
        setAvailable(data.inventory)
        if (qty > data.inventory) setQty(Math.max(1, data.inventory))
      }
    }
    fetchFresh()
  }, [product.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch existing active hold
  useEffect(() => {
    if (!user) return
    const fetchHold = async () => {
      const { data } = await supabase
        .from('market_holds')
        .select('hold_amount_cents, spent_amount_cents')
        .eq('buyer_id', user.id)
        .eq('status', 'active')
        .single()
      if (data) {
        setExistingHold({
          holdAmountCents: data.hold_amount_cents,
          spentAmountCents: data.spent_amount_cents,
        })
      }
    }
    fetchHold()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Initialize Stripe Elements
  useEffect(() => {
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
  }, [])

  // Fetch tax rate
  useEffect(() => {
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
    if (needsCard && (!stripeReady || !cardElementRef.current)) { setError('Card form is loading, please wait'); return }

    setLoading(true)
    setError('')
    trackClick('place_order', { productId: product.id, qty, total, fulfillment })

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
        if (orderResult.code === 'minimum_order') {
          setError(`Minimum order is $5.00. Add ${orderResult.suggested_quantity - qty} more ${product.unit}(s) to proceed.`)
          setLoading(false)
          return
        }
        setError(orderResult.error); setLoading(false); return
      }

      // Step 2: Create/top-up Stripe hold
      const suggestedHold = holdAmountStr ? Math.round(parseFloat(holdAmountStr) * 100) : undefined
      const { data: holdResult, error: holdErr } = await supabase.functions.invoke('market-hold', {
        body: {
          order_id: orderResult.order_id,
          amount_cents: orderResult.total_cents,
          suggested_hold_cents: suggestedHold,
        },
      })

      if (holdErr) { setError(holdErr.message || 'Failed to create payment hold'); setLoading(false); return }

      // Step 3: Confirm with Stripe Elements (only if card entry is needed)
      if (holdResult.requiresCardEntry && stripeRef.current && cardElementRef.current) {
        const { error: stripeErr } = await stripeRef.current.confirmCardPayment(
          holdResult.clientSecret,
          { payment_method: { card: cardElementRef.current } },
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
  }, [user, qty, available, fulfillment, deliveryAddress, buyerZip, product.id, holdAmountStr, stripeReady, supabase, onSuccess])

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

          {/* Market closed banner */}
          {!marketLoading && !marketIsOpen && (
            <div className={styles.error} style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}>
              🕐 <strong>Market is currently closed.</strong>
              {todaySchedule
                ? ` Hours today: ${todaySchedule.open_time} – ${todaySchedule.close_time}.`
                : ' The market is not open today. Check back on a market day!'}
            </div>
          )}

          {/* Expired product banner */}
          {productExpired && (
            <div className={styles.error} style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fca5a5' }}>
              ⏰ <strong>This product was listed for a previous market day</strong> ({product.market_date}) and is no longer available.
            </div>
          )}

          {/* Minimum order warning */}
          {belowMinimum && (
            <div className={styles.minimumWarning}>
              {canReachMinimum
                ? `⚠️ Minimum order is $${MINIMUM_ORDER_USD.toFixed(2)}. Add at least ${minQtyForOrder} ${product.unit}(s) ($${(currentPrice * minQtyForOrder).toFixed(2)}).`
                : `⚠️ This product can't reach the $${MINIMUM_ORDER_USD.toFixed(2)} minimum — only ${available} available at ${formatUsd(currentPrice)}/${product.unit}.`
              }
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
              {booth.offers_pickup && (
                <button className={`${styles.fulfillBtn} ${fulfillment === 'pickup' ? styles.fulfillActive : ''}`}
                  onClick={() => setFulfillment('pickup')}>📍 Pickup</button>
              )}
              {booth.offers_delivery && (
                <button className={`${styles.fulfillBtn} ${fulfillment === 'delivery' ? styles.fulfillActive : ''}`}
                  onClick={() => setFulfillment('delivery')}>🚗 Delivery</button>
              )}
            </div>

            {/* Pickup address */}
            {fulfillment === 'pickup' && booth.pickup_address && (
              <div className={styles.addressInfo}>
                <span className={styles.addressIcon}>📍</span>
                <span>Pickup at: <strong>{booth.pickup_address}</strong></span>
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

          {/* Price Breakdown */}
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

          {/* Existing hold info */}
          {existingHold && (
            <div className={styles.section}>
              <div className={styles.holdInfo}>
                <div className={styles.holdInfoLabel}>💳 Existing Hold</div>
                <div className={styles.holdInfoGrid}>
                  <span>Authorized</span>
                  <strong>{formatUsd(existingHold.holdAmountCents / 100)}</strong>
                  <span>Spent so far</span>
                  <strong>{formatUsd(existingHold.spentAmountCents / 100)}</strong>
                  <span>Remaining</span>
                  <strong>{formatUsd(holdRemaining / 100)}</strong>
                </div>
                {!needsCard && (
                  <p className={styles.holdCovered}>
                    ✅ This order of {formatUsd(total)} is covered by your existing hold — no card entry needed.
                  </p>
                )}
                {needsCard && (
                  <p className={styles.holdShort}>
                    ⚠️ Your remaining hold ({formatUsd(holdRemaining / 100)}) doesn't cover this {formatUsd(total)} order.
                    An additional {formatUsd(additionalNeeded)} authorization is needed.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Hold Suggestion — only when card is needed */}
          {needsCard && (
            <div className={styles.section}>
              <div className={styles.holdSuggestion}>
                <div className={styles.holdLabel}>
                  {existingHold ? '💡 Increase your hold?' : '💡 Pre-authorize a higher amount?'}
                </div>
                <div className={styles.holdDesc}>
                  Pre-authorize a larger amount so you won't need to re-enter your card for each
                  purchase. At the end of the market day, all your transactions are netted — purchases
                  you made minus any earnings from your own sales. Only the net balance (if positive)
                  is charged to your card. If your sales exceed your purchases, the difference is
                  credited to you. Any unused hold is automatically released.
                </div>
                <input
                  className={styles.holdInput}
                  type="number"
                  placeholder={`Suggested: $${suggestedAdditional.toFixed(2)}`}
                  value={holdAmountStr}
                  onChange={e => setHoldAmountStr(e.target.value)}
                  min={additionalNeeded}
                  step="0.01"
                />
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
          <button className={styles.orderBtn} disabled={loading || available === 0 || belowMinimum || !canOrder || (needsCard && !stripeReady)} onClick={handleOrder}>
            {loading ? 'Processing...' : !marketIsOpen ? '🔒 Market Closed' : productExpired ? '⏰ Product Expired' : available === 0 ? 'Sold Out' : `Place Order — ${formatUsd(total)}`}
          </button>
          <p className={styles.holdNotice}>
            {needsCard
              ? `Your card will be authorized for ${holdAmountStr ? `$${parseFloat(holdAmountStr).toFixed(2)}` : formatUsd(cardAmount)}${balanceApplied > 0 ? ` (${formatUsd(balanceApplied)} from balance)` : ''}. At end of day, only your actual net total is charged.`
              : balanceApplied > 0
                ? `${formatUsd(balanceApplied)} will be applied from your balance. No card authorization needed.`
                : `This order is covered by your existing hold. No additional card authorization needed.`
            }
          </p>
        </div>
      </div>
      <NotificationPromptModal {...modalProps} />
    </div>
  )
}
