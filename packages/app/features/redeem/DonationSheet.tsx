/**
 * DonationSheet — Bottom sheet for donating points to a charity project
 *
 * Uses web-native HTML elements on web to avoid React Native Modal/Pressable
 * click issues, and native components on iOS/Android.
 */

import React, { useState, useMemo } from 'react'
import { Platform, Image, Modal, Pressable } from 'react-native'
import { YStack, XStack, Text, Button, Input, ScrollView } from 'tamagui'
import { X } from '@tamagui/lucide-icons'
import { colors, borderRadius } from '../../design-tokens'
import { type CharityProject, POINTS_PER_DOLLAR } from './mock-data'

interface DonationSheetProps {
  visible: boolean
  project: CharityProject
  balance: number
  onClose: () => void
  onConfirm: (project: CharityProject, pointsAmount: number) => void
  t: any
}

const THEME_COLORS: Record<string, { bg: string; text: string }> = {
  Hunger: { bg: colors.amber[100], text: colors.amber[700] },
  Environment: { bg: colors.green[100], text: colors.green[700] },
  Education: { bg: colors.blue[100], text: colors.blue[700] },
  Health: { bg: colors.pink[100], text: colors.pink[700] },
}

const QUICK_AMOUNTS = [100, 250, 500, 1000]

