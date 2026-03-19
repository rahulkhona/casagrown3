'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Separator, Checkbox, Spinner, Input, TextArea, Label } from 'tamagui'
import { Plus, Edit3, Trash2, Award, Check, X, MapPin } from '@tamagui/lucide-icons'
import { adminApi } from '../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'
import dynamic from 'next/dynamic'

// Lazy-load the map widget (Leaflet doesn't work in SSR)
const AdminMapWidget = dynamic(
  () => import('@casagrown/app/features/admin/components/AdminMapWidget').then(m => ({ default: m.AdminMapWidget })),
  { ssr: false, loading: () => <YStack height={300} backgroundColor={colors.gray[100]} alignItems="center" justifyContent="center"><Spinner /><Text fontSize={12} color={colors.gray[500]} marginTop="$2">Loading map...</Text></YStack> }
)

const BEHAVIORS = [
  { value: 'signup', label: 'Sign Up' },
  { value: 'first_post', label: 'First Post' },
  { value: 'first_purchase', label: 'First Purchase' },
  { value: 'first_sale', label: 'First Sale' },
  { value: 'per_referral', label: 'Per Referral' },
  { value: 'first_purchase_by_referee', label: 'First Purchase by Referee' },
  { value: 'first_sale_by_referee', label: 'First Sale by Referee' },
]

type Campaign = {
  id: string
  name: string
  description: string
  starts_at: string
  ends_at: string
  is_active: boolean
}

