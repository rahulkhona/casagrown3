import { XStack, YStack, styled, Image } from 'tamagui'
import { Card } from './Card'
import { Paragraph, Heading } from './Typography'
import { Pill, PillText } from './Pill'
import { Button } from './Button'
import { MapPin, Clock, MessageSquare } from '@tamagui/lucide-icons'

export const OrderCard = ({ 
  title, 
  points, 
  status, 
  type, 
  seller, 
  buyer, 
  address, 
  time, 
  imageUri 
}: {
  title: string
  points: number
  status: string
  type: 'Buying' | 'Selling'
  seller?: string
  buyer?: string
  address?: string
  time?: string
  imageUri?: string
}) => {
  return (
    <Card elevated>
      <XStack justifyContent="space-between" alignItems="center" marginBottom="$2">
        <XStack gap="$2">
          <Pill active={type === 'Buying'}>
            <PillText active={type === 'Buying'}>{type}</PillText>
          </Pill>
          <Pill>
            <PillText>{status}</PillText>
          </Pill>
        </XStack>
        <Heading size="h3" color="$success">{points} points</Heading>
      </XStack>
      
      <Heading size="h3" marginBottom="$1">{title}</Heading>
      
      <YStack gap="$1" marginBottom="$4">
        {seller && (
          <XStack gap="$2" alignItems="center">
            <Paragraph small bold>Seller:</Paragraph>
            <Paragraph small>{seller}</Paragraph>
          </XStack>
        )}
        {buyer && (
          <XStack gap="$2" alignItems="center">
            <Paragraph small bold>Buyer:</Paragraph>
            <Paragraph small>{buyer}</Paragraph>
          </XStack>
        )}
        {address && (
          <XStack gap="$2" alignItems="center">
            <MapPin size={14} color="$textMuted" />
            <Paragraph small>{address}</Paragraph>
          </XStack>
        )}
        {time && (
          <XStack gap="$2" alignItems="center">
            <Clock size={14} color="$textMuted" />
            <Paragraph small>{time}</Paragraph>
          </XStack>
        )}
      </YStack>

      {imageUri && (
        <Image 
          source={{ uri: imageUri }} 
          width="100%" 
          height={200} 
          borderRadius="$lg" 
          marginBottom="$4" 
          resizeMode="cover"
        />
      )}

      <XStack gap="$2">
        <Button flex={1} ghost icon={<MessageSquare size={16} />}>Chat</Button>
        <Button flex={2}>Confirm Receipt</Button>
      </XStack>
    </Card>
  )
}
