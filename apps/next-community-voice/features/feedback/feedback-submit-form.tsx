'use client'

import { useState, useRef, useEffect } from 'react'
import { YStack, XStack, Text, Button, Input, TextArea, Card, Spinner, Image, useMedia } from 'tamagui'
import { useRouter, useSearchParams } from 'next/navigation'
import { colors } from '@casagrown/app/design-tokens'
import { ArrowLeft, Bug, Lightbulb, Upload, X, Video, Image as ImageIcon, Headphones, FileText, Lock } from '@tamagui/lucide-icons'
import { Suspense } from 'react'
import { createTicket, FeedbackType } from './feedback-service'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'

function FeedbackSubmitFormContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialType = searchParams.get('type') === 'feature' ? 'feature' : searchParams.get('type') === 'support' ? 'support' : 'bug'
  const typeFromUrl = searchParams.get('type') // If set, hide the type selector
  const [type, setType] = useState<'bug' | 'feature' | 'support'>(initialType)
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<any[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const media = useMedia()
  const isDesktop = !media.sm
  const { user } = useAuth()
  const [dragging, setDragging] = useState(false)

  const typeToEnum: Record<string, FeedbackType> = {
    bug: 'bug_report',
    feature: 'feature_request',
    support: 'support_request',
  }

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return
    if (!user) {
      router.push('/login?returnTo=/submit')
      return
    }
    setLoading(true)
    const result = await createTicket({
      title: title.trim(),
      description: description.trim(),
      type: typeToEnum[type] || 'bug_report',
      authorId: user?.id || '',
      files: files.map(f => f.file),
    })
    setLoading(false)
    if (result) {
      router.push('/board')
    } else {
      router.push('/board')
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (!selectedFiles) return
    const newFiles = Array.from(selectedFiles).map(f => ({
      type: f.type.startsWith('video/') ? 'video' as const : f.type.startsWith('image/') ? 'image' as const : 'document' as const,
      name: f.name,
      file: f,
    }))
    setFiles([...files, ...newFiles])
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <YStack flex={1} backgroundColor={colors.green[50]} padding={isDesktop ? '$4' : '$3'} alignItems="center">
      <YStack maxWidth={600} width="100%" gap={isDesktop ? '$4' : '$3'}>
        <Button 
          icon={ArrowLeft} 
          chromeless 
          onPress={() => router.back()} 
          alignSelf="flex-start" 
          paddingLeft="$0"
        >
          <Text color={colors.gray[600]}>Cancel</Text>
        </Button>

        <Text fontSize={isDesktop ? '$8' : '$6'} fontWeight="700" color={colors.green[800]}>
          {typeFromUrl === 'bug' ? 'Report a Bug' : typeFromUrl === 'feature' ? 'Request a Feature' : typeFromUrl === 'support' ? 'Support Request' : 'Submit Feedback'}
        </Text>
        <Text fontSize={15} fontWeight="400" color={colors.gray[600]} lineHeight={24}>
          {typeFromUrl === 'bug' ? 'Tell us what went wrong so we can fix it.' : typeFromUrl === 'feature' ? 'Suggest an improvement or new feature.' : typeFromUrl === 'support' ? 'Get help from the CasaGrown team.' : 'Found a bug? Have a great idea? Need help? Let us know!'}
        </Text>

        <Card padding="$5" borderWidth={1} borderColor={colors.gray[200]} backgroundColor="white" borderRadius="$4" gap="$4">
            {/* Type Selector — hidden when type preset via URL */}
            {!typeFromUrl && (
            <YStack gap="$2">
                <Text fontWeight="500" color={colors.gray[700]}>Feedback Type</Text>
                <XStack gap="$2" flexWrap="wrap">
                    <Button 
                        flex={1} 
                        size="$4"
                        backgroundColor={type === 'bug' ? colors.red[100] : colors.gray[50]}
                        borderColor={type === 'bug' ? colors.red[500] : 'transparent'}
                        borderWidth={2}
                        onPress={() => setType('bug')}
                        icon={<Bug color={type === 'bug' ? colors.red[600] : colors.gray[500]} />}
                    >
                        <Text color={type === 'bug' ? colors.red[800] : colors.gray[600]}>Bug Report</Text>
                    </Button>
                    <Button 
                        flex={1} 
                        size="$4"
                        backgroundColor={type === 'feature' ? colors.amber[100] : colors.gray[50]}
                        borderColor={type === 'feature' ? colors.amber[500] : 'transparent'}
                        borderWidth={2}
                        onPress={() => setType('feature')}
                        icon={<Lightbulb color={type === 'feature' ? colors.amber[600] : colors.gray[500]} />}
                    >
                        <Text color={type === 'feature' ? colors.amber[700] : colors.gray[600]}>Feature Request</Text>
                    </Button>
                    <Button 
                        flex={1} 
                        size="$4"
                        backgroundColor={type === 'support' ? colors.blue[100] : colors.gray[50]}
                        borderColor={type === 'support' ? colors.blue[600] : 'transparent'}
                        borderWidth={2}
                        onPress={() => setType('support')}
                        icon={<Headphones color={type === 'support' ? colors.blue[600] : colors.gray[500]} />}
                    >
                        <Text color={type === 'support' ? colors.blue[700] : colors.gray[600]}>Support Request</Text>
                    </Button>
                </XStack>
                {type === 'support' && (
                  <XStack backgroundColor={colors.blue[100]} padding="$3" borderRadius="$3" gap="$2" alignItems="center">
                    <Lock size={14} color={colors.blue[600]} />
                    <Text fontSize="$2" color={colors.blue[700]} fontWeight="500" flex={1}>This ticket is private — only you and CasaGrown staff can see it.</Text>
                  </XStack>
                )}
            </YStack>
            )}

            {/* Support notice when type is preset via URL */}
            {typeFromUrl === 'support' && (
              <XStack backgroundColor={colors.blue[100]} padding="$3" borderRadius="$3" gap="$2" alignItems="center">
                <Lock size={14} color={colors.blue[600]} />
                <Text fontSize="$2" color={colors.blue[700]} fontWeight="500" flex={1}>This ticket is private — only you and CasaGrown staff can see it.</Text>
              </XStack>
            )}

            {/* Title */}
            <YStack gap="$2">
                <Text fontWeight="500" color={colors.gray[700]}>Title</Text>
                <Input placeholder="Short summary..." size="$4" borderRadius="$4" borderWidth={1} borderColor={colors.gray[300]} fontWeight="400" value={title} onChangeText={setTitle} />
            </YStack>

            {/* Description with drag-and-drop */}
            <YStack gap="$2">
                <Text fontWeight="500" color={colors.gray[700]}>Description</Text>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragging(false)
                    const droppedFiles = e.dataTransfer.files
                    if (!droppedFiles?.length) return
                    const newFiles = Array.from(droppedFiles).map(f => ({
                      type: f.type.startsWith('video/') ? 'video' as const : f.type.startsWith('image/') ? 'image' as const : 'document' as const,
                      name: f.name,
                      file: f,
                    }))
                    setFiles(prev => [...prev, ...newFiles])
                  }}
                  style={{ position: 'relative', width: '100%', display: 'flex' }}
                >
                  <TextArea placeholder="Describe the issue or idea in detail..." minHeight={150} size="$4" borderRadius="$4" borderWidth={dragging ? 2 : 1} borderColor={dragging ? '#3b82f6' : colors.gray[300]} fontWeight="400" style={{ fontWeight: 400, width: '100%' }} value={description} onChangeText={setDescription} {...{ onDrop: (e: any) => e.preventDefault(), onDragOver: (e: any) => e.preventDefault() } as any} />
                  {dragging && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 12, pointerEvents: 'none' }}>
                      <span style={{ color: '#3b82f6', fontWeight: 600, fontSize: 14 }}>Drop files here</span>
                    </div>
                  )}
                </div>
            </YStack>

            {/* Upload */}
            <YStack gap="$2">
                <Text fontWeight="500" color={colors.gray[700]}>Attachments (Images, Videos & Documents)</Text>
                
                {/* Hidden file input for native file picker */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />

                {/* File List with Previews */}
                {files.length > 0 && (
                    <XStack gap="$2" flexWrap="wrap" marginBottom="$2">
                        {files.map((file, i) => (
                            <YStack key={i} backgroundColor={colors.gray[100]} borderRadius="$3" overflow="hidden" width={120} position="relative">
                                {file.type === 'image' ? (
                                  <Image src={URL.createObjectURL(file.file)} width={120} height={90} resizeMode="cover" />
                                ) : file.type === 'video' ? (
                                  <YStack width={120} height={90} backgroundColor={colors.gray[200]} alignItems="center" justifyContent="center">
                                    <Video size={24} color={colors.gray[500]} />
                                  </YStack>
                                ) : (
                                  <YStack width={120} height={90} backgroundColor={colors.blue[100]} alignItems="center" justifyContent="center">
                                    <FileText size={24} color={colors.blue[600]} />
                                  </YStack>
                                )}
                                <Text fontSize="$1" color={colors.gray[600]} padding="$1" numberOfLines={1}>{file.name}</Text>
                                <Button 
                                  size="$1" 
                                  chromeless 
                                  icon={<X size={12} />} 
                                  position="absolute" 
                                  top={2} 
                                  right={2} 
                                  backgroundColor="rgba(0,0,0,0.5)" 
                                  borderRadius={999}
                                  onPress={() => setFiles(files.filter((_, idx) => idx !== i))} 
                                />
                            </YStack>
                        ))}
                    </XStack>
                )}

                <XStack gap="$2" {...(!isDesktop && { flexDirection: 'column' } as any)}>
                    <Button 
                        flex={1}
                        borderWidth={2} 
                        borderColor={colors.gray[300]} 
                        borderStyle="dashed" 
                        borderRadius="$3" 
                        padding="$4" 
                        alignItems="center" 
                        justifyContent="center"
                        backgroundColor={colors.gray[50]}
                        onPress={() => fileInputRef.current?.click()}
                        icon={<Upload size={20} color={colors.gray[500]} />}
                    >
                        <Text color={colors.gray[600]}>Add Files</Text>
                    </Button>
                </XStack>
            </YStack>

            <Button 
                marginTop="$4" 
                size="$5" 
                backgroundColor={colors.green[600]} 
                onPress={handleSubmit}
                disabled={loading}
            >
                {loading ? <Spinner color="white" /> : <Text color="white" fontWeight="600">{type === 'bug' ? 'Submit Bug Report' : type === 'feature' ? 'Submit Feature Request' : type === 'support' ? 'Submit Support Request' : 'Submit'}</Text>}
            </Button>
        </Card>
      </YStack>
    </YStack>
  )
}

export function FeedbackSubmitForm() {
  return (
    <Suspense fallback={<Text>Loading...</Text>}>
      <FeedbackSubmitFormContent />
    </Suspense>
  )
}
