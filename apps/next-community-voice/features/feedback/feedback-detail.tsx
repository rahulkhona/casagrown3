'use client'

import { useState, useRef, useEffect } from 'react'
import { YStack, XStack, Text, Button, Card, Separator, Avatar, ScrollView, Image, TextArea, Spinner, useMedia } from 'tamagui'
import { useRouter } from 'next/navigation'
import { colors } from '@casagrown/app/design-tokens'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { ArrowUp, MessageSquare, ArrowLeft, Bug, Lightbulb, Share, MoreHorizontal, Image as ImageIcon, Video, X, Paperclip, FileText, Headphones, Lock, Flag, Trash2, ShieldCheck } from '@tamagui/lucide-icons'
import { fetchTicketById, addComment, toggleVote, flagTicket, unflagTicket, deleteFeedback, dismissAllFlags, checkIsStaffByEmail, FeedbackDetail as FeedbackDetailType, FeedbackComment, MediaAttachment } from './feedback-service'

export function FeedbackDetail({ id }: { id: string }) {
  const router = useRouter()
  const [ticket, setTicket] = useState<FeedbackDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [attachments, setAttachments] = useState<{ type: string; url: string; name: string; file: File }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const media = useMedia()
  const isDesktop = !media.sm
  const { user } = useAuth()
  const [isStaff, setIsStaff] = useState(false)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (files: FileList | null, type: 'image' | 'video' | 'document') => {
    if (!files) return
    const newFiles = Array.from(files).map(f => ({ type, url: URL.createObjectURL(f), name: f.name, file: f }))
    setAttachments([...attachments, ...newFiles])
  }

  // Load ticket on mount
  useEffect(() => {
    loadTicket()
  }, [id])

  useEffect(() => {
    if (!user?.email) { setIsStaff(false); return }
    checkIsStaffByEmail(user.email).then(r => setIsStaff(r.isStaff))
  }, [user?.email])

  const loadTicket = async () => {
    setLoading(true)
    const data = await fetchTicketById(id)
    setTicket(data)
    setLoading(false)
  }

  const handleAddComment = async () => {
    if (!ticket || (!newComment.trim() && attachments.length === 0)) return
    if (!user) {
      console.error('Cannot add comment: no authenticated user')
      return
    }
    setSubmitting(true)
    const hadAttachments = attachments.length > 0
    const comment = await addComment({
      feedbackId: ticket.id,
      authorId: user.id,
      content: newComment.trim(),
      files: attachments.map(a => a.file),
    })
    if (comment) {
      if (hadAttachments) {
        // Reload to get fresh attachment data from DB
        const refreshed = await fetchTicketById(ticket.id)
        if (refreshed) setTicket(refreshed)
      } else {
        setTicket({
          ...ticket,
          comments: [...ticket.comments, comment],
          comment_count: ticket.comment_count + 1,
        })
      }
      setNewComment('')
      setAttachments([])
    }
    setSubmitting(false)
  }

  const handleToggleVote = async () => {
    if (!ticket) return
    if (!user) {
      router.push(`/login?returnTo=/board/${ticket.id}`)
      return
    }
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

        <XStack gap="$2" alignItems="center">
           <StatusBadge status={ticket.status} />
           {ticket.visibility === 'private' && (
             <XStack backgroundColor={colors.blue[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignItems="center" gap="$1">
               <Lock size={10} color={colors.blue[700]} />
               <Text fontSize="$2" color={colors.blue[700]} fontWeight="600">PRIVATE</Text>
             </XStack>
           )}
           <Text color={colors.gray[400]}>• {formatTimeAgo(ticket.created_at)}</Text>
           <Button
             chromeless
             size="$2"
             padding="$1"
             icon={<Flag size={14} color={ticket.is_flagged ? colors.red[500] : colors.gray[400]} />}
             onPress={async () => {
               if (!user) { router.push(`/login?returnTo=/board/${ticket.id}`); return }
               if (ticket.is_flagged) {
                 const ok = await unflagTicket(ticket.id, user.id)
                 if (ok) setTicket({ ...ticket, is_flagged: false, flag_count: ticket.flag_count - 1 })
               } else {
                 const ok = await flagTicket(ticket.id, user.id)
                 if (ok) setTicket({ ...ticket, is_flagged: true, flag_count: ticket.flag_count + 1 })
               }
             }}
           />
           {ticket.flag_count > 0 && (
             <Text fontSize="$1" color={colors.red[500]} fontWeight="600">{ticket.flag_count} flagged</Text>
           )}
        </XStack>

        {/* Staff Actions */}
        {isStaff && (
          <XStack gap="$2" alignItems="center" backgroundColor={colors.gray[50]} padding="$3" borderRadius="$3" borderWidth={1} borderColor={colors.gray[200]}>
            <ShieldCheck size={16} color={colors.green[600]} />
            <Text fontSize="$2" color={colors.gray[600]} fontWeight="500" flex={1}>Staff Actions</Text>
            {ticket.flag_count > 0 && (
              <Button
                size="$2"
                backgroundColor={colors.amber[100]}
                borderRadius="$3"
                onPress={async () => {
                  const ok = await dismissAllFlags(ticket.id)
                  if (ok) setTicket({ ...ticket, flag_count: 0, is_flagged: false })
                }}
              >
                <Text fontSize="$2" color={colors.amber[700]} fontWeight="600">Dismiss Flags</Text>
              </Button>
            )}
            <Button
              size="$2"
              backgroundColor={colors.red[100]}
              borderRadius="$3"
              onPress={async () => {
                if (!confirm('Delete this ticket permanently? This cannot be undone.')) return
                const ok = await deleteFeedback(ticket.id)
                if (ok) router.push('/board')
              }}
            >
              <Text fontSize="$2" color={colors.red[600]} fontWeight="600">Delete Post</Text>
            </Button>
          </XStack>
        )}

        <Text fontSize={isDesktop ? '$8' : '$6'} fontWeight="700" lineHeight={isDesktop ? '$8' : '$7'}>{ticket.title}</Text>
        
        <XStack gap="$2" alignItems="center">
          <Avatar circular size="$3">
            {ticket.author_avatar ? (
              <Image src={ticket.author_avatar} width={40} height={40} borderRadius={20} />
            ) : null}
            <Avatar.Fallback backgroundColor={colors.green[300]} />
          </Avatar>
          <Text fontSize="$4" fontWeight="400" color={colors.gray[600]}>Posted by <Text fontWeight="600">{ticket.author_name}</Text></Text>
        </XStack>
      </YStack>

      <Separator />

      <YStack padding={isDesktop ? '$4' : '$3'} gap={isDesktop ? '$6' : '$4'}>
        {/* Vote Block */}
        <XStack gap={isDesktop ? '$4' : '$3'} alignItems="flex-start">
             <YStack 
               alignItems="center" 
               borderWidth={1} 
               borderColor={ticket.is_voted ? colors.green[300] : colors.gray[200]} 
               borderRadius="$4" 
               padding="$2"
               pressStyle={{ scale: 0.95 }}
               onPress={handleToggleVote}
               cursor="pointer"
             >
                <ArrowUp size={32} color={ticket.is_voted ? colors.green[600] : colors.gray[500]} />
                <Text fontSize="$6" fontWeight="600" color={ticket.is_voted ? colors.green[700] : undefined}>{ticket.vote_count}</Text>
             </YStack>
             
             <YStack flex={1} gap="$4">
                <Text fontSize="$5" lineHeight="$6" color={colors.gray[800]}>{ticket.description}</Text>
                {/* Ticket attachments */}
                {ticket.attachments && ticket.attachments.length > 0 && (
                  <XStack gap="$2" flexWrap="wrap">
                    {ticket.attachments.map((att) => (
                      <AttachmentDisplay key={att.id} attachment={att} />
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
            <YStack key={comment.id} padding="$3" backgroundColor="white" borderRadius="$3" borderWidth={comment.is_official_response ? 2 : 1} borderColor={comment.is_official_response ? colors.green[500] : colors.gray[200]}>
                <XStack gap="$2" alignItems="center" marginBottom="$2">
                    <Avatar circular size="$2">
                        {comment.author_avatar ? (
                          <Image src={comment.author_avatar} width={32} height={32} borderRadius={16} /> 
                        ) : null}
                        <Avatar.Fallback backgroundColor={colors.green[200]} />
                    </Avatar>
                    <Text fontWeight="600">{comment.author_name}</Text>
                    {comment.is_official_response && (
                        <Text color={colors.green[600]} fontSize="$2" fontWeight="600" backgroundColor={colors.green[50]} paddingHorizontal="$2" borderRadius="$2">OFFICIAL</Text>
                    )}
                    <Text color={colors.gray[400]} fontSize="$2" marginLeft="auto">{formatTimeAgo(comment.created_at)}</Text>
                </XStack>
                <Text color={colors.gray[700]}>{comment.content}</Text>
                {/* Comment attachments */}
                {comment.attachments && comment.attachments.length > 0 && (
                  <XStack gap="$2" flexWrap="wrap" marginTop="$2">
                    {comment.attachments.map((att) => (
                      <AttachmentDisplay key={att.id} attachment={att} />
                    ))}
                  </XStack>
                )}
            </YStack>
        ))}

        {/* Comment Input */}
        {user ? (
        <Card
          padding="$4"
          borderWidth={1}
          borderColor={colors.gray[200]}
          backgroundColor="white"
          onDragOver={(e: any) => { e.preventDefault(); e.stopPropagation() }}
          onDrop={(e: any) => {
            e.preventDefault()
            e.stopPropagation()
            const files = e.dataTransfer?.files
            if (!files || files.length === 0) return
            const newFiles = Array.from(files as FileList).map((f: File) => {
              const type = f.type.startsWith('image/') ? 'image' as const
                : f.type.startsWith('video/') ? 'video' as const
                : 'document' as const
              return { type, url: URL.createObjectURL(f), name: f.name, file: f }
            })
            setAttachments([...attachments, ...newFiles])
          }}
        >
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
                    style={{ fontWeight: 400 }}
                    backgroundColor={colors.gray[50]}
                    focusStyle={{ borderColor: colors.green[400], backgroundColor: 'white' }}
                 />
                 
                 {/* Attachment Previews */}
                 {attachments.length > 0 && (
                     <XStack gap="$2" flexWrap="wrap">
                         {attachments.map((att, i) => (
                             <YStack key={i} position="relative">
                                 <YStack width={60} height={60} backgroundColor={colors.gray[100]} borderRadius="$2" alignItems="center" justifyContent="center" borderWidth={1} borderColor={colors.gray[300]}>
                                     {att.type === 'image' ? <ImageIcon size={20} color={colors.gray[500]} /> : att.type === 'video' ? <Video size={20} color={colors.gray[500]} /> : <FileText size={20} color={colors.blue[600]} />}
                                 </YStack>
                                 <Button 
                                    position="absolute" 
                                    top={-8} 
                                    right={-8} 
                                    size="$2" 
                                    circular 
                                    backgroundColor={colors.red[500]} 
                                    icon={X} 
                                    scale={0.7}
                                    onPress={() => setAttachments(attachments.filter((_, idx) => idx !== i))}
                                 />
                             </YStack>
                         ))}
                     </XStack>
                 )}
                 
                 <XStack justifyContent="space-between" alignItems="center">
                     <XStack gap="$2" alignItems="center">
                         <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handleFileSelect(e.target.files, 'image')} />
                         <input ref={videoInputRef} type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={(e) => handleFileSelect(e.target.files, 'video')} />
                         <input ref={docInputRef} type="file" accept="application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" multiple style={{ display: 'none' }} onChange={(e) => handleFileSelect(e.target.files, 'document')} />
                         <Button size="$3" chromeless icon={ImageIcon} onPress={() => imageInputRef.current?.click()} />
                         <Button size="$3" chromeless icon={Video} onPress={() => videoInputRef.current?.click()} />
                         <Button size="$3" chromeless icon={FileText} onPress={() => docInputRef.current?.click()} />
                     </XStack>
                     <Button 
                        size="$3" 
                        backgroundColor={newComment.trim() || attachments.length > 0 ? colors.green[600] : colors.gray[300]} 
                        disabled={(!newComment.trim() && attachments.length === 0) || submitting}
                        onPress={handleAddComment}
                     >
                        {submitting ? <Spinner size="small" color="white" /> : <Text color="white" fontWeight="600">Post</Text>}
                     </Button>
                 </XStack>
            </YStack>
        </Card>
        ) : (
        <Card padding="$4" borderWidth={1} borderColor={colors.gray[200]} backgroundColor="white" alignItems="center">
          <Button
            backgroundColor={colors.green[600]}
            borderRadius="$3"
            paddingHorizontal="$6"
            onPress={() => router.push(`/login?returnTo=/board/${ticket.id}`)}
            hoverStyle={{ backgroundColor: colors.green[700] }}
            pressStyle={{ backgroundColor: colors.green[700] }}
          >
            <Text color="white" fontWeight="600">Log in to comment</Text>
          </Button>
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

function AttachmentDisplay({ attachment }: { attachment: MediaAttachment }) {
  const fileName = attachment.metadata?.original_name || 'Attachment';

  if (attachment.media_type === 'image') {
    return (
      <a href={attachment.storage_path} target="_blank" rel="noopener noreferrer">
        <img
          src={attachment.storage_path}
          alt={fileName}
          style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, objectFit: 'cover', border: `1px solid ${colors.gray[200]}` }}
        />
      </a>
    )
  }

  if (attachment.media_type === 'video') {
    return (
      <video
        controls
        src={attachment.storage_path}
        style={{ maxWidth: 300, maxHeight: 200, borderRadius: 8 }}
      />
    )
  }

  // Document (PDF, etc)
  return (
    <a href={attachment.storage_path} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
      <XStack
        gap="$2"
        alignItems="center"
        backgroundColor={colors.blue[100]}
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderRadius="$2"
        borderWidth={1}
        borderColor={colors.blue[100]}
      >
        <FileText size={16} color={colors.blue[600]} />
        <Text fontSize="$3" color={colors.blue[700]} fontWeight="500">{fileName}</Text>
      </XStack>
    </a>
  )
}
