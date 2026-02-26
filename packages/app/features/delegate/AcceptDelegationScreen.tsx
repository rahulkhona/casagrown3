/**
 * AcceptDelegationScreen — Delegating For management
 *
 * Extracted from DelegateScreen to separate the "Delegating For" persona.
 */

import { useState } from 'react'
import { Platform } from 'react-native'
import { YStack, XStack, Text, Button, ScrollView, Spinner } from 'tamagui'
import { useRouter } from 'solito/navigation'
import {
  Users,
  ShieldCheck,
  XCircle,
  CheckCircle,
  Keyboard,
  ArrowLeft,
} from '@tamagui/lucide-icons'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius, tc } from '../../design-tokens'
import { useDelegations, type DelegationRecord } from './useDelegations'
import JoinByCodeSheet from './JoinByCodeSheet'

// ─── Status Badge ──────────────────────────────────────────────
function StatusBadge({ status, hasActivePosts, t }: { status: string; hasActivePosts?: boolean; t: (k: string) => string }) {
  const displayStatus =
    (status === 'revoked' || status === 'inactive') && hasActivePosts
      ? 'winding_down'
      : status

  const config: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: colors.green[100], text: colors.green[800], label: t('delegate.status.active') },
    pending: { bg: colors.amber[100], text: colors.amber[800], label: t('delegate.status.pending') },
    pending_pairing: { bg: '#dbeafe', text: '#1e40af', label: t('delegate.status.pendingPairing') },
    winding_down: { bg: '#fef3c7', text: '#92400e', label: t('delegate.status.windingDown') },
    revoked: { bg: colors.red[100], text: colors.red[800], label: t('delegate.status.revoked') },
    inactive: { bg: colors.gray[100], text: colors.gray[600], label: t('delegate.status.inactive') },
  }
  const c = config[displayStatus] || config.active

  return (
    <YStack
      backgroundColor={tc(c.bg)}
      paddingHorizontal="$2"
      paddingVertical="$1"
      borderRadius={borderRadius.default}
    >
      <Text fontSize={11} fontWeight="600" color={tc(c.text)}>
        {c.label}
      </Text>
    </YStack>
  )
}

// ─── Delegating-For Card ───────────────────────────────────────
function DelegatingForCard({
  delegation,
  onAccept,
  onReject,
  onRevoke,
  t,
}: {
  delegation: DelegationRecord
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onRevoke: (id: string) => Promise<{ error: string | null }>
  t: (k: string) => string
}) {
  const [isRevoking, setIsRevoking] = useState(false)
  const profile = delegation.delegator_profile
  const name = profile?.full_name || t('delegate.unknownUser')

  return (
    <YStack
      backgroundColor="white"
      borderWidth={1}
      borderColor={delegation.status === 'pending' ? colors.amber[200] : colors.gray[200]}
      borderRadius={borderRadius.lg}
      padding="$4"
      gap="$3"
    >
      <XStack gap="$3" alignItems="center">
        <YStack
          width={44}
          height={44}
          borderRadius={22}
          backgroundColor={delegation.status === 'pending' ? colors.amber[100] : '#dbeafe'}
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <Users size={22} color={delegation.status === 'pending' ? colors.amber[700] : '#1d4ed8'} />
        </YStack>
        <YStack flex={1}>
          <Text fontWeight="600" color={colors.gray[900]} fontSize={15}>
            {name}
          </Text>
          <Text fontSize={12} color={colors.gray[500]} marginTop={2}>
            {delegation.status === 'pending'
              ? t('delegate.delegatingFor.requestedYou')
              : t('delegate.delegatingFor.sellingFor')}
          </Text>
        </YStack>
        <StatusBadge status={delegation.status} hasActivePosts={delegation.hasActivePosts} t={t} />
      </XStack>

      {/* Split info for active delegations */}
      {delegation.status === 'active' && delegation.delegate_pct != null && (
        <XStack
          backgroundColor={colors.green[50]}
          borderWidth={1}
          borderColor={colors.green[200]}
          borderRadius={borderRadius.default}
          padding="$2"
          gap="$2"
          alignItems="center"
        >
          <Text fontSize={12} color={colors.green[700]}>
            Your share: {delegation.delegate_pct}% · {100 - delegation.delegate_pct}% goes to delegator
          </Text>
        </XStack>
      )}

      {/* Pending: Accept / Decline */}
      {delegation.status === 'pending' && (
        <>
          {/* Show proposed split if available */}
          {delegation.delegate_pct != null && (
            <XStack
              backgroundColor="#eff6ff"
              borderWidth={1}
              borderColor="#bfdbfe"
              borderRadius={borderRadius.default}
              padding="$2"
              gap="$2"
              alignItems="center"
            >
              <Text fontSize={12} color="#1e40af">
                Proposed split: {delegation.delegate_pct}% of points go to you · {100 - delegation.delegate_pct}% to delegator
              </Text>
            </XStack>
          )}
          <XStack gap="$3">
            <Button
              flex={1}
              backgroundColor="white"
              borderWidth={2}
              borderColor={colors.red[300]}
              borderRadius={borderRadius.lg}
              paddingVertical="$2"
              onPress={() => onReject(delegation.id)}
              hoverStyle={{ backgroundColor: colors.red[50] }}
            >
              <XStack gap="$2" alignItems="center" justifyContent="center">
                <XCircle size={16} color={colors.red[600]} />
                <Text fontWeight="600" color={colors.red[600]} fontSize={13}>
                  {t('delegate.actions.decline')}
                </Text>
              </XStack>
            </Button>
            <Button
              flex={1}
              backgroundColor={colors.green[600]}
              borderRadius={borderRadius.lg}
              paddingVertical="$2"
              onPress={() => onAccept(delegation.id)}
              hoverStyle={{ backgroundColor: colors.green[700] }}
            >
              <XStack gap="$2" alignItems="center" justifyContent="center">
                <CheckCircle size={16} color="white" />
                <Text fontWeight="600" color="white" fontSize={13}>
                  {t('delegate.actions.accept')}
                </Text>
              </XStack>
            </Button>
          </XStack>
        </>
      )}

      {/* Active: Revoke */}
      {delegation.status === 'active' && (
        <Button
          borderWidth={1}
          borderColor={colors.red[300]}
          backgroundColor="white"
          borderRadius={borderRadius.lg}
          paddingVertical="$2"
          disabled={isRevoking}
          opacity={isRevoking ? 0.5 : 1}
          onPress={async () => {
            setIsRevoking(true)
            const res = await onRevoke(delegation.id)
            if (res?.error) {
              if (Platform.OS === 'web') {
                window.alert('Failed to revoke: ' + res.error)
              } else {
                console.error('Failed to revoke', res.error)
              }
            }
            setIsRevoking(false)
          }}
          hoverStyle={{ backgroundColor: colors.red[50] }}
        >
          <Text fontWeight="500" color={colors.red[600]} fontSize={13}>
            {t('delegate.actions.revoke')}
          </Text>
        </Button>
      )}

      {/* Winding down hint for the delegatee */}
      {(delegation.status === 'revoked' || delegation.status === 'inactive') && delegation.hasActivePosts && (
        <YStack
          backgroundColor="#fef3c7"
          borderWidth={1}
          borderColor="#fcd34d"
          borderRadius={borderRadius.default}
          padding="$3"
        >
          <Text fontSize={12} color="#92400e">
            {delegation.status === 'revoked'
              ? t('delegate.windingDown.revokedHint')
              : t('delegate.windingDown.inactiveHint')}
          </Text>
        </YStack>
      )}
    </YStack>
  )
}

