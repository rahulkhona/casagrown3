/**
 * FeedbackDetailScreen — Shared detail component for viewing a single ticket.
 *
 * Shows ticket content, attachments, vote button, comments list, and comment input with image upload.
 * Works on iOS, Android, and Web.
 */

import { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Card, Separator, ScrollView, Image, TextArea, Spinner, useMedia } from 'tamagui'
import { useRouter } from 'solito/navigation'
import { colors } from '../../design-tokens'
import { useAuth } from '../auth/auth-hook'
import { ArrowLeft, Bug, Lightbulb, Headphones, Lock, Flag, Camera, X } from '@tamagui/lucide-icons'
import { ArrowUp } from '@tamagui/lucide-icons'
import { TouchableOpacity, Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../utils/supabase'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'
import { uploadFeedbackImage } from './feedback-media-upload'
import {
  fetchTicketById,
  addComment,
  toggleVote,
  flagTicket,
  unflagTicket,
  updateTicketStatus,
  checkIsStaff,
  FeedbackDetail as FeedbackDetailType,
  FeedbackStatus,
  MediaAttachment,
} from './feedback-service'

interface SelectedImage {
  uri: string
  fileName: string
}

export function FeedbackDetailScreen({ id }: { id: string }) {
  const router = useRouter()
  const [ticket, setTicket] = useState<FeedbackDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [commentImages, setCommentImages] = useState<SelectedImage[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [isStaff, setIsStaff] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const media = useMedia()
  const isDesktop = !media.sm
  const { user } = useAuth()

  useEffect(() => {
    if (user?.id) {
      checkIsStaff(user.id).then(setIsStaff)
    }
  }, [user?.id])

  useEffect(() => {
    loadTicket()
  }, [id])

  const loadTicket = async () => {
    setLoading(true)
    const data = await fetchTicketById(id, user?.id)
    setTicket(data)
    setLoading(false)
  }

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: true,
      })
      if (!result.canceled && result.assets.length > 0) {
        const newImages = result.assets.map(a => ({
          uri: a.uri,
          fileName: a.fileName || `image_${Date.now()}.jpg`,
        }))
        setCommentImages(prev => [...prev, ...newImages])
      }
    } catch (err) {
      console.error('Image picker error:', err)
    }
  }

  const handleAddComment = async () => {
    if (!ticket || !newComment.trim()) return
    if (!user) return
    setSubmitting(true)
    try {
      const comment = await addComment({
        feedbackId: ticket.id,
        authorId: user.id,
        content: newComment.trim(),
      })
      if (comment) {
        // Upload images and link to comment
        if (commentImages.length > 0) {
          for (const img of commentImages) {
            try {
              const { mediaId } = await uploadFeedbackImage(
                user.id,
                img.uri,
                img.fileName,
              )
              await supabase.from('feedback_comment_media').insert({
                comment_id: comment.id,
                media_id: mediaId,
              })
            } catch (err) {
              console.error('Comment image upload failed:', err)
            }
          }
        }
        setTicket({
          ...ticket,
          comments: [...ticket.comments, comment],
          comment_count: ticket.comment_count + 1,
        })
        setNewComment('')
        setCommentImages([])
      }
    } catch (err) {
      console.error('Add comment error:', err)
    }
    setSubmitting(false)
  }

  const handleToggleVote = async () => {
    if (!ticket || !user) return
    const success = await toggleVote(ticket.id, user.id, ticket.is_voted)
    if (success) {
      setTicket({
        ...ticket,
        is_voted: !ticket.is_voted,
        vote_count: ticket.is_voted ? ticket.vote_count - 1 : ticket.vote_count + 1,
      })
    }
  }

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours < 1) return 'just now'
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    return `${Math.floor(diffDays / 7)} weeks ago`
  }

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$8">
        <Spinner size="large" color={colors.green[600]} />
      </YStack>
    )
  }

  if (!ticket) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$8" gap="$3">
        <Text fontSize="$6" fontWeight="600" color={colors.gray[500]}>Ticket not found</Text>
        <Button onPress={() => router.back()}>
          <Text>Go back</Text>
        </Button>
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor="white">
      <ScrollView>
        {/* Header */}
        <YStack padding={isDesktop ? '$4' : '$3'} gap={isDesktop ? '$4' : '$3'}>
          <Button
            icon={ArrowLeft}
            chromeless
            onPress={() => router.back()}
            alignSelf="flex-start"
            paddingLeft="$0"
          >
            <Text color={colors.gray[600]}>Back to Board</Text>
          </Button>

          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <StatusBadge status={ticket.status} />
            {ticket.visibility === 'private' && (
              <XStack backgroundColor={colors.blue[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignItems="center" gap="$1">
                <Lock size={10} color={colors.blue[700]} />
                <Text fontSize="$2" color={colors.blue[700]} fontWeight="600">PRIVATE</Text>
              </XStack>
            )}
            <Text color={colors.gray[400]}>• {formatTimeAgo(ticket.created_at)}</Text>
            <TouchableOpacity
              onPress={async () => {
                if (!user) return
                if (ticket.is_flagged) {
                  const ok = await unflagTicket(ticket.id, user.id)
                  if (ok) setTicket({ ...ticket, is_flagged: false, flag_count: ticket.flag_count - 1 })
                } else {
                  const ok = await flagTicket(ticket.id, user.id)
                  if (ok) setTicket({ ...ticket, is_flagged: true, flag_count: ticket.flag_count + 1 })
                }
              }}
            >
              <Flag size={14} color={ticket.is_flagged ? colors.red[500] : colors.gray[400]} />
            </TouchableOpacity>
            {ticket.flag_count > 0 && (
              <Text fontSize="$1" color={colors.red[500]} fontWeight="600">{ticket.flag_count} flagged</Text>
            )}
          </XStack>

          {/* Staff status controls */}
          {isStaff && (
            <YStack gap="$2" padding="$3" backgroundColor={colors.blue[50]} borderRadius="$3" borderWidth={1} borderColor={colors.blue[200]}>
              <Text fontSize="$2" fontWeight="700" color={colors.blue[700]}>⚙️ STAFF: Change Status</Text>
              <XStack gap="$2" flexWrap="wrap">
                {(['open', 'planned', 'in_progress', 'completed', 'rejected', 'duplicate'] as FeedbackStatus[]).map(s => (
                  <TouchableOpacity
                    key={s}
                    disabled={changingStatus || ticket.status === s}
                    onPress={async () => {
                      setChangingStatus(true)
                      const ok = await updateTicketStatus(ticket.id, s)
                      if (ok) setTicket({ ...ticket, status: s })
                      setChangingStatus(false)
                    }}
                  >
                    <Text
                      fontSize="$2"
                      fontWeight="600"
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                      borderRadius="$2"
                      borderWidth={1}
                      borderColor={ticket.status === s ? colors.green[500] : colors.gray[300]}
                      backgroundColor={ticket.status === s ? colors.green[100] : 'white'}
                      color={ticket.status === s ? colors.green[700] : colors.gray[600]}
                      opacity={changingStatus ? 0.5 : 1}
                    >
                      {s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Text>
                  </TouchableOpacity>
                ))}
              </XStack>
            </YStack>
          )}

          <Text fontSize={isDesktop ? '$8' : '$6'} fontWeight="700" lineHeight={isDesktop ? '$8' : '$7'}>{ticket.title}</Text>

          <XStack gap="$2" alignItems="center">
            <YStack
              width={32}
              height={32}
              borderRadius={16}
              backgroundColor={colors.green[300]}
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize="$3" fontWeight="700" color="white">
                {ticket.author_name ? ticket.author_name.charAt(0).toUpperCase() : 'A'}
              </Text>
            </YStack>
            <Text fontSize="$4" fontWeight="400" color={colors.gray[600]}>Posted by <Text fontWeight="600">{ticket.author_name}</Text></Text>
          </XStack>
        </YStack>

        <Separator />

        <YStack padding={isDesktop ? '$4' : '$3'} gap={isDesktop ? '$6' : '$4'}>
          {/* Vote Block */}
          <XStack gap={isDesktop ? '$4' : '$3'} alignItems="flex-start">
            <TouchableOpacity onPress={handleToggleVote}>
              <YStack
                alignItems="center"
                borderWidth={1}
                borderColor={ticket.is_voted ? colors.green[300] : colors.gray[200]}
                borderRadius="$4"
                padding="$2"
                backgroundColor={ticket.is_voted ? colors.green[50] : 'transparent'}
              >
                <ArrowUp size={32} color={ticket.is_voted ? colors.green[600] : colors.gray[500]} />
                <Text fontSize="$6" fontWeight="600" color={ticket.is_voted ? colors.green[700] : undefined}>{ticket.vote_count}</Text>
              </YStack>
            </TouchableOpacity>

            <YStack flex={1} gap="$4">
              <Text fontSize="$5" lineHeight="$6" color={colors.gray[800]}>{ticket.description}</Text>

              {/* Ticket Attachments */}
              {ticket.attachments && ticket.attachments.length > 0 && (
                <XStack gap="$2" flexWrap="wrap">
                  {ticket.attachments.filter(a => a.media_type === 'image').map(att => (
                    <Image
                      key={att.id}
                      source={{ uri: normalizeStorageUrl(att.storage_path) }}
                      width={200}
                      height={150}
                      borderRadius={8}
                    />
                  ))}
                </XStack>
              )}
            </YStack>
          </XStack>
        </YStack>

        <Separator />

        {/* Comments */}
        <YStack padding={isDesktop ? '$4' : '$3'} gap={isDesktop ? '$4' : '$3'} backgroundColor={colors.gray[50]}>
          <Text fontSize="$5" fontWeight="600">Comments ({ticket.comments.length})</Text>

          {ticket.comments.map(comment => (
            <YStack
              key={comment.id}
              padding="$3"
              backgroundColor="white"
              borderRadius="$3"
              borderWidth={comment.is_official_response ? 2 : 1}
              borderColor={comment.is_official_response ? colors.green[500] : colors.gray[200]}
            >
              <XStack gap="$2" alignItems="center" marginBottom="$2">
                <YStack
                  width={24}
                  height={24}
                  borderRadius={12}
                  backgroundColor={colors.green[200]}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize="$1" fontWeight="700" color={colors.green[700]}>
                    {comment.author_name ? comment.author_name.charAt(0).toUpperCase() : 'A'}
                  </Text>
                </YStack>
                <Text fontWeight="600">{comment.author_name}</Text>
                {comment.is_official_response && (
                  <Text color={colors.green[600]} fontSize="$2" fontWeight="600" backgroundColor={colors.green[50]} paddingHorizontal="$2" borderRadius="$2">OFFICIAL</Text>
                )}
                <Text color={colors.gray[400]} fontSize="$2" marginLeft="auto">{formatTimeAgo(comment.created_at)}</Text>
              </XStack>
              <Text color={colors.gray[700]}>{comment.content}</Text>

              {/* Comment Attachments */}
              {comment.attachments && comment.attachments.length > 0 && (
                <XStack gap="$2" flexWrap="wrap" marginTop="$2">
                  {comment.attachments.filter(a => a.media_type === 'image').map(att => (
                    <Image
                      key={att.id}
                      source={{ uri: normalizeStorageUrl(att.storage_path) }}
                      width={150}
                      height={100}
                      borderRadius={8}
                    />
                  ))}
                </XStack>
              )}
            </YStack>
          ))}

          {/* Comment Input */}
          {user && (
            <Card padding="$4" borderWidth={1} borderColor={colors.gray[200]} backgroundColor="white">
              <YStack gap="$3">
                <TextArea
                  placeholder="Write a comment..."
                  value={newComment}
                  onChangeText={setNewComment}
                  minHeight={80}
                  borderWidth={1}
                  borderColor={colors.gray[200]}
                  borderRadius="$3"
                  padding="$3"
                  fontSize="$4"
                  fontWeight="400"
                  backgroundColor={colors.gray[50]}
                  focusStyle={{ borderColor: colors.green[400], backgroundColor: 'white' }}
                />

                {/* Comment Image Previews */}
                {commentImages.length > 0 && (
                  <XStack gap="$2" flexWrap="wrap">
                    {commentImages.map((img, i) => (
                      <YStack key={i} position="relative">
                        <Image
                          source={{ uri: img.uri }}
                          width={60}
                          height={60}
                          borderRadius={6}
                        />
                        <TouchableOpacity
                          onPress={() => setCommentImages(commentImages.filter((_, idx) => idx !== i))}
                          style={{
                            position: 'absolute',
                            top: -6,
                            right: -6,
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            backgroundColor: colors.red[500],
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <X size={10} color="white" />
                        </TouchableOpacity>
                      </YStack>
                    ))}
                  </XStack>
                )}

                <XStack justifyContent="space-between" alignItems="center">
                  <Button
                    size="$3"
                    chromeless
                    icon={<Camera size={18} color={colors.gray[500]} />}
                    onPress={handlePickImage}
                  >
                    <Text color={colors.gray[500]} fontSize="$2">Add Image</Text>
                  </Button>
                  <Button
                    size="$3"
                    backgroundColor={newComment.trim() ? colors.green[600] : colors.gray[300]}
                    disabled={!newComment.trim() || submitting}
                    onPress={handleAddComment}
                    borderRadius="$3"
                  >
                    {submitting ? <Spinner size="small" color="white" /> : <Text color="white" fontWeight="600">Post</Text>}
                  </Button>
                </XStack>
              </YStack>
            </Card>
          )}
        </YStack>
      </ScrollView>
    </YStack>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    open: { bg: colors.gray[100], color: colors.gray[600], label: 'Open' },
    planned: { bg: colors.blue[100], color: colors.blue[600], label: 'Planned' },
    in_progress: { bg: colors.purple[100], color: colors.purple[600], label: 'In Progress' },
    completed: { bg: colors.green[100], color: colors.green[600], label: 'Completed' },
    rejected: { bg: colors.red[100], color: colors.red[600], label: 'Rejected' },
    under_review: { bg: colors.amber[100], color: colors.amber[600], label: 'Under Review' },
    duplicate: { bg: colors.gray[100], color: colors.gray[600], label: 'Duplicate' },
  }[status] || { bg: colors.gray[100], color: colors.gray[600], label: status }

  return (
    <Text backgroundColor={styles.bg} color={styles.color} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" fontSize="$2" fontWeight="600">
      {styles.label}
    </Text>
  )
}
