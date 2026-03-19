'use client'

import React, { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Input } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { CalendarClock, Save } from '@tamagui/lucide-icons'
import { adminApi } from '../../../lib/adminApi'

const POST_TYPE_LABELS: Record<string, string> = {
  want_to_sell: 'Want to Sell',
  want_to_buy: 'Want to Buy',
  offering_service: 'Offering Service',
  need_service: 'Need Service',
  seeking_advice: 'Seeking Advice',
  general_info: 'General Info',
}

type PolicyRow = {
  post_type: string
  expiration_days: number
  updated_at: string
}

export default function PostPoliciesPage() {
  const [policies, setPolicies] = useState<PolicyRow[]>([])
  const [editedDays, setEditedDays] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  const loadPolicies = async () => {
    setLoading(true)
    const { data } = await adminApi.select('post_type_policies', '*', undefined, { order: { column: 'expiration_days', ascending: true } })
    if (data) {
      const policies = data as PolicyRow[]
      setPolicies(policies)
      const days: Record<string, string> = {}
      policies.forEach((p: PolicyRow) => { days[p.post_type] = p.expiration_days.toString() })
      setEditedDays(days)
    }
    setLoading(false)
  }

  useEffect(() => { loadPolicies() }, [])

  const handleSave = async (postType: string) => {
    const days = parseInt(editedDays[postType])
    if (isNaN(days) || days < 1) return

    setSaving(postType)
    const { error } = await adminApi.update(
      'post_type_policies',
      { expiration_days: days, updated_at: new Date().toISOString() },
      { eq: { post_type: postType } }
    )

    if (!error) {
      setSuccessMsg(`Updated ${POST_TYPE_LABELS[postType]} to ${days} days`)
      setTimeout(() => setSuccessMsg(''), 3000)
      loadPolicies()
    }
    setSaving(null)
  }

  const isDirty = (postType: string) => {
    const original = policies.find(p => p.post_type === postType)
    return original && editedDays[postType] !== original.expiration_days.toString()
  }

  return (
    <YStack flex={1} padding="$4" gap="$4">
      <YStack>
        <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>Post Expiration Policies</Text>
        <Text fontSize="$3" color={colors.gray[600]}>Set how many days each post type stays active before auto-archiving.</Text>
      </YStack>

      {successMsg ? (
        <YStack backgroundColor={colors.green[50]} padding="$3" borderRadius="$2" borderWidth={1} borderColor={colors.green[200]}>
          <Text color={colors.green[800]} fontWeight="600">{successMsg}</Text>
        </YStack>
      ) : null}

      {loading ? (
        <Text>Loading policies...</Text>
      ) : (
        <YStack borderWidth={1} borderColor={colors.gray[200]} borderRadius="$4" backgroundColor="white" overflow="hidden">
          {/* Header */}
          <XStack backgroundColor={colors.gray[50]} paddingHorizontal="$4" paddingVertical="$3" borderBottomWidth={1} borderColor={colors.gray[200]}>
            <Text flex={2} fontWeight="700" fontSize="$2" color={colors.gray[500]} textTransform="uppercase">Post Type</Text>
            <Text flex={1} fontWeight="700" fontSize="$2" color={colors.gray[500]} textTransform="uppercase">Expiration (Days)</Text>
            <Text width={120} fontWeight="700" fontSize="$2" color={colors.gray[500]} textTransform="uppercase" textAlign="center">Action</Text>
          </XStack>

          {policies.map((policy, idx) => (
            <XStack
              key={policy.post_type}
              paddingHorizontal="$4"
              paddingVertical="$3"
              alignItems="center"
              borderBottomWidth={idx < policies.length - 1 ? 1 : 0}
              borderColor={colors.gray[100]}
              hoverStyle={{ backgroundColor: colors.gray[50] }}
            >
              <YStack flex={2}>
                <Text fontWeight="600" fontSize="$4">{POST_TYPE_LABELS[policy.post_type] || policy.post_type}</Text>
                <Text fontSize="$2" color={colors.gray[400]}>{policy.post_type}</Text>
              </YStack>
              <XStack flex={1} alignItems="center" gap="$2">
                <Input
                  value={editedDays[policy.post_type] || ''}
                  onChangeText={(val) => setEditedDays(prev => ({ ...prev, [policy.post_type]: val }))}
                  keyboardType="numeric"
                  width={80}
                  textAlign="center"
                  size="$3"
                />
                <Text fontSize="$3" color={colors.gray[500]}>days</Text>
              </XStack>
              <XStack width={120} justifyContent="center">
                {isDirty(policy.post_type) ? (
                  <Button
                    size="$3"
                    backgroundColor={colors.green[600]}
                    icon={<Save size={14} color="white" />}
                    onPress={() => handleSave(policy.post_type)}
                    disabled={saving === policy.post_type}
                  >
                    <Text color="white" fontWeight="600" fontSize="$2">
                      {saving === policy.post_type ? 'Saving...' : 'Save'}
                    </Text>
                  </Button>
                ) : (
                  <Text fontSize="$2" color={colors.gray[300]}>—</Text>
                )}
              </XStack>
            </XStack>
          ))}
        </YStack>
      )}
    </YStack>
  )
}
