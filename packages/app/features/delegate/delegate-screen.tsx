/**
 * DelegateScreen — Delegate management for My Delegates
 *
 * Matches Figma prototype design with Tamagui + design-tokens.
 * All strings localised via useTranslation().
 */

import { useState } from 'react'
import { Platform } from 'react-native'
import { YStack, XStack, Text, Button, ScrollView, Spinner } from 'tamagui'
import { useRouter } from 'solito/navigation'
import {
  Users,
  UserPlus,
  UserCheck,
  ShieldCheck,
  Clock,
  ArrowLeft,
} from '@tamagui/lucide-icons'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius, tc } from '../../design-tokens'
import { useDelegations, type DelegationRecord } from './useDelegations'
import AddDelegateSheet from './AddDelegateSheet'

// ─── Status Badge ──────────────────────────────────────────────
function StatusBadge({ status, hasActivePosts, t }: { status: string; hasActivePosts?: boolean; t: (k: string) => string }) {
  // Compute display status: revoked/inactive with active posts → winding_down
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

// ─── Delegate Card (My Delegates tab) ──────────────────────────
function DelegateCard({
  delegation,
  onRevoke,
  t,
}: {
  delegation: DelegationRecord
  onRevoke: (id: string) => void
  t: (k: string) => string
}) {
  const profile = delegation.delegatee_profile
  const name = profile?.full_name || t('delegate.unknownUser')

  return (
    <XStack
      backgroundColor="white"
      borderWidth={1}
      borderColor={colors.gray[200]}
      borderRadius={borderRadius.lg}
      padding="$4"
      gap="$3"
      alignItems="center"
    >
      {/* Avatar */}
      <YStack
        width={44}
        height={44}
        borderRadius={22}
        backgroundColor={colors.green[100]}
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        <UserCheck size={22} color={colors.green[700]} />
      </YStack>

      {/* Info */}
      <YStack flex={1}>
        <Text fontWeight="600" color={colors.gray[900]} fontSize={15}>
          {name}
        </Text>
        <XStack gap="$2" alignItems="center" marginTop="$1">
          <StatusBadge status={delegation.status} hasActivePosts={delegation.hasActivePosts} t={t} />
        </XStack>
        {(delegation.status === 'revoked' || delegation.status === 'inactive') && delegation.hasActivePosts && (
          <Text fontSize={11} color={colors.amber[700]} marginTop={2}>
            {t('delegate.windingDown.delegatorHint')}
          </Text>
        )}
      </YStack>

      {/* Action — only show revoke for active delegations, not winding-down ones */}
      {delegation.status === 'active' && (
        <Button
          size="$2"
          borderWidth={1}
          borderColor={colors.red[300]}
          backgroundColor="white"
          borderRadius={borderRadius.default}
          hoverStyle={{ backgroundColor: colors.red[50] }}
          onPress={() => onRevoke(delegation.id)}
        >
          <Text fontSize={12} fontWeight="500" color={colors.red[600]}>
            {t('delegate.actions.revoke')}
          </Text>
        </Button>
      )}
      {delegation.status === 'pending' && (
        <XStack gap="$1" alignItems="center">
          <Clock size={14} color={colors.amber[500]} />
          <Text fontSize={12} color={colors.amber[600]}>{t('delegate.status.awaitingAcceptance')}</Text>
        </XStack>
      )}
    </XStack>
  )
}

// ─── Main Screen ───────────────────────────────────────────────
export default function DelegateScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const isWeb = Platform.OS === 'web'
  const [showAddDelegate, setShowAddDelegate] = useState(false)

  const {
    myDelegates,
    loading,
    generateDelegationLink,
    revokeDelegation,
  } = useDelegations()

  const windingDownMyDelegates = myDelegates.filter(
    (d) => (d.status === 'revoked' || d.status === 'inactive') && d.hasActivePosts,
  )
  const activeMyDelegates = myDelegates.filter(
    (d) => d.status === 'active' || d.status === 'pending',
  )

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      {/* Header - Green gradient */}
      <YStack
        backgroundColor={colors.green[600]}
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
              {t('delegate.title')}
            </Text>
            <Text fontSize="$3" color={colors.green[100]}>
              {t('delegate.subtitle')}
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
            {t('delegate.infoBanner')}
          </Text>
        </XStack>
      </YStack>

      {/* Content */}
      {loading ? (
        <YStack flex={1} justifyContent="center" alignItems="center" padding="$6">
          <Spinner size="large" color={colors.green[600]} />
        </YStack>
      ) : (
        <ScrollView flex={1}>
          <YStack padding="$5" gap="$4">
            {/* Add Delegate Button */}
            <Button
              backgroundColor={colors.green[600]}
              borderRadius={borderRadius.lg}
              paddingVertical="$3"
              gap="$2"
              hoverStyle={{ backgroundColor: colors.green[700] }}
              onPress={() => setShowAddDelegate(true)}
            >
              <UserPlus size={18} color="white" />
              <Text fontWeight="600" color="white" fontSize={15}>
                {t('delegate.addDelegate.button')}
              </Text>
            </Button>

            {/* Active Delegate List */}
            {activeMyDelegates.length > 0 ? (
              <YStack gap="$3">
                {activeMyDelegates.map((d) => (
                  <DelegateCard
                    key={d.id}
                    delegation={d}
                    onRevoke={revokeDelegation}
                    t={t}
                  />
                ))}
              </YStack>
            ) : (
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
                  <Users size={28} color={colors.gray[400]} />
                </YStack>
                <Text fontWeight="600" color={colors.gray[600]} fontSize={15}>
                  {t('delegate.empty.myDelegatesTitle')}
                </Text>
                <Text fontSize={13} color={colors.gray[500]} textAlign="center">
                  {t('delegate.empty.myDelegatesDescription')}
                </Text>
              </YStack>
            )}

            {/* Winding Down delegates */}
            {windingDownMyDelegates.length > 0 && (
              <YStack gap="$2">
                <Text fontWeight="700" color={colors.gray[900]} fontSize={15}>
                  {t('delegate.windingDown.sectionTitle')}
                </Text>
                <Text fontSize={12} color={colors.gray[500]}>
                  {t('delegate.windingDown.sectionDescription')}
                </Text>
                {windingDownMyDelegates.map((d) => (
                  <DelegateCard
                    key={d.id}
                    delegation={d}
                    onRevoke={revokeDelegation}
                    t={t}
                  />
                ))}
              </YStack>
            )}
          </YStack>
        </ScrollView>
      )}

      {/* Sheets */}
      <AddDelegateSheet
        visible={showAddDelegate}
        onClose={() => setShowAddDelegate(false)}
        onGenerateLink={generateDelegationLink}
      />
    </YStack>
  )
}
