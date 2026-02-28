import React from 'react'
import { Platform, Image } from 'react-native'
import { YStack, XStack, Text, Button, Input, ScrollView, Spinner, useMedia } from 'tamagui'
import { Search } from '@tamagui/lucide-icons'
import { colors, borderRadius, shadows } from '../../design-tokens'
import { type GiftCardProduct, POINTS_PER_DOLLAR } from './mock-data'

export function GiftCardsTab({
  search, setSearch, category, setCategory, cards, onSelect, isDesktop, categories, userPoints, loading,
}: {
  search: string; setSearch: (v: string) => void
  category: string; setCategory: (v: string) => void
  cards: GiftCardProduct[]; onSelect: (c: GiftCardProduct) => void
  isDesktop: boolean
  categories: string[]
  userPoints: number
  loading: boolean
}) {
  return (
    <YStack gap="$3">
      {/* Search */}
      <XStack
        backgroundColor="white" borderRadius={borderRadius.lg} borderWidth={1}
        borderColor={colors.gray[200]} paddingHorizontal="$3" alignItems="center" height={44}
      >
        <Search size={16} color={colors.gray[400]} />
        <Input flex={1} unstyled placeholder="Search gift cards..." placeholderTextColor={colors.gray[400] as any}
          value={search} onChangeText={setSearch} fontSize={14} marginLeft="$2" color={colors.gray[800]}
        />
      </XStack>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap="$2">
          {categories.map((cat) => (
            <Button key={cat} unstyled paddingHorizontal="$3" paddingVertical="$1.5" borderRadius={20}
              borderWidth={1} borderColor={category === cat ? colors.green[600] : colors.gray[200]}
              backgroundColor={category === cat ? colors.green[50] : 'white'}
              onPress={() => setCategory(cat)}
            >
              <Text fontSize="$2" fontWeight="500" color={category === cat ? colors.green[700] : colors.gray[600]}>
                {cat}
              </Text>
            </Button>
          ))}
        </XStack>
      </ScrollView>

      {/* Grid */}
      {loading ? (
        <YStack padding="$6" alignItems="center" gap="$3">
          <Spinner size="large" color={colors.green[600]} />
          <Text color={colors.gray[400]}>Loading gift cards...</Text>
        </YStack>
      ) : cards.length === 0 ? (
        <YStack padding="$6" alignItems="center">
          <Text color={colors.gray[400]}>No gift cards found</Text>
        </YStack>
      ) : Platform.OS === 'web' ? (
        <XStack flexWrap="wrap" gap="$4" justifyContent="flex-start" paddingHorizontal="$2">
          {cards.map((card, index) => (
            <YStack key={card.id} width={200}>
              <GiftCard card={card} onSelect={onSelect} canAfford={userPoints >= card.minDenomination * POINTS_PER_DOLLAR} index={index} />
            </YStack>
          ))}
        </XStack>
      ) : (
        <XStack flexWrap="wrap" gap="$3" justifyContent="space-between">
          {cards.map((card, index) => (
            <YStack key={card.id} width="48%">
              <GiftCard card={card} onSelect={onSelect} canAfford={userPoints >= card.minDenomination * POINTS_PER_DOLLAR} index={index} />
            </YStack>
          ))}
        </XStack>
      )}
    </YStack>
  )
}