// ─── Main Screen ───────────────────────────────────────────────
export default function AcceptDelegationScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const isWeb = Platform.OS === 'web'
  const [showJoinByCode, setShowJoinByCode] = useState(false)

  const {
    delegatingFor,
    loading,
    acceptRequest,
    rejectRequest,
    revokeDelegation,
    acceptPairingCode,
  } = useDelegations()

  const pendingRequests = delegatingFor.filter((d) => d.status === 'pending')
  const activeDelegatingFor = delegatingFor.filter((d) => d.status === 'active')
  const windingDownDelegatingFor = delegatingFor.filter(
    (d) => (d.status === 'revoked' || d.status === 'inactive') && d.hasActivePosts,
  )

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      {/* Header - Blue gradient */}
      <YStack
        backgroundColor={colors.blue[600]}
        paddingHorizontal="$6"
        paddingTop={Platform.OS === 'ios' ? '$10' : '$6'}
        paddingBottom="$5"
      >
        <XStack gap="$3" alignItems="center">
          {/* Back button */}
          {!isWeb && (
            <Button
              unstyled
              width={40}
              height={40}
              borderRadius={20}
              backgroundColor="rgba(255,255,255,0.2)"
              alignItems="center"
              justifyContent="center"
              onPress={() => router.back()}
              hoverStyle={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
              aria-label="Back"
            >
              <ArrowLeft size={20} color="white" />
            </Button>
          )}
          <YStack
            width={48}
            height={48}
            borderRadius={24}
            backgroundColor="rgba(255,255,255,0.2)"
            alignItems="center"
            justifyContent="center"
          >
            <Users size={24} color="white" />
          </YStack>
          <YStack flex={1}>
            <Text fontSize="$7" fontWeight="700" color="white">
              {t('delegate.acceptDelegationTitle', 'Accept Delegation')}
            </Text>
            <Text fontSize="$3" color={colors.blue[100]}>
              {t('delegate.acceptDelegationSubtitle', 'Manage who you sell for')}
            </Text>
          </YStack>
        </XStack>
      </YStack>

      {/* Info Banner */}
      <YStack
        backgroundColor="#eff6ff"
        borderBottomWidth={1}
        borderBottomColor="#bfdbfe"
        paddingHorizontal="$5"
        paddingVertical="$3"
      >
        <XStack gap="$2" alignItems="center">
          <ShieldCheck size={16} color="#2563eb" />
          <Text fontSize={13} color="#1e40af" flex={1}>
            Points earned from each sale are automatically split — your share goes directly to your account based on the agreed percentage.
          </Text>
        </XStack>
      </YStack>

      {/* Content */}
      {loading ? (
        <YStack flex={1} justifyContent="center" alignItems="center" padding="$6">
          <Spinner size="large" color={colors.blue[600]} />
        </YStack>
      ) : (
        <ScrollView flex={1}>
          <YStack padding="$5" gap="$4">
            {/* Join by Code Button */}
            <Button
              backgroundColor={colors.amber[500]}
              borderRadius={borderRadius.lg}
              paddingVertical="$3"
              gap="$2"
              hoverStyle={{ backgroundColor: colors.amber[600] }}
              onPress={() => setShowJoinByCode(true)}
            >
              <Keyboard size={18} color="white" />
              <Text fontWeight="600" color="white" fontSize={15}>
                {t('delegate.joinByCode.button')}
              </Text>
            </Button>

            {/* Your Role Info */}
            <YStack
              backgroundColor={colors.blue[50]}
              borderWidth={1}
              borderColor={colors.blue[200]}
              borderRadius={borderRadius.lg}
              padding="$4"
              gap="$2"
            >
              <Text fontWeight="600" color={colors.blue[900]} fontSize={14}>
                {t('delegate.delegatingFor.roleTitle')}
              </Text>
              <YStack gap="$1">
                <Text fontSize={12} color={colors.blue[800]}>• {t('delegate.delegatingFor.role1')}</Text>
                <Text fontSize={12} color={colors.blue[800]}>• {t('delegate.delegatingFor.role2')}</Text>
                <Text fontSize={12} color={colors.blue[800]}>• {t('delegate.delegatingFor.role3')}</Text>
              </YStack>
            </YStack>

            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <YStack gap="$2">
                <Text fontWeight="700" color={colors.gray[900]} fontSize={15}>
                  {t('delegate.delegatingFor.pendingTitle')}
                </Text>
                {pendingRequests.map((d) => (
                  <DelegatingForCard
                    key={d.id}
                    delegation={d}
                    onAccept={acceptRequest}
                    onReject={rejectRequest}
                    onRevoke={revokeDelegation}
                    t={t}
                  />
                ))}
              </YStack>
            )}

            {/* Active */}
            {activeDelegatingFor.length > 0 && (
              <YStack gap="$2">
                <Text fontWeight="700" color={colors.gray[900]} fontSize={15}>
                  {t('delegate.delegatingFor.activeTitle')}
                </Text>
                {activeDelegatingFor.map((d) => (
                  <DelegatingForCard
                    key={d.id}
                    delegation={d}
                    onAccept={acceptRequest}
                    onReject={rejectRequest}
                    onRevoke={revokeDelegation}
                    t={t}
                  />
                ))}
              </YStack>
            )}

            {/* Winding Down — delegatee view */}
            {windingDownDelegatingFor.length > 0 && (
              <YStack gap="$2">
                <Text fontWeight="700" color={colors.gray[900]} fontSize={15}>
                  {t('delegate.windingDown.sectionTitle')}
                </Text>
                <Text fontSize={12} color={colors.gray[500]}>
                  {t('delegate.windingDown.delegateeDescription')}
                </Text>
                {windingDownDelegatingFor.map((d) => (
                  <DelegatingForCard
                    key={d.id}
                    delegation={d}
                    onAccept={acceptRequest}
                    onReject={rejectRequest}
                    onRevoke={revokeDelegation}
                    t={t}
                  />
                ))}
              </YStack>
            )}

            {/* Empty State */}
            {delegatingFor.length === 0 && (
              <YStack
                backgroundColor="white"
                borderWidth={1}
                borderColor={colors.gray[200]}
                borderRadius={borderRadius.lg}
                padding="$8"
                alignItems="center"
                gap="$3"
              >
                <YStack
                  width={64}
                  height={64}
                  borderRadius={32}
                  backgroundColor={colors.gray[100]}
                  alignItems="center"
                  justifyContent="center"
                >
                  <ShieldCheck size={28} color={colors.gray[400]} />
                </YStack>
                <Text fontWeight="600" color={colors.gray[600]} fontSize={15}>
                  {t('delegate.empty.delegatingForTitle')}
                </Text>
                <Text fontSize={13} color={colors.gray[500]} textAlign="center">
                  {t('delegate.empty.delegatingForDescription')}
                </Text>
              </YStack>
            )}
          </YStack>
        </ScrollView>
      )}

      {/* Sheets */}
      <JoinByCodeSheet
        visible={showJoinByCode}
        onClose={() => setShowJoinByCode(false)}
        onAcceptCode={acceptPairingCode}
      />
    </YStack>
  )
}
