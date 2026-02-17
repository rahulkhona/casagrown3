/**
 * General Form — service, advice, show-and-tell
 * Enhanced with community map, adjacent zones, global posting, and media selection
 */

import { useState, useEffect } from 'react'
import {
  YStack,
  XStack,
  Input,
  Button,
  Text,
  Label,
  Spinner,
  TextArea,
  Checkbox,
} from 'tamagui'
import {
  MapPin,
  Globe,
  Check,
} from '@tamagui/lucide-icons'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'
import { colors, borderRadius } from '../../design-tokens'
import { useAuth } from '../auth/auth-hook'
import {
  createGeneralPost,
  updateGeneralPost,
  getUserCommunitiesWithNeighbors,
  type UserCommunitiesResult,
  buildCommunityMapData,
} from './post-service'
import type { ResolveResponse } from '../community/use-resolve-community'
import { loadMediaFromStorage } from './load-media-helper'
import { useMediaAssets } from './useMediaAssets'
import { CommunityMapWrapper } from './CommunityMapWrapper'
import { PostFormShell } from './PostFormShell'
import { MediaPickerSection } from './MediaPickerSection'

interface GeneralFormProps {
  postType: string
  onBack: () => void
  onSuccess: () => void
  editId?: string
  cloneData?: string
}

const FORM_TITLE_KEYS: Record<string, string> = {
  need_service: 'createPost.types.needService.formTitle',
  offering_service: 'createPost.types.offerService.formTitle',
  seeking_advice: 'createPost.types.advice.formTitle',
  general_info: 'createPost.types.showTell.formTitle',
}

// Which post types support which features
const TYPES_WITH_ADJACENT = ['offering_service']
const TYPES_WITH_GLOBAL = ['seeking_advice', 'general_info']

