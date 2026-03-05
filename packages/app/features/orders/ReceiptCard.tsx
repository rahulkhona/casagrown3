/**
 * ReceiptCard — Shared digital receipt component
 *
 * Used by both ChatScreen (for receipt messages) and TransactionHistoryScreen
 * (for transaction log receipt section). Single source of truth for receipt layout.
 */

import React from 'react'
import { YStack, XStack, Text } from 'tamagui'
import { colors } from '../../design-tokens'
import { useTranslation } from 'react-i18next'

export interface ReceiptData {
  orderId?: string
  completedAt?: string
  sellerName?: string
  sellerZip?: string
  buyerName?: string
  buyerZip?: string
  harvestDate?: string
  product?: string
  quantity?: number
  unit?: string
  pointsPerUnit?: number
  subtotal?: number
  tax?: number
  platformFee?: number
  sellerPayout?: number
}

interface ReceiptCardProps {
  data: ReceiptData
  /** Render inside a green background card (transaction log style) or standalone (chat style) */
  variant?: 'card' | 'inline'
}

export function ReceiptCard({ data, variant = 'card' }: ReceiptCardProps) {
  const { t } = useTranslation()
  const total = (data.subtotal || 0) + (data.tax || 0)

  const containerProps = variant === 'card'
    ? {
        backgroundColor: colors.green[50],
        paddingHorizontal: '$3' as const,
        paddingVertical: '$2' as const,
        borderTopWidth: 1,
        borderTopColor: colors.green[200],
      }
    : {
        backgroundColor: colors.green[50],
        paddingHorizontal: '$3' as const,
        paddingVertical: '$3' as const,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.green[200],
      }

  return (
    <YStack {...containerProps} gap={2}>
      <Text fontSize={11} fontWeight="700" color={colors.green[800]} textAlign="center">
        {t('orders.receipt.title')}
      </Text>

      {/* ── Transaction Info ── */}
      <Text fontSize={10} fontWeight="600" color={colors.gray[500]} marginTop={2}>
        Transaction Info
      </Text>
      {data.orderId && (
        <XStack justifyContent="space-between">
          <Text fontSize={11} color={colors.gray[600]}>ID</Text>
          <Text fontSize={11} color={colors.gray[800]}>
            {data.orderId.substring(0, 8)}...{data.orderId.slice(-3)}
          </Text>
        </XStack>
      )}
      {data.completedAt && (
        <XStack justifyContent="space-between">
          <Text fontSize={11} color={colors.gray[600]}>Date</Text>
          <Text fontSize={11} color={colors.gray[800]}>
            {new Date(data.completedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </XStack>
      )}
      <XStack justifyContent="space-between">
        <Text fontSize={11} color={colors.gray[600]}>Type</Text>
        <Text fontSize={11} color={colors.gray[800]}>Affiliated Network Fulfillment</Text>
      </XStack>

      {/* ── Seller Info ── */}
      <YStack height={1} backgroundColor={colors.green[200]} marginVertical={2} />
      <Text fontSize={10} fontWeight="600" color={colors.gray[500]}>Seller Info</Text>
      <XStack justifyContent="space-between">
        <Text fontSize={11} color={colors.gray[600]}>{t('orders.receipt.seller')}</Text>
        <Text fontSize={11} color={colors.gray[800]}>{data.sellerName || 'N/A'}</Text>
      </XStack>
      <XStack justifyContent="space-between">
        <Text fontSize={11} color={colors.gray[600]}>Zip</Text>
        <Text fontSize={11} color={colors.gray[800]}>{data.sellerZip || 'N/A'}</Text>
      </XStack>
      {data.harvestDate && (
        <XStack justifyContent="space-between">
          <Text fontSize={11} color={colors.gray[600]}>{t('orders.receipt.harvestDate')}</Text>
          <Text fontSize={11} color={colors.gray[800]}>{data.harvestDate}</Text>
        </XStack>
      )}

      {/* ── Buyer Info ── */}
      <YStack height={1} backgroundColor={colors.green[200]} marginVertical={2} />
      <Text fontSize={10} fontWeight="600" color={colors.gray[500]}>Buyer Info</Text>
      <XStack justifyContent="space-between">
        <Text fontSize={11} color={colors.gray[600]}>{t('orders.receipt.buyer')}</Text>
        <Text fontSize={11} color={colors.gray[800]}>{data.buyerName || 'N/A'}</Text>
      </XStack>
      <XStack justifyContent="space-between">
        <Text fontSize={11} color={colors.gray[600]}>Zip</Text>
        <Text fontSize={11} color={colors.gray[800]}>{data.buyerZip || 'N/A'}</Text>
      </XStack>

      {/* ── Order Details ── */}
      <YStack height={1} backgroundColor={colors.green[200]} marginVertical={2} />
      <Text fontSize={10} fontWeight="600" color={colors.gray[500]}>Order Details</Text>
      {data.product && (
        <XStack justifyContent="space-between">
          <Text fontSize={11} color={colors.gray[800]}>
            {data.product} | {data.quantity ?? ''} {data.unit ?? ''}
            {data.pointsPerUnit ? `  ${data.pointsPerUnit} pts` : ''}
          </Text>
        </XStack>
      )}
      {data.subtotal != null && (
        <XStack justifyContent="space-between">
          <Text fontSize={11} color={colors.gray[600]}>Subtotal</Text>
          <Text fontSize={11} color={colors.gray[800]}>{data.subtotal.toLocaleString()} pts</Text>
        </XStack>
      )}
      <XStack justifyContent="space-between">
        <Text fontSize={11} color={colors.gray[600]}>Sales Tax</Text>
        <Text fontSize={11} color={colors.gray[800]}>{(data.tax ?? 0).toLocaleString()} pts</Text>
      </XStack>
      {data.subtotal != null && (
        <XStack justifyContent="space-between">
          <Text fontSize={11} fontWeight="600" color={colors.gray[800]}>Total</Text>
          <Text fontSize={11} fontWeight="600" color={colors.gray[800]}>
            {total.toLocaleString()} pts
          </Text>
        </XStack>
      )}

      {/* Platform fee — seller only */}
      {data.platformFee != null && data.platformFee > 0 && (
        <>
          <YStack height={1} backgroundColor={colors.green[200]} marginVertical={2} />
          <XStack justifyContent="space-between">
            <Text fontSize={11} color={colors.amber[700]}>Platform Fee (10%)</Text>
            <Text fontSize={11} color={colors.amber[700]}>
              -{data.platformFee.toLocaleString()} pts
            </Text>
          </XStack>
          {data.sellerPayout != null && (
            <XStack justifyContent="space-between">
              <Text fontSize={11} fontWeight="600" color={colors.green[700]}>You Received</Text>
              <Text fontSize={11} fontWeight="600" color={colors.green[700]}>
                {data.sellerPayout.toLocaleString()} pts
              </Text>
            </XStack>
          )}
        </>
      )}
    </YStack>
  )
}

/**
 * Helper to convert chat message metadata or ledger metadata to ReceiptData.
 * Both sources use the same metadata keys.
 */
export function metadataToReceiptData(meta: Record<string, any>): ReceiptData {
  return {
    orderId: meta.order_id,
    completedAt: meta.completed_at,
    sellerName: meta.seller_name,
    sellerZip: meta.seller_zip,
    buyerName: meta.buyer_name,
    buyerZip: meta.buyer_zip,
    harvestDate: meta.harvest_date,
    product: meta.product,
    quantity: meta.quantity,
    unit: meta.unit,
    pointsPerUnit: meta.points_per_unit,
    subtotal: meta.total || meta.subtotal || (meta.points_per_unit && meta.quantity ? meta.points_per_unit * meta.quantity : undefined),
    tax: meta.tax,
    platformFee: meta.platform_fee,
    sellerPayout: meta.seller_payout,
  }
}
