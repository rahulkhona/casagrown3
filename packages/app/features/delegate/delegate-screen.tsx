/**
 * DelegateScreen — Delegate management with My Delegates / Delegating For tabs
 *
 * Matches Figma prototype design with Tamagui + design-tokens.
 * All strings localised via useTranslation().
 */

import { useState } from 'react'
import { Platform } from 'react-native'
import { YStack, XStack, Text, Button, ScrollView, Spinner } from 'tamagui'
import { useRouter } from 'solito/router'
import {
  Users,
  UserPlus,
  UserCheck,
  ShieldCheck,
  Clock,
  XCircle,
  CheckCircle,
  ChevronRight,
  Keyboard,
  ArrowLeft,
} from '@tamagui/lucide-icons'
import { useTranslation } from 'react-i18next'
import { colors, borderRadius } from '../../design-tokens'
import { useDelegations, type DelegationRecord } from './useDelegations'
import AddDelegateSheet from './AddDelegateSheet'
import JoinByCodeSheet from './JoinByCodeSheet'

// ─── Status Badge ──────────────────────────────────────────────
function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: colors.green[100], text: colors.green[800], label: t('delegate.status.active') },
    pending: { bg: colors.amber[100], text: colors.amber[800], label: t('delegate.status.pending') },
    pending_pairing: { bg: '#dbeafe', text: '#1e40af', label: t('delegate.status.pendingPairing') },
  }
  const c = config[status] || config.active

  return (
    <YStack
      backgroundColor={c.bg as any}
      paddingHorizontal="$2"
      paddingVertical="$1"
      borderRadius={borderRadius.default}
    >
      <Text fontSize={11} fontWeight="600" color={c.text as any}>
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
          <StatusBadge status={delegation.status} t={t} />
        </XStack>
      </YStack>

      {/* Action */}
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

// ─── Delegating-For Card ───────────────────────────────────────
function DelegatingForCard({
  delegation,
  onAccept,
  onReject,
  onInactivate,
  t,
}: {
  delegation: DelegationRecord
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onInactivate: (id: string) => void
  t: (k: string) => string
}) {
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
        <StatusBadge status={delegation.status} t={t} />
      </XStack>

      {/* Pending: Accept / Decline */}
      {delegation.status === 'pending' && (
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
      )}

      {/* Active: Inactivate */}
      {delegation.status === 'active' && (
        <Button
          borderWidth={1}
          borderColor={colors.gray[300]}
          backgroundColor="white"
          borderRadius={borderRadius.lg}
          paddingVertical="$2"
          onPress={() => onInactivate(delegation.id)}
          hoverStyle={{ backgroundColor: colors.gray[50] }}
        >
          <Text fontWeight="500" color={colors.gray[700]} fontSize={13}>
            {t('delegate.actions.inactivate')}
          </Text>
        </Button>
      )}
    </YStack>
  )
}

// ─── Main Screen ───────────────────────────────────────────────
export default function DelegateScreen({ initialTab }: { initialTab?: 'my' | 'for' }) {
  const { t } = useTranslation()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'my' | 'for'>(initialTab || 'my')
  const [showAddDelegate, setShowAddDelegate] = useState(false)
  const [showJoinByCode, setShowJoinByCode] = useState(false)

  const {
    myDelegates,
    delegatingFor,
    loading,
    generateDelegationLink,
    acceptRequest,
    rejectRequest,
    revokeDelegation,
    inactivateDelegation,
    acceptPairingCode,
  } = useDelegations()

  const pendingRequests = delegatingFor.filter((d) => d.status === 'pending')
  const activeDelegatingFor = delegatingFor.filter((d) => d.status === 'active')

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
          >
            <ArrowLeft size={20} color="white" />
          </Button>
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

      {/* Tab Bar */}
      <XStack
        backgroundColor="white"
        borderBottomWidth={1}
        borderBottomColor={colors.gray[200]}
      >
        <Button
          unstyled
          flex={1}
          paddingVertical="$3"
          borderBottomWidth={3}
          borderBottomColor={activeTab === 'my' ? colors.green[600] : 'transparent'}
          onPress={() => setActiveTab('my')}
        >
          <Text
            textAlign="center"
            fontWeight="600"
            fontSize={14}
            color={activeTab === 'my' ? colors.green[600] : colors.gray[500]}
          >
            {t('delegate.tabs.myDelegates')}
            {myDelegates.length > 0 && ` (${myDelegates.length})`}
          </Text>
        </Button>
        <Button
          unstyled
          flex={1}
          paddingVertical="$3"
          borderBottomWidth={3}
          borderBottomColor={activeTab === 'for' ? colors.green[600] : 'transparent'}
          onPress={() => setActiveTab('for')}
        >
          <XStack justifyContent="center" alignItems="center" gap="$2">
            <Text
              textAlign="center"
              fontWeight="600"
              fontSize={14}
              color={activeTab === 'for' ? colors.green[600] : colors.gray[500]}
            >
              {t('delegate.tabs.delegatingFor')}
            </Text>
            {pendingRequests.length > 0 && (
              <YStack
                backgroundColor={colors.red[500]}
                borderRadius={10}
                width={20}
                height={20}
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize={11} fontWeight="700" color="white">
                  {pendingRequests.length}
                </Text>
              </YStack>
            )}
          </XStack>
        </Button>
      </XStack>

      {/* Content */}
      {loading ? (
        <YStack flex={1} justifyContent="center" alignItems="center" padding="$6">
          <Spinner size="large" color={colors.green[600]} />
        </YStack>
      ) : (
        <ScrollView flex={1}>
          <YStack padding="$5" gap="$4">
            {activeTab === 'my' ? (
              <>
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

                {/* Delegate List — hide pending_pairing (invisible until accepted) */}
                {myDelegates.filter((d) => d.status !== 'pending_pairing').length > 0 ? (
                  <YStack gap="$3">
                    {myDelegates.filter((d) => d.status !== 'pending_pairing').map((d) => (
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
              </>
            ) : (
              <>
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
                  backgroundColor={colors.green[50]}
                  borderWidth={1}
                  borderColor={colors.green[200]}
                  borderRadius={borderRadius.lg}
                  padding="$4"
                  gap="$2"
                >
                  <Text fontWeight="600" color={colors.green[900]} fontSize={14}>
                    {t('delegate.delegatingFor.roleTitle')}
                  </Text>
                  <YStack gap="$1">
                    <Text fontSize={12} color={colors.green[800]}>• {t('delegate.delegatingFor.role1')}</Text>
                    <Text fontSize={12} color={colors.green[800]}>• {t('delegate.delegatingFor.role2')}</Text>
                    <Text fontSize={12} color={colors.green[800]}>• {t('delegate.delegatingFor.role3')}</Text>
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
                        onInactivate={inactivateDelegation}
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
                        onInactivate={inactivateDelegation}
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
              </>
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
      <JoinByCodeSheet
        visible={showJoinByCode}
        onClose={() => setShowJoinByCode(false)}
        onAcceptCode={acceptPairingCode}
      />
    </YStack>
  )
}
