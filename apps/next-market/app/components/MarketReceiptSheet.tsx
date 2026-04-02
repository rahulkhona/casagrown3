'use client'

/**
 * MarketReceiptSheet — Compliance receipt for market purchases/sales
 *
 * Web equivalent of community app's ReceiptCard. Shows:
 * - Transaction Info (ID, Date, Type)
 * - Seller Info (Booth, Name, Zip)
 * - Buyer Info (Name, Zip)
 * - Order Details (Product, Qty × Price, Subtotal)
 * - Tax (Rate, Amount)
 * - Total
 * - Platform Fee + Net Payout (seller view)
 * - Settlement Info (settlement date, card last 4)
 */

import styles from './MarketReceiptSheet.module.css'

export interface MarketReceiptData {
  orderId: string
  date: string
  status: string
  // Seller info
  sellerName: string
  boothName?: string
  sellerZip?: string
  sellerState?: string
  // Buyer info
  buyerName: string
  buyerZip?: string
  // Order details
  productName: string
  quantity: number
  unitPrice: number
  subtotal: number
  // Tax
  taxRate: number
  taxAmount: number
  // Fees (seller view)
  platformFee?: number
  platformFeePct?: number
  netPayout?: number
  // Total
  total: number
  // Fulfillment
  fulfillment: string
  // Settlement info
  settlementId?: string
  cardLast4?: string
  // Which view
  viewAs: 'buyer' | 'seller'
  // Compliance
  receiptFooter?: string
}

interface Props {
  visible: boolean
  data: MarketReceiptData
  onClose: () => void
}

function formatUsd(v: number) {
  return '$' + v.toFixed(2)
}

function truncateId(id: string) {
  if (id.length <= 12) return id
  return id.substring(0, 8) + '...' + id.slice(-3)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export function MarketReceiptSheet({ visible, data, onClose }: Props) {
  if (!visible) return null

  const statusClass = data.status === 'completed' ? styles.statusCompleted
    : data.status === 'delivered' ? styles.statusDelivered
    : styles.statusPending

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            {data.viewAs === 'seller' ? '💰 Sale Receipt' : '🛒 Purchase Receipt'}
          </span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Receipt Title */}
          <div className={styles.receiptTitle}>🧾 Digital Receipt</div>

          {/* Transaction Info */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Transaction Info</div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>ID</span>
              <span className={styles.rowValue}>{truncateId(data.orderId)}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Date</span>
              <span className={styles.rowValue}>{formatDate(data.date)}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Type</span>
              <span className={styles.rowValue}>Market {data.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Status</span>
              <span className={`${styles.statusBadge} ${statusClass}`}>
                {data.status === 'completed' ? '✅' : data.status === 'delivered' ? '📦' : '⏳'} {data.status}
              </span>
            </div>
          </div>

          <div className={styles.divider} />

          {/* Seller Info */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Seller Info</div>
            {data.boothName && (
              <div className={styles.row}>
                <span className={styles.rowLabel}>Booth</span>
                <span className={styles.rowValue}>{data.boothName}</span>
              </div>
            )}
            <div className={styles.row}>
              <span className={styles.rowLabel}>Seller</span>
              <span className={styles.rowValue}>{data.sellerName}</span>
            </div>
            {data.sellerZip && (
              <div className={styles.row}>
                <span className={styles.rowLabel}>Zip</span>
                <span className={styles.rowValue}>{data.sellerZip}</span>
              </div>
            )}
          </div>

          <div className={styles.divider} />

          {/* Buyer Info */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Buyer Info</div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Buyer</span>
              <span className={styles.rowValue}>{data.buyerName}</span>
            </div>
            {data.buyerZip && (
              <div className={styles.row}>
                <span className={styles.rowLabel}>Zip</span>
                <span className={styles.rowValue}>{data.buyerZip}</span>
              </div>
            )}
          </div>

          <div className={styles.divider} />

          {/* Order Details */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Order Details</div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{data.productName}</span>
              <span className={styles.rowValue}>
                {data.quantity} × {formatUsd(data.unitPrice)}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Subtotal</span>
              <span className={styles.rowValue}>{formatUsd(data.subtotal)}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>
                Sales Tax{data.taxRate > 0 ? ` (${data.taxRate}%)` : ''}
              </span>
              <span className={styles.rowValue}>{formatUsd(data.taxAmount)}</span>
            </div>

            <div className={`${styles.row} ${styles.totalRow}`}>
              <span className={styles.totalLabel}>Total</span>
              <span className={styles.totalValue}>{formatUsd(data.total)}</span>
            </div>
          </div>

          {/* Platform Fee — seller view */}
          {data.viewAs === 'seller' && data.platformFee != null && data.platformFee > 0 && (
            <>
              <div className={styles.divider} />
              <div className={styles.section}>
                <div className={`${styles.row} ${styles.feeRow}`}>
                  <span className={styles.feeLabel}>Platform Fee ({data.platformFeePct ?? (data.subtotal > 0 ? Math.round(data.platformFee! / data.subtotal * 100) : 10)}%)</span>
                  <span className={styles.feeValue}>-{formatUsd(data.platformFee)}</span>
                </div>
                {data.netPayout != null && (
                  <div className={`${styles.row} ${styles.payoutRow}`}>
                    <span className={styles.payoutLabel}>{data.settlementId ? 'You Received' : 'You Will Receive'}</span>
                    <span className={styles.payoutValue}>{formatUsd(data.netPayout)}</span>
                  </div>
                )}
                {!data.settlementId && (
                  <p style={{ fontSize: 10, color: 'var(--gray-400)', margin: '4px 0 0', lineHeight: 1.4 }}>
                    Earnings are available after market settlement.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Settlement Info */}
          {(data.settlementId || data.cardLast4) && (
            <>
              <div className={styles.divider} />
              <div className={styles.section}>
                <div className={styles.sectionLabel}>Settlement</div>
                {data.settlementId && (
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>Settlement</span>
                    <span className={styles.rowValue}>{truncateId(data.settlementId)}</span>
                  </div>
                )}
                {data.cardLast4 && (
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>Card Charged</span>
                    <span className={styles.rowValue}>•••• {data.cardLast4}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Cottage Food / Compliance Footer */}
          {data.receiptFooter && (
            <>
              <div className={styles.divider} />
              <div style={{
                padding: '12px 0 4px',
                textAlign: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#92400e',
                background: '#fffbeb',
                borderRadius: 6,
                marginTop: 8,
                lineHeight: 1.4,
              }}>
                {data.receiptFooter}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