type CampaignReward = {
  id: string
  campaign_id: string
  behavior: string
  points: number
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Create form state
  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formStartsAt, setFormStartsAt] = useState('')
  const [formEndsAt, setFormEndsAt] = useState('')
  const [formIsActive, setFormIsActive] = useState(true)
  const [formRewards, setFormRewards] = useState<{ behavior: string; points: string }[]>([
    { behavior: '', points: '' }
  ])
  const [formZones, setFormZones] = useState<string[]>([])

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStartsAt, setEditStartsAt] = useState('')
  const [editEndsAt, setEditEndsAt] = useState('')
  const [editZones, setEditZones] = useState<string[]>([])

  // Rewards & zones display state
  const [rewardsMap, setRewardsMap] = useState<Record<string, CampaignReward[]>>({})
  const [zonesMap, setZonesMap] = useState<Record<string, string[]>>({})
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)

  const fetchCampaigns = async () => {
    setLoading(true)
    const { data } = await adminApi.select('incentive_campaigns', '*', undefined, { order: { column: 'starts_at', ascending: false } })
    
    if (data) {
      setCampaigns(data as Campaign[])
      const ids = (data as Campaign[]).map((c: Campaign) => c.id)
      if (ids.length > 0) {
        // Fetch rewards
        const { data: rewards } = await adminApi.select(
          'campaign_rewards', '*', { in: { campaign_id: ids } }
        )
        
        if (rewards) {
          const map: Record<string, CampaignReward[]> = {}
          ;(rewards as CampaignReward[]).forEach((r: CampaignReward) => {
            if (!map[r.campaign_id]) map[r.campaign_id] = []
            map[r.campaign_id].push(r)
          })
          setRewardsMap(map)
        }

        // Fetch zones
        const { data: zones } = await adminApi.select(
          'campaign_zones', 'campaign_id, community_h3_index', { in: { campaign_id: ids } }
        )
        
        if (zones) {
          const zMap: Record<string, string[]> = {}
          ;(zones as any[]).forEach((z: any) => {
            if (!zMap[z.campaign_id]) zMap[z.campaign_id] = []
            if (z.community_h3_index) zMap[z.campaign_id].push(z.community_h3_index)
          })
          setZonesMap(zMap)
        }
      }
    }
    setLoading(false)
  }

  useEffect(() => { fetchCampaigns() }, [])

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    setCampaigns(prev => prev.map(c => 
      c.id === id ? { ...c, is_active: !currentStatus } : c
    ))
    
    const { error } = await adminApi.update(
      'incentive_campaigns',
      { is_active: !currentStatus },
      { eq: { id } }
    )
      
    if (error) {
      console.error('Failed to update:', error)
      setCampaigns(prev => prev.map(c => 
        c.id === id ? { ...c, is_active: currentStatus } : c
      ))
    }
  }

  const handleCreate = async () => {
    if (!formName.trim()) { setErrorMessage('Campaign name is required.'); return }
    if (!formStartsAt || !formEndsAt) { setErrorMessage('Start and end dates are required.'); return }

    setSubmitting(true)
    setErrorMessage('')
    try {
      const { data: campaigns, error } = await adminApi.insert('incentive_campaigns', {
          name: formName.trim(),
          description: formDescription.trim() || null,
          starts_at: new Date(formStartsAt).toISOString(),
          ends_at: new Date(formEndsAt).toISOString(),
          is_active: formIsActive,
        })

      if (error) throw new Error(error)
      const campaignList = campaigns as Campaign[] | null
      const campaign = campaignList?.[0]
      if (!campaign) throw new Error('Campaign creation returned no data')

      // Insert rewards
      const validRewards = formRewards.filter(r => r.behavior && r.points)
      if (validRewards.length > 0 && campaign) {
        const rewardRows = validRewards.map(r => ({
          campaign_id: campaign.id,
          behavior: r.behavior,
          points: parseInt(r.points),
        }))
        const { error: rewardError } = await adminApi.insert('campaign_rewards', rewardRows)
        if (rewardError) throw new Error(rewardError)
      }

      // Insert zones
      if (formZones.length > 0 && campaign) {
        const zoneRows = formZones.map(h3 => ({
          campaign_id: campaign.id,
          community_h3_index: h3,
        }))
        const { error: zoneError } = await adminApi.insert('campaign_zones', zoneRows)
        if (zoneError) throw new Error(zoneError)
      }

      setIsAdding(false)
      resetForm()
      setSuccessMessage(`Campaign "${campaign.name}" created with ${formZones.length} zones`)
      setTimeout(() => setSuccessMessage(''), 4000)
      fetchCampaigns()
    } catch (e: any) {
      setErrorMessage(`Failed to create campaign: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    setErrorMessage('')
    const { error } = await adminApi.delete('incentive_campaigns', { eq: { id } })
    
    if (error) {
      setErrorMessage(`Failed to delete: ${error}`)
    } else {
      fetchCampaigns()
    }
  }

  const startEdit = (campaign: Campaign) => {
    setEditingId(campaign.id)
    setEditName(campaign.name)
    setEditDescription(campaign.description || '')
    setEditStartsAt(campaign.starts_at.split('T')[0])
    setEditEndsAt(campaign.ends_at.split('T')[0])
    setEditZones(zonesMap[campaign.id] || [])
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSubmitting(true)
    setErrorMessage('')
    try {
      const { error } = await adminApi.update(
        'incentive_campaigns',
        {
          name: editName.trim(),
          description: editDescription.trim() || null,
          starts_at: new Date(editStartsAt).toISOString(),
          ends_at: new Date(editEndsAt).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { eq: { id: editingId } }
      )
      
      if (error) throw new Error(error)

      // Replace zones: delete old, insert new
      await adminApi.delete('campaign_zones', { eq: { campaign_id: editingId } })

      if (editZones.length > 0) {
        const zoneRows = editZones.map(h3 => ({
          campaign_id: editingId,
          community_h3_index: h3,
        }))
        const { error: zoneError } = await adminApi.insert('campaign_zones', zoneRows)
        if (zoneError) throw new Error(zoneError)
      }

      setEditingId(null)
      setSuccessMessage('Campaign updated')
      setTimeout(() => setSuccessMessage(''), 3000)
      fetchCampaigns()
    } catch (e: any) {
      setErrorMessage(`Failed to update: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormStartsAt('')
    setFormEndsAt('')
    setFormIsActive(true)
    setFormRewards([{ behavior: '', points: '' }])
    setFormZones([])
    setErrorMessage('')
  }

  const addRewardRow = () => {
    setFormRewards(prev => [...prev, { behavior: '', points: '' }])
  }

  const updateReward = (index: number, field: 'behavior' | 'points', value: string) => {
    setFormRewards(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  const removeReward = (index: number) => {
    setFormRewards(prev => prev.filter((_, i) => i !== index))
  }

  const getBehaviorLabel = (behavior: string) => {
    return BEHAVIORS.find(b => b.value === behavior)?.label || behavior
  }

  // Stable callbacks for map
  const handleFormZonesChange = useCallback((zones: string[]) => setFormZones(zones), [])
  const handleEditZonesChange = useCallback((zones: string[]) => setEditZones(zones), [])

  return (
    <YStack flex={1} padding="$6" gap="$5" maxWidth={1000}>
      <XStack justifyContent="space-between" alignItems="center">
        <YStack>
          <Text fontSize="$8" fontWeight="bold" color={colors.green[900]}>Incentive Campaigns</Text>
          <Text color={colors.gray[600]}>Manage point-earning campaigns. Optionally target specific communities.</Text>
        </YStack>
        {!isAdding && (
          <Button icon={Plus} backgroundColor={colors.green[600]} onPress={() => { resetForm(); setIsAdding(true) }}>
            <Text color="white" fontWeight="600">New Campaign</Text>
          </Button>
        )}
      </XStack>

      {errorMessage ? (
        <YStack backgroundColor={colors.red[50]} padding="$3" borderRadius="$2" borderWidth={1} borderColor={colors.red[200]}>
          <Text color={colors.red[800]} fontWeight="600">{errorMessage}</Text>
        </YStack>
      ) : null}

      {successMessage ? (
        <YStack backgroundColor={colors.green[50]} padding="$3" borderRadius="$2" borderWidth={1} borderColor={colors.green[200]}>
          <Text color={colors.green[800]} fontWeight="600">{successMessage}</Text>
        </YStack>
      ) : null}

      {/* CREATE CAMPAIGN FORM */}
      {isAdding && (
        <YStack borderWidth={1} borderColor={colors.gray[200]} padding="$5" backgroundColor="white" borderRadius="$4" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" gap="$2" borderBottomWidth={1} borderColor={colors.gray[200]} paddingBottom="$3">
              <Award size={20} color={colors.green[700]} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Create New Campaign</Text>
            </XStack>

            <YStack gap="$3">
              <YStack gap="$1">
                <Label>Campaign Name *</Label>
                <Input value={formName} onChangeText={setFormName} placeholder="e.g. Spring Launch Bonus" />
              </YStack>

              <YStack gap="$1">
                <Label>Description</Label>
                <TextArea value={formDescription} onChangeText={setFormDescription} placeholder="Brief description..." minHeight={60} />
              </YStack>

              <XStack gap="$3">
                <YStack gap="$1" flex={1}>
                  <Label>Start Date *</Label>
                  <Input value={formStartsAt} onChangeText={setFormStartsAt} placeholder="YYYY-MM-DD" />
                </YStack>
                <YStack gap="$1" flex={1}>
                  <Label>End Date *</Label>
                  <Input value={formEndsAt} onChangeText={setFormEndsAt} placeholder="YYYY-MM-DD" />
                </YStack>
              </XStack>

              <XStack alignItems="center" gap="$3">
                <Checkbox size="$5" checked={formIsActive} onCheckedChange={(checked) => setFormIsActive(!!checked)} borderColor={colors.gray[300]} backgroundColor={formIsActive ? colors.green[50] : 'white'}>
                  <Checkbox.Indicator><Check size={18} color={colors.green[700]} /></Checkbox.Indicator>
                </Checkbox>
                <Text color={colors.gray[700]} fontWeight="600">Active immediately</Text>
              </XStack>

              {/* REWARDS SUB-FORM */}
              <YStack gap="$2" marginTop="$2">
                <XStack alignItems="center" justifyContent="space-between">
                  <Label>Reward Rules</Label>
                  <Button size="$2" chromeless icon={Plus} onPress={addRewardRow}>
                    <Text fontSize="$2" color={colors.green[700]}>Add Reward</Text>
                  </Button>
                </XStack>
                
                <YStack gap="$2" padding="$3" backgroundColor={colors.gray[50]} borderRadius="$3">
                  {formRewards.map((reward, idx) => (
                    <XStack key={idx} gap="$2" alignItems="center">
                      <YStack flex={2}>
                        <select
                          value={reward.behavior}
                          onChange={(e) => updateReward(idx, 'behavior', e.target.value)}
                          style={{
                            width: '100%', padding: '8px 12px',
                            border: `1px solid ${colors.gray[300]}`, borderRadius: 8,
                            backgroundColor: 'white', fontSize: 14,
                            color: reward.behavior ? '#1a1a1a' : '#9ca3af',
                          }}
                        >
                          <option value="">Select behavior...</option>
                          {BEHAVIORS.map(b => (
                            <option key={b.value} value={b.value}>{b.label}</option>
                          ))}
                        </select>
                      </YStack>
                      <YStack flex={1}>
                        <Input
                          value={reward.points}
                          onChangeText={(text) => updateReward(idx, 'points', text)}
                          placeholder="Points"
                          keyboardType="numeric"
                          size="$3"
                        />
                      </YStack>
                      {formRewards.length > 1 && (
                        <Button size="$2" chromeless icon={<X size={14} color={colors.red[500]} />} onPress={() => removeReward(idx)} />
                      )}
                    </XStack>
                  ))}
                </YStack>
              </YStack>

              {/* COMMUNITY ZONES - MAP */}
              <YStack gap="$2" marginTop="$2">
                <XStack alignItems="center" gap="$2">
                  <MapPin size={16} color={colors.green[700]} />
                  <Label>Target Communities</Label>
                  {formZones.length > 0 && (
                    <XStack backgroundColor={colors.green[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2">
                      <Text fontSize="$2" fontWeight="600" color={colors.green[700]}>{formZones.length} zone{formZones.length !== 1 ? 's' : ''} selected</Text>
                    </XStack>
                  )}
                </XStack>
                <Text fontSize={12} color={colors.gray[500]}>
                  Search for a city, state, or ZIP code to auto-fill all zones in that region. Search again to add more. Leave empty for a global campaign.
                </Text>
                <AdminMapWidget
                  selectedH3Indices={formZones}
                  onChange={handleFormZonesChange}
                  height={350}
                  autoFillOnSearch
                />
                {formZones.length > 0 && (
                  <Button size="$2" chromeless onPress={() => setFormZones([])}>
                    <Text fontSize="$2" color={colors.red[500]}>Clear all zones</Text>
                  </Button>
                )}
              </YStack>
            </YStack>

            <XStack gap="$3" justifyContent="flex-end" marginTop="$2">
              <Button chromeless onPress={() => { setIsAdding(false); resetForm() }}>
                <Text color={colors.gray[600]}>Cancel</Text>
              </Button>
              <Button backgroundColor={colors.green[600]} onPress={handleCreate} disabled={submitting}>
                <Text color="white" fontWeight="600">{submitting ? 'Creating...' : 'Create Campaign'}</Text>
              </Button>
            </XStack>
          </YStack>
        </YStack>
      )}

      {/* CAMPAIGNS TABLE */}
      <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} overflow="hidden">
        <XStack backgroundColor={colors.gray[50]} padding="$3" borderBottomWidth={1} borderColor={colors.gray[200]}>
          <Text flex={2} fontWeight="600" color={colors.gray[600]} fontSize={14}>Campaign Name</Text>
          <Text flex={1} fontWeight="600" color={colors.gray[600]} fontSize={14}>Duration</Text>
          <Text width={80} fontWeight="600" color={colors.gray[600]} fontSize={14} textAlign="center">Zones</Text>
          <Text width={80} fontWeight="600" color={colors.gray[600]} fontSize={14} textAlign="center">Status</Text>
          <Text width={100} fontWeight="600" color={colors.gray[600]} fontSize={14} textAlign="right">Actions</Text>
        </XStack>
        
        {loading ? (
          <YStack padding="$6" alignItems="center"><Spinner size="large" color={colors.green[600]} /></YStack>
        ) : campaigns.length === 0 ? (
          <YStack padding="$6" alignItems="center">
            <Text color={colors.gray[500]}>No campaigns found. Create one to get started.</Text>
          </YStack>
        ) : (
          <ScrollView>
            {campaigns.map((campaign, idx) => (
              <YStack key={campaign.id}>
                {idx > 0 && <Separator />}
                
                {editingId === campaign.id ? (
                  /* INLINE EDIT */
                  <YStack padding="$4" backgroundColor={colors.green[50]} gap="$3">
                    <XStack gap="$3">
                      <YStack flex={2} gap="$1">
                        <Label fontSize="$2">Name</Label>
                        <Input value={editName} onChangeText={setEditName} size="$3" />
                      </YStack>
                      <YStack flex={2} gap="$1">
                        <Label fontSize="$2">Description</Label>
                        <Input value={editDescription} onChangeText={setEditDescription} size="$3" />
                      </YStack>
                    </XStack>
                    <XStack gap="$3">
                      <YStack flex={1} gap="$1">
                        <Label fontSize="$2">Start Date</Label>
                        <Input value={editStartsAt} onChangeText={setEditStartsAt} size="$3" placeholder="YYYY-MM-DD" />
                      </YStack>
                      <YStack flex={1} gap="$1">
                        <Label fontSize="$2">End Date</Label>
                        <Input value={editEndsAt} onChangeText={setEditEndsAt} size="$3" placeholder="YYYY-MM-DD" />
                      </YStack>
                    </XStack>

                    {/* Edit zones map */}
                    <YStack gap="$2">
                      <XStack alignItems="center" gap="$2">
                        <MapPin size={14} color={colors.green[700]} />
                        <Text fontSize="$3" fontWeight="600" color={colors.gray[700]}>
                          Target Zones
                        </Text>
                        {editZones.length > 0 && (
                          <XStack backgroundColor={colors.green[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2">
                            <Text fontSize="$1" fontWeight="600" color={colors.green[700]}>{editZones.length} selected</Text>
                          </XStack>
                        )}
                      </XStack>
                      <AdminMapWidget
                        selectedH3Indices={editZones}
                        onChange={handleEditZonesChange}
                        height={250}
                        autoFillOnSearch
                      />
                    </YStack>

                    <XStack gap="$2" justifyContent="flex-end">
                      <Button size="$3" chromeless onPress={() => setEditingId(null)}>
                        <Text color={colors.gray[600]}>Cancel</Text>
                      </Button>
                      <Button size="$3" backgroundColor={colors.green[600]} onPress={saveEdit} disabled={submitting}>
                        <Text color="white" fontWeight="600">{submitting ? 'Saving...' : 'Save'}</Text>
                      </Button>
                    </XStack>
                  </YStack>
                ) : (
                  /* DISPLAY ROW */
                  <YStack>
                    <XStack padding="$3" paddingVertical="$4" alignItems="center" 
                      data-testid={`campaign-row-${campaign.id}`}
                      cursor="pointer" 
                      hoverStyle={{ backgroundColor: colors.gray[50] }}
                      onPress={() => setExpandedCampaign(expandedCampaign === campaign.id ? null : campaign.id)}
                    >
                      <YStack flex={2} paddingRight="$4">
                        <Text fontWeight="600" color={colors.gray[900]}>{campaign.name}</Text>
                        {campaign.description && (
                          <Text fontSize={13} color={colors.gray[500]} numberOfLines={1}>{campaign.description}</Text>
                        )}
                      </YStack>
                      <YStack flex={1}>
                        <Text fontSize={13} color={colors.gray[600]}>
                          {new Date(campaign.starts_at).toLocaleDateString()} –
                        </Text>
                        <Text fontSize={13} color={colors.gray[600]}>
                          {new Date(campaign.ends_at).toLocaleDateString()}
                        </Text>
                      </YStack>
                      <XStack width={80} justifyContent="center">
                        {(zonesMap[campaign.id]?.length || 0) > 0 ? (
                          <XStack backgroundColor={colors.blue[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2">
                            <Text fontSize={11} fontWeight="600" color={colors.blue[700]}>{zonesMap[campaign.id]!.length}</Text>
                          </XStack>
                        ) : (
                          <Text fontSize={11} color={colors.gray[400]}>Global</Text>
                        )}
                      </XStack>
                      <XStack width={80} justifyContent="center" alignItems="center">
                        <Checkbox
                          size="$4" 
                          checked={campaign.is_active} 
                          onCheckedChange={() => toggleStatus(campaign.id, campaign.is_active)}
                          borderColor={colors.gray[300]}
                          backgroundColor={campaign.is_active ? colors.green[50] : 'white'}
                          data-testid={`campaign-status-${campaign.id}`}
                        >
                          <Checkbox.Indicator><Check size={16} color={colors.green[700]} /></Checkbox.Indicator>
                        </Checkbox>
                      </XStack>
                      <XStack width={100} justifyContent="flex-end" gap="$2">
                        <Button size="$2" circular icon={Edit3} chromeless onPress={(e: any) => { e.stopPropagation?.(); startEdit(campaign) }} data-testid={`campaign-edit-${campaign.id}`} />
                        <Button size="$2" circular icon={<Trash2 size={16} color={colors.red[500]} />} chromeless onPress={(e: any) => { e.stopPropagation?.(); handleDelete(campaign.id) }} data-testid={`campaign-delete-${campaign.id}`} />
                      </XStack>
                    </XStack>

                    {/* EXPANDED SECTION */}
                    {expandedCampaign === campaign.id && (
                      <YStack padding="$3" paddingLeft="$5" paddingTop="$0" backgroundColor={colors.gray[50]} borderTopWidth={1} borderColor={colors.gray[100]} gap="$3">
                        {/* Rewards */}
                        <YStack>
                          <Text fontSize="$2" fontWeight="700" color={colors.gray[500]} marginBottom="$2" textTransform="uppercase" letterSpacing={0.5}>
                            Reward Rules
                          </Text>
                          {(rewardsMap[campaign.id] || []).length === 0 ? (
                            <Text fontSize="$3" color={colors.gray[400]}>No rewards configured.</Text>
                          ) : (
                            <YStack gap="$1">
                              {(rewardsMap[campaign.id] || []).map(reward => (
                                <XStack key={reward.id} gap="$2" alignItems="center">
                                  <XStack backgroundColor={colors.green[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2">
                                    <Text fontSize="$2" color={colors.green[800]} fontWeight="600">{getBehaviorLabel(reward.behavior)}</Text>
                                  </XStack>
                                  <Text fontSize="$3" color={colors.gray[700]}>→</Text>
                                  <Text fontSize="$3" fontWeight="700" color={colors.green[700]}>{reward.points} pts</Text>
                                </XStack>
                              ))}
                            </YStack>
                          )}
                        </YStack>

                        {/* Zone Map (read-only) */}
                        <YStack>
                          <Text fontSize="$2" fontWeight="700" color={colors.gray[500]} marginBottom="$2" textTransform="uppercase" letterSpacing={0.5}>
                            Target Zones {(zonesMap[campaign.id]?.length || 0) > 0 ? `(${zonesMap[campaign.id]!.length})` : '— Global'}
                          </Text>
                          {(zonesMap[campaign.id]?.length || 0) > 0 ? (
                            <AdminMapWidget
                              selectedH3Indices={zonesMap[campaign.id] || []}
                              onChange={() => {}}
                              height={250}
                              readOnly
                            />
                          ) : (
                            <Text fontSize="$3" color={colors.gray[400]}>
                              This campaign applies globally — no specific zones targeted.
                            </Text>
                          )}
                        </YStack>
                      </YStack>
                    )}
                  </YStack>
                )}
              </YStack>
            ))}
          </ScrollView>
        )}
      </YStack>
    </YStack>
  )
}
