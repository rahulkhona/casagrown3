import { YStack, styled } from 'tamagui'
import { Paragraph } from './Typography'
import { Upload } from '@tamagui/lucide-icons'

export const Dropzone = styled(YStack, {
  name: 'Dropzone',
  padding: '$6',
  borderRadius: '$lg',
  borderWidth: 2,
  borderStyle: 'dashed',
  borderColor: '$borderColor',
  backgroundColor: '$bg',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '$2',
  pressStyle: {
    backgroundColor: '$bgSoft',
    borderColor: '$primary',
  },
  
  variants: {
    active: {
      true: {
        borderColor: '$primary',
        backgroundColor: '$bgSoft',
      },
    },
  } as const,
})

// Shorthand for usage
export const UploadDropzone = ({ label = 'Upload Photo/Video' }: { label?: string }) => (
  <Dropzone>
    <Upload size="$2" color="$textMuted" />
    <Paragraph small color="$textMuted">{label}</Paragraph>
  </Dropzone>
)
