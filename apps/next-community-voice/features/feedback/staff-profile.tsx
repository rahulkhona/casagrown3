'use client'

import { useState, useEffect, useRef } from 'react'
import { YStack, XStack, Text, Button, Card, Input, Spinner, Image, useMedia } from 'tamagui'
import { useRouter } from 'next/navigation'
import { colors } from '@casagrown/app/design-tokens'
import { ArrowLeft, Camera, User, Save, Check, ImagePlus } from '@tamagui/lucide-icons'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { supabase } from '@casagrown/app/utils/supabase'
import { WebCameraModal } from '@casagrown/app/features/create-post/WebCameraModal'

export function StaffProfile() {
  const router = useRouter()
  const media = useMedia()
  const isDesktop = !media.sm
  const { user, loading: authLoading } = useAuth()

  const [fullName, setFullName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/staff/login')
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (!user) return
    loadProfile()
  }, [user])

  const loadProfile = async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, avatar_url, email')
      .eq('id', user.id)
      .single()

    if (data) {
      setFullName(data.full_name || '')
      setAvatarUrl(data.avatar_url || null)
      setEmail(data.email || user.email || '')
    } else {
      setEmail(user.email || '')
      // Pre-fill from user_metadata (social login data)
      const meta = user.user_metadata
      if (meta) {
        setFullName(meta.full_name || meta.name || '')
        setAvatarUrl(meta.avatar_url || meta.picture || null)
      }
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setSaved(false)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', user.id)

    if (error) {
      console.error('Profile update error:', error.message)
    } else {
      router.push('/staff/dashboard')
    }
    setSaving(false)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploading(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${user.id}/avatar.${ext}`

    // Upload to avatars bucket
    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadErr) {
      console.error('Avatar upload error:', uploadErr.message)
      setUploading(false)
      return
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(path)

    const newUrl = urlData.publicUrl

    // Update profile
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: newUrl })
      .eq('id', user.id)

    if (!updateErr) {
      setAvatarUrl(newUrl + '?t=' + Date.now()) // bust cache
    }
    setUploading(false)
  }

  const handleCameraCapture = async (asset: { uri: string; type: 'image' | 'video'; fileName: string }) => {
    setShowCamera(false)
    if (!user) return

    // Convert blob URI to File
    const response = await fetch(asset.uri)
    const blob = await response.blob()
    const file = new File([blob], asset.fileName, { type: 'image/jpeg' })

    setUploading(true)
    const path = `${user.id}/avatar.jpg`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadErr) {
      console.error('Avatar upload error:', uploadErr.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(path)

    const newUrl = urlData.publicUrl

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: newUrl })
      .eq('id', user.id)

    if (!updateErr) {
      setAvatarUrl(newUrl + '?t=' + Date.now())
    }
    setUploading(false)
  }

  if (authLoading || loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]}>
        <Spinner size="large" color={colors.green[600]} />
      </YStack>
    )
  }

  if (!user) return null // redirecting to login

  return (
    <YStack flex={1} backgroundColor={colors.green[50]} padding={isDesktop ? '$6' : '$3'}>
      {/* Back */}
      <Button
        icon={ArrowLeft}
        chromeless
        onPress={() => router.push('/staff/dashboard')}
        alignSelf="flex-start"
        paddingLeft="$0"
        marginBottom="$3"
      >
        <Text color={colors.gray[600]}>Back to Dashboard</Text>
      </Button>

      <Card
        padding={isDesktop ? '$6' : '$4'}
        backgroundColor="white"
        borderRadius="$4"
        borderWidth={1}
        borderColor={colors.gray[200]}
        maxWidth={480}
        alignSelf="center"
        width="100%"
        gap="$5"
      >
        <Text fontSize="$7" fontWeight="700" color={colors.gray[900]}>Staff Profile</Text>

        {/* Avatar Section */}
        <YStack alignItems="center" gap="$3">
          <YStack
            width={100}
            height={100}
            borderRadius={50}
            backgroundColor={colors.green[100]}
            alignItems="center"
            justifyContent="center"
            overflow="hidden"
            position="relative"
            onPress={() => fileInputRef.current?.click()}
            cursor="pointer"
          >
            {uploading ? (
              <Spinner size="large" color={colors.green[600]} />
            ) : avatarUrl ? (
              <img
                src={avatarUrl}
                width={100}
                height={100}
                style={{ objectFit: 'cover', borderRadius: 50 }}
                alt="Avatar"
              />
            ) : (
              <User size={40} color={colors.green[400]} />
            )}
          </YStack>
          <XStack gap="$2">
            <Button
              size="$3"
              chromeless
              icon={<Camera size={14} color={colors.green[600]} />}
              onPress={() => setShowCamera(true)}
            >
              <Text color={colors.green[600]} fontWeight="500">Take Photo</Text>
            </Button>
            <Button
              size="$3"
              chromeless
              icon={<ImagePlus size={14} color={colors.green[600]} />}
              onPress={() => fileInputRef.current?.click()}
            >
              <Text color={colors.green[600]} fontWeight="500">Choose from Library</Text>
            </Button>
          </XStack>
          {/* Gallery input — opens file picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarUpload}
          />
        </YStack>

        {/* Name */}
        <YStack gap="$2">
          <Text fontWeight="500" color={colors.gray[700]} fontSize="$3">Full Name</Text>
          <Input
            placeholder="Enter your name"
            value={fullName}
            onChangeText={setFullName}
            size="$5"
            borderRadius="$3"
            borderWidth={1}
            borderColor={colors.gray[300]}
            fontWeight="400"
            style={{ fontWeight: 400 }}
          />
        </YStack>

        {/* Email (read-only) */}
        <YStack gap="$2">
          <Text fontWeight="500" color={colors.gray[700]} fontSize="$3">Email</Text>
          <Input
            value={email}
            size="$5"
            borderRadius="$3"
            borderWidth={1}
            borderColor={colors.gray[200]}
            backgroundColor={colors.gray[50]}
            fontWeight="400"
            style={{ fontWeight: 400 }}
            disabled
          />
          <Text fontSize="$2" color={colors.gray[400]}>Email cannot be changed</Text>
        </YStack>

        {/* Save Button */}
        <Button
          backgroundColor={saved ? colors.green[100] : colors.green[600]}
          borderRadius="$3"
          size="$5"
          onPress={handleSave}
          disabled={saving}
          pressStyle={{ backgroundColor: colors.green[700] }}
          icon={saving ? <Spinner color="white" /> : saved ? <Check size={18} color={colors.green[700]} /> : <Save size={18} color="white" />}
        >
          <Text color={saved ? colors.green[700] : 'white'} fontWeight="600" fontSize="$4">
            {saving ? '' : saved ? 'Saved!' : 'Save Changes'}
          </Text>
        </Button>
      </Card>

      {/* Camera Modal */}
      {showCamera && (
        <WebCameraModal
          mode="photo"
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </YStack>
  )
}