export function DonationSheet({ visible, project, balance, onClose, onConfirm, t }: DonationSheetProps) {
  const [pointsInput, setPointsInput] = useState('500')
  const [selectedQuick, setSelectedQuick] = useState<number | null>(500)

  const pointsAmount = useMemo(() => {
    const parsed = parseInt(pointsInput, 10)
    return isNaN(parsed) || parsed <= 0 ? 0 : parsed
  }, [pointsInput])

  const dollarAmount = pointsAmount / POINTS_PER_DOLLAR
  const canAfford = pointsAmount > 0 && pointsAmount <= balance
  const progress = Math.min(project.raised / project.goal, 1)
  const themeColor = THEME_COLORS[project.theme] || { bg: colors.gray[100], text: colors.gray[600] }

  if (!visible) return null

  const sheetContent = (
    <YStack>
      {/* Project image */}
      <YStack height={160} overflow="hidden" borderTopLeftRadius={24} borderTopRightRadius={24}>
        <Image source={{ uri: project.imageUrl }} style={{ width: '100%', height: 160 }} resizeMode="cover" />
        {/* Close button */}
        {Platform.OS === 'web' ? (
          <button
            onClick={(e) => { e.stopPropagation(); onClose() }}
            style={{
              position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16,
              backgroundColor: 'rgba(0,0,0,0.5)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
          >
            <X size={18} color="white" />
          </button>
        ) : (
          <Pressable onPress={onClose}
            style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16,
              backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} color="white" />
          </Pressable>
        )}
      </YStack>

      <YStack padding="$4" gap="$4">
        {/* Project info */}
        <YStack gap="$1">
          <Text fontSize="$5" fontWeight="700" color={colors.gray[800]}>{project.title}</Text>
          <Text fontSize="$3" color={colors.gray[500]}>{project.organization}</Text>
          <XStack>
            <YStack backgroundColor={themeColor.bg as any} paddingHorizontal="$2" paddingVertical={2} borderRadius={10}>
              <Text fontSize={11} fontWeight="600" color={themeColor.text as any}>{project.theme}</Text>
            </YStack>
          </XStack>
        </YStack>

        {/* Progress */}
        <YStack gap="$1">
          <YStack height={6} backgroundColor={colors.gray[200]} borderRadius={3} overflow="hidden">
            <YStack height={6} width={`${progress * 100}%` as any} backgroundColor={colors.green[500]} borderRadius={3} />
          </YStack>
          <XStack justifyContent="space-between">
            <Text fontSize={12} color={colors.gray[500]}>
              ${project.raised.toLocaleString()} of ${project.goal.toLocaleString()} raised
            </Text>
            <Text fontSize={12} color={colors.gray[500]}>{Math.round(progress * 100)}%</Text>
          </XStack>
        </YStack>

        {/* Donation Amount */}
        <YStack gap="$2">
          <Text fontSize="$4" fontWeight="600" color={colors.gray[800]}>Donation Amount</Text>
          <XStack borderWidth={1} borderColor={colors.gray[200]} borderRadius={borderRadius.lg}
            paddingHorizontal="$3" alignItems="center" height={52} backgroundColor="white"
          >
            <Input flex={1} unstyled value={pointsInput}
              onChangeText={(v) => { setPointsInput(v); setSelectedQuick(null) }}
              keyboardType="number-pad" fontSize={16} fontWeight="400" color={colors.gray[800]} textAlign="center"
            />
            <Text fontSize="$3" color={colors.gray[400]} marginLeft="$1">pts</Text>
          </XStack>
          <Text fontSize="$2" color={colors.gray[500]} textAlign="center">= ${dollarAmount.toFixed(2)} USD</Text>

          {/* Quick-select */}
          <XStack gap="$2" justifyContent="center">
            {QUICK_AMOUNTS.map((a) => (
              Platform.OS === 'web' ? (
                <button key={a}
                  onClick={() => { setPointsInput(String(a)); setSelectedQuick(a) }}
                  style={{
                    padding: '6px 14px', borderRadius: 20,
                    border: `1px solid ${selectedQuick === a ? colors.green[600] : colors.gray[200]}`,
                    backgroundColor: selectedQuick === a ? colors.green[50] : 'white',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    color: selectedQuick === a ? colors.green[700] : colors.gray[600],
                  }}
                >{a} pts</button>
              ) : (
                <Button key={a} unstyled paddingHorizontal="$3" paddingVertical="$2" borderRadius={20}
                  borderWidth={1} borderColor={selectedQuick === a ? colors.green[600] : colors.gray[200]}
                  backgroundColor={selectedQuick === a ? colors.green[50] : 'white'}
                  onPress={() => { setPointsInput(String(a)); setSelectedQuick(a) }}
                >
                  <Text fontSize="$2" fontWeight="600"
                    color={selectedQuick === a ? colors.green[700] : colors.gray[600]}
                  >{a} pts</Text>
                </Button>
              )
            ))}
          </XStack>
        </YStack>

        {/* Info banner */}
        <YStack backgroundColor={colors.sky[100]} borderRadius={borderRadius.lg} padding="$3">
          <XStack gap="$2" alignItems="flex-start">
            <Text fontSize={16}>ℹ️</Text>
            <Text fontSize="$2" color={colors.sky[700] as any} flex={1} lineHeight={18}>
              Points are deducted immediately. Donations are sent daily on your behalf.
              A receipt will be emailed to you.
            </Text>
          </XStack>
        </YStack>

        {/* Balance */}
        <Text fontSize="$3" color={colors.gray[500]} textAlign="center">
          Your balance: {balance.toLocaleString()} pts
          {pointsAmount > 0 && canAfford && ` → ${(balance - pointsAmount).toLocaleString()} pts after donation`}
        </Text>

        {/* Confirm */}
        {Platform.OS === 'web' ? (
          <button
            onClick={() => { if (canAfford) onConfirm(project, pointsAmount) }}
            disabled={!canAfford}
            style={{
              padding: '14px 0', borderRadius: 24, border: 'none',
              cursor: canAfford ? 'pointer' : 'default',
              backgroundColor: canAfford ? colors.green[600] : colors.gray[300],
              color: 'white', fontSize: 16, fontWeight: 600, width: '100%',
              textAlign: 'center',
            }}
          >
            {!canAfford && pointsAmount > balance
              ? 'Insufficient points'
              : pointsAmount <= 0
                ? 'Enter amount'
                : `Donate ${pointsAmount.toLocaleString()} Points`}
          </button>
        ) : (
          <Button unstyled paddingVertical="$3.5" borderRadius={24}
            backgroundColor={canAfford ? colors.green[600] : colors.gray[300]}
            alignItems="center" justifyContent="center"
            onPress={() => { if (canAfford) onConfirm(project, pointsAmount) }}
            disabled={!canAfford}
          >
            <Text fontSize="$4" fontWeight="600" color="white">
              {!canAfford && pointsAmount > balance
                ? 'Insufficient points'
                : pointsAmount <= 0
                  ? 'Enter amount'
                  : `Donate ${pointsAmount.toLocaleString()} Points`}
            </Text>
          </Button>
        )}
      </YStack>
    </YStack>
  )

  // ── Web: use native HTML overlay for reliable click handling ──
  if (Platform.OS === 'web') {
    return (
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 9999,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            maxHeight: '90%', width: '100%', maxWidth: 500, overflow: 'auto',
          }}
        >
          {sheetContent}
        </div>
      </div>
    )
  }

  // ── Native: use Modal ──
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' }}
        >
          <ScrollView>
            {sheetContent}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