export function GiftCard({ card, onSelect, canAfford, index }: { card: GiftCardProduct; onSelect: (c: GiftCardProduct) => void; canAfford: boolean; index?: number }) {
  // Derive a lighter shade for gradient
  const hex = card.brandColor || '#4B5563'
  const lighterHex = hex + '99'

  // Affordability check
  const minPointsNeeded = card.minDenomination * POINTS_PER_DOLLAR
  const pointsShort = minPointsNeeded - (canAfford ? minPointsNeeded : 0) // Only show if not affordable

  const inner = (
    <YStack
      borderRadius={borderRadius.lg}
      overflow="hidden"
      height={180}
      position="relative"
      pointerEvents="none"
    >
      {/* ── Background: card image or brand gradient ── */}
      {Platform.OS === 'web' ? (
        <div style={{
          position: 'absolute', inset: 0,
          background: card.cardImageUrl
            ? `url(${card.cardImageUrl}) center/contain no-repeat, linear-gradient(135deg, ${hex} 0%, ${lighterHex} 60%, ${hex}DD 100%)`
            : `linear-gradient(135deg, ${hex} 0%, ${lighterHex} 60%, ${hex}DD 100%)`,
        }} />
      ) : card.cardImageUrl ? (
        <Image 
          source={{ uri: card.cardImageUrl }}
          style={{ width: '100%', height: '100%', position: 'absolute', backgroundColor: hex }}
          resizeMode="contain"
        />
      ) : (
        <YStack position="absolute" top={0} left={0} right={0} bottom={0}
          backgroundColor={hex as any} />
      )}

      {/* ── Subtle overlay for text readability ── */}
      {(Platform.OS === 'web' || card.cardImageUrl) && (
        <YStack position="absolute" top={0} left={0} right={0} bottom={0} backgroundColor="rgba(0,0,0,0.3)" />
      )}

      {/* ── Foreground Content ── */}
      <YStack padding="$3" flex={1} justifyContent="space-between" zIndex={1}>
        <XStack justifyContent="space-between" alignItems="flex-start">
          {card.isGlobal && (
            <Badge bg="rgba(255,255,255,0.2)" text="Global" color="white" />
          )}
          {card.category && !card.isGlobal && (
             <Badge bg="rgba(255,255,255,0.2)" text={card.category.substring(0, 12) + (card.category.length > 12 ? '...' : '')} color="white" />
          )}

          {card.discountPercentage > 0 && (
            <YStack backgroundColor={colors.green[500]} paddingHorizontal="$2" paddingVertical={2} borderRadius={8} marginLeft="auto">
              <Text fontSize={10} fontWeight="700" color="white">{card.discountPercentage}% OFF</Text>
            </YStack>
          )}
        </XStack>

        <YStack gap="$1">
          <Text fontSize="$4" fontWeight="800" color="white" numberOfLines={1}>
            {card.brandName}
          </Text>
          <Text fontSize={11} color="rgba(255,255,255,0.9)">
            {card.denominationType === 'range' 
               ? `$${card.minDenomination}–$${card.maxDenomination}` 
               : `From $${card.minDenomination}`}
          </Text>
        </YStack>
      </YStack>

      {/* ── Unavailable / Short overlay ── */}
      {!canAfford && (
        <YStack
          position="absolute" inset={0}
          backgroundColor="rgba(255,255,255,0.85)"
          alignItems="center" justifyContent="center"
          padding="$3"
          zIndex={2}
        >
          <Text fontSize="$2" fontWeight="700" color={colors.gray[600]} textAlign="center">
            Need {pointsShort.toLocaleString()} more pts
          </Text>
        </YStack>
      )}
    </YStack>
  )

  if (Platform.OS === 'web') {
    return (
      <div
        onClick={() => { if (canAfford) onSelect(card) }}
        style={{
          cursor: canAfford ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          opacity: canAfford ? 1 : 0.6,
          boxShadow: shadows.sm,
          borderRadius: 16,
        }}
        onMouseEnter={(e) => {
          if (canAfford) e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'
        }}
        onMouseLeave={(e) => {
          if (canAfford) e.currentTarget.style.transform = 'translateY(0) scale(1)'
        }}
        aria-label={`Select ${card.brandName} gift card`}
        data-testid="giftcard-item"
      >
        {inner}
      </div>
    )
  }

  // Native pressable
  return (
    <Button
       unstyled
       onPress={() => { if (canAfford) onSelect(card) }}
       pressStyle={{ scale: canAfford ? 0.96 : 1, opacity: 0.8 }}
       animation="quick"
       opacity={canAfford ? 1 : 0.6}
       testID="giftcard-item"
       shadowColor="#000" shadowOffset={{ width: 0, height: 2 }} shadowOpacity={0.1} shadowRadius={4} elevation={2}
    >
      {inner}
    </Button>
  )
}

function Badge({ bg, text, color }: { bg: string; text: string; color: string }) {
  return (
    <YStack backgroundColor={bg as any} paddingHorizontal="$2" paddingVertical={2} borderRadius={8}>
      <Text fontSize={11} fontWeight="600" color={color as any}>{text}</Text>
    </YStack>
  )
}