export function GeneralForm({ postType, onBack, onSuccess, editId, cloneData }: GeneralFormProps) {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const media = useMediaAssets()

  // ── Form State ──────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [communityName, setCommunityName] = useState('')
  const [communityH3Index, setCommunityH3Index] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingCommunity, setLoadingCommunity] = useState(true)
  const [formError, setFormError] = useState('')

  // ── Community + Map State ───────────────────────────────────
  const [communitiesData, setCommunitiesData] = useState<UserCommunitiesResult | null>(null)
  const [communityMapData, setCommunityMapData] = useState<ResolveResponse | null>(null)
  const [selectedNeighborH3Indices, setSelectedNeighborH3Indices] = useState<string[]>([])
  const [postGlobally, setPostGlobally] = useState(TYPES_WITH_GLOBAL.includes(postType))

  // ── Load community on mount ─────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    loadCommunityData()
  }, [user?.id])

  // ── Load edit data ─────────────────────────────────────────
  useEffect(() => {
    if (!editId && !cloneData) return
    let cancelled = false
    ;(async () => {
      try {
        // Clone mode: parse inline JSON data
        if (cloneData && !editId) {
          try {
            const parsed = JSON.parse(cloneData)
            const content = parsed.content ? JSON.parse(parsed.content) : {}
            if (content.title) setTitle(content.title)
            if (content.description) setDescription(content.description)
            // Load media from storage paths
            if (parsed.media && parsed.media.length > 0) {
              const loadedAssets = await loadMediaFromStorage(parsed.media, { isExisting: true })
              if (!cancelled && loadedAssets.length > 0) {
                media.setMediaAssets(loadedAssets)
              }
            }
          } catch {}
          return
        }
        // Edit mode: fetch from DB
        const { getPostById } = await import('../my-posts/my-posts-service')
        const { supabase } = await import('../auth/auth-hook')
        const post = await getPostById(editId!)
        if (cancelled || !post) return
        // Pre-fill from content JSON
        try {
          const parsed = JSON.parse(post.content)
          if (parsed.title) setTitle(parsed.title)
          if (parsed.description) setDescription(parsed.description)
        } catch {}
        if (post.media && post.media.length > 0) {
          const loadedAssets = await loadMediaFromStorage(post.media, { isExisting: true })
          if (!cancelled && loadedAssets.length > 0) {
            media.setMediaAssets(loadedAssets)
          }
        }
      } catch (err) {
        console.error('Error loading edit data:', err)
      }
    })()
    return () => { cancelled = true }
  }, [editId])

  async function loadCommunityData() {
    if (!user?.id) return
    setLoadingCommunity(true)
    try {
      const communities = await getUserCommunitiesWithNeighbors(user.id)
      setCommunitiesData(communities)

      if (communities.primary) {
        setCommunityH3Index(communities.primary.h3Index)
        setCommunityName(communities.primary.name)
        // Build map data for CommunityMap
        const mapData = await buildCommunityMapData(communities.primary, communities.neighbors)
        setCommunityMapData(mapData)
      } else {
        // No community means stale session — sign out and redirect
        await signOut()
        if (typeof window !== 'undefined') { window.location.href = '/' } else { onBack() }
        return
      }
    } catch (err) {
      console.error('Error loading community:', err)
      // Network/auth error — sign out and redirect
      await signOut()
      if (typeof window !== 'undefined') { window.location.href = '/' } else { onBack() }
    } finally {
      setLoadingCommunity(false)
    }
  }

  // ── Submit ──────────────────────────────────────────────────
  async function handleSubmit() {
    if (!user?.id) return
    if (!title.trim() || !description.trim()) {
      setFormError(t('createPost.validation.requiredFields'))
      return
    }

    setFormError('')
    setSubmitting(true)
    try {
      const postData = {
        authorId: user.id,
        communityH3Index: postGlobally ? undefined : (communityH3Index || undefined),
        additionalCommunityH3Indices: selectedNeighborH3Indices.length > 0 ? selectedNeighborH3Indices : undefined,
        type: postType,
        title,
        description,
        reach: (postGlobally ? 'global' : 'community') as 'global' | 'community',
        mediaAssets: media.mediaAssets.length > 0 ? media.mediaAssets.map(a => ({ uri: a.uri, type: a.type ?? undefined })) : undefined,
      }
      if (editId) {
        await updateGeneralPost(editId, postData)
      } else {
        await createGeneralPost(postData)
      }
      onSuccess()
    } catch (err) {
      console.error('Error creating post:', err)
      setFormError(t('createPost.error.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  const formTitleKey = FORM_TITLE_KEYS[postType] || 'createPost.title'
  const showAdjacent = TYPES_WITH_ADJACENT.includes(postType)
  const showGlobal = TYPES_WITH_GLOBAL.includes(postType)

  return (
    <PostFormShell
      title={t(formTitleKey)}
      onBack={onBack}
      onSubmit={handleSubmit}
      submitting={submitting}
      formError={formError}
      onClearError={() => setFormError('')}
    >
      {/* ════════════════════════════════════════════════════
          COMMUNITY + MAP
          ════════════════════════════════════════════════════ */}
      <YStack
        backgroundColor="white"
        borderRadius={borderRadius.lg}
        padding="$4"
        gap="$3"
        borderWidth={1}
        borderColor={colors.neutral[200]}
      >
        <Label fontWeight="600" color={colors.neutral[900]}>
          {t('createPost.fields.community')}
        </Label>

        {loadingCommunity ? (
          <XStack alignItems="center" gap="$2" padding="$3">
            <Spinner size="small" color={colors.primary[600]} />
            <Text color={colors.neutral[500]}>{t('createPost.loading.community')}</Text>
          </XStack>
        ) : communityName ? (
          <YStack gap="$3">
            {/* Global toggle (seek_advice, show_and_tell) — shown first */}
            {showGlobal && (
              <XStack
                alignItems="center"
                gap="$3"
                backgroundColor={postGlobally ? colors.green[50] : colors.neutral[50]}
                padding="$3"
                borderRadius={borderRadius.md}
                borderWidth={1}
                borderColor={postGlobally ? colors.green[300] : colors.neutral[200]}
                pressStyle={{ opacity: 0.8 }}
                onPress={() => setPostGlobally(!postGlobally)}
                cursor="pointer"
              >
                <Checkbox
                  checked={postGlobally}
                  onCheckedChange={(val) => setPostGlobally(!!val)}
                  size="$4"
                >
                  <Checkbox.Indicator>
                    <Check color={colors.green[600]} />
                  </Checkbox.Indicator>
                </Checkbox>
                <Globe size={20} color={postGlobally ? colors.green[600] : colors.neutral[400]} />
                <YStack flex={1}>
                  <Text fontWeight="500" color={colors.neutral[900]}>{t('createPost.global.label')}</Text>
                  <Text fontSize="$2" color={colors.neutral[500]}>
                    {t('createPost.global.hint')}
                  </Text>
                </YStack>
              </XStack>
            )}

            {/* Community name, neighbors, and map — hidden when posting globally */}
            {!postGlobally && (
              <>
                <XStack alignItems="center" gap="$2">
                  <MapPin size={18} color={colors.primary[600]} />
                  <Text fontWeight="500" color={colors.neutral[900]}>
                    {communityName}
                  </Text>
                </XStack>

                {/* Adjacent communities — selectable (offering_service only) */}
                {showAdjacent && communitiesData?.neighbors && communitiesData.neighbors.length > 0 && (
                  <YStack gap="$2">
                    <Text fontSize="$2" fontWeight="500" color={colors.neutral[600]}>
                      {t('createPost.neighbors.alsoOfferService')}
                    </Text>
                    <XStack flexWrap="wrap" gap="$2">
                      {communitiesData.neighbors.map((n) => {
                        const isSelected = selectedNeighborH3Indices.includes(n.h3Index)
                        return (
                          <Pressable
                            key={n.h3Index}
                            onPress={() => {
                              setSelectedNeighborH3Indices((prev) =>
                                prev.includes(n.h3Index)
                                  ? prev.filter((h) => h !== n.h3Index)
                                  : [...prev, n.h3Index]
                              )
                            }}
                          >
                            <XStack
                              alignItems="center"
                              gap="$1.5"
                              backgroundColor={isSelected ? colors.green[600] : 'white'}
                              borderWidth={1}
                              borderColor={isSelected ? colors.green[600] : colors.neutral[300]}
                              borderRadius={borderRadius.full}
                              paddingHorizontal="$3"
                              paddingVertical="$1.5"
                            >
                              <MapPin size={12} color={isSelected ? 'white' : colors.neutral[500]} />
                              <Text fontSize="$2" color={isSelected ? 'white' : colors.neutral[700]} fontWeight="500">
                                {n.name}
                              </Text>
                            </XStack>
                          </Pressable>
                        )
                      })}
                    </XStack>
                    {selectedNeighborH3Indices.length > 0 && (
                      <Text fontSize="$1" color={colors.neutral[400]}>
                        {t('createPost.neighbors.selectedCount', { count: selectedNeighborH3Indices.length })}
                      </Text>
                    )}
                  </YStack>
                )}

                {/* Community Map */}
                {communityMapData && (
                  <YStack borderRadius={borderRadius.md} overflow="hidden">
                    <CommunityMapWrapper
                      resolveData={communityMapData}
                      height={200}
                      showLabels={true}
                      selectedNeighborH3Indices={showAdjacent ? selectedNeighborH3Indices : undefined}
                    />
                  </YStack>
                )}
              </>
            )}
          </YStack>
        ) : (
          <XStack alignItems="center" gap="$2" padding="$3">
            <Spinner size="small" color={colors.primary[600]} />
            <Text color={colors.neutral[500]}>{t('createPost.loading.communityData')}</Text>
          </XStack>
        )}
      </YStack>

      {/* ════════════════════════════════════════════════════
          TITLE + DESCRIPTION
          ════════════════════════════════════════════════════ */}
      <YStack
        backgroundColor="white"
        borderRadius={borderRadius.lg}
        padding="$4"
        gap="$4"
        borderWidth={1}
        borderColor={colors.neutral[200]}
      >
        <YStack gap="$2">
          <Label fontWeight="600" color={colors.neutral[900]}>
            {t('createPost.fields.title')} *
          </Label>
          <Input
            size="$4"
            value={title}
            onChangeText={setTitle}
            placeholder={t('createPost.fields.titlePlaceholder')}
            borderColor={colors.neutral[300]}
            focusStyle={{ borderColor: colors.primary[500] }}
            backgroundColor="white"
            fontWeight="400"
          />
        </YStack>

        <YStack gap="$2">
          <Label fontWeight="600" color={colors.neutral[900]}>
            {t('createPost.fields.description')} *
          </Label>
          <TextArea
            size="$4"
            value={description}
            onChangeText={setDescription}
            placeholder={t('createPost.fields.descriptionPlaceholder')}
            borderColor={colors.neutral[300]}
            focusStyle={{ borderColor: colors.primary[500] }}
            backgroundColor="white"
            numberOfLines={5}
            style={{ fontWeight: '400', textAlignVertical: 'top' } as Record<string, string>}
          />
        </YStack>
      </YStack>

      {/* ════════════════════════════════════════════════════
          PHOTO / VIDEO
          ════════════════════════════════════════════════════ */}
      <MediaPickerSection media={media} />
    </PostFormShell>
  )
}
