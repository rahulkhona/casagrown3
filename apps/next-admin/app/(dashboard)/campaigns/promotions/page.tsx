'use client'

import React, { useEffect, useState } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Separator, Checkbox, Spinner, Input, TextArea, Label } from 'tamagui'
import { Plus, Check, X, Gift, CreditCard, Link as LinkIcon, Trash2 } from '@tamagui/lucide-icons'
import { adminApi } from '../../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'

type PromoGiveaway = {
  id: string
  start_date: string
  end_date: string
  photos: string[]
}

type PromoCredits = {
  id: string
  amount_usd: number
  credit_type: string
  cap_type: string
  cap_value: number
  frequency: string
  occurrences: number
  start_date: string
}

type Promotion = {
  id: string
  name: string
  description_html: string
  enrollment_deadline: string
  max_enrollees: number
  current_enrollees: number
  created_at: string
  giveaway?: PromoGiveaway
  credits?: PromoCredits
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Form states
  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  // Base Promo
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [deadline, setDeadline] = useState('')
  const [maxEnrollees, setMaxEnrollees] = useState('100')
  
  // Toggles
  const [hasGiveaway, setHasGiveaway] = useState(false)
  const [hasCredits, setHasCredits] = useState(false)
  const [createLandingPage, setCreateLandingPage] = useState(true)

  // Giveaway
  const [gwStart, setGwStart] = useState('')
  const [gwEnd, setGwEnd] = useState('')

  // Credits
  const [crAmount, setCrAmount] = useState('')
  const [crType, setCrType] = useState('purchase')
  const [crCapType, setCrCapType] = useState('percentage')
  const [crCapValue, setCrCapValue] = useState('')
  const [crFreq, setCrFreq] = useState('monthly')
  const [crOccurrences, setCrOccurrences] = useState('1')
  const [crStart, setCrStart] = useState('')

  const fetchPromotions = async () => {
    setLoading(true)
    try {
      const { data: promos, error: pErr } = await adminApi.select('crm_promotions', '*', undefined, { order: { column: 'created_at', ascending: false } })
      if (pErr) throw new Error(pErr)

      if (promos && promos.length > 0) {
        const ids = promos.map((p: any) => p.id)
        
        const { data: gws } = await adminApi.select('crm_promo_giveaways', '*', { in: { promotion_id: ids } })
        const { data: crs } = await adminApi.select('crm_recurring_user_incentives_blueprint', '*', { in: { promotion_id: ids } })

        const gwMap = (gws as any[] || []).reduce((acc, curr) => ({ ...acc, [curr.promotion_id]: curr }), {})
        const crMap = (crs as any[] || []).reduce((acc, curr) => ({ ...acc, [curr.promotion_id]: curr }), {})

        const formatted = (promos as any[]).map(p => ({
          ...p,
          giveaway: gwMap[p.id],
          credits: crMap[p.id]
        }))
        setPromotions(formatted)
      } else {
        setPromotions([])
      }
    } catch (e: any) {
      setErrorMsg(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPromotions() }, [])

  const handleCreate = async () => {
    if (!name || !deadline || !maxEnrollees) { setErrorMsg('Fill out all base fields.'); return }
    if (!hasGiveaway && !hasCredits) { setErrorMsg('You must enable at least one offer (Giveaway or Credits).'); return }
    
    setSubmitting(true)
    setErrorMsg('')
    
    try {
      // 1. Create Base
      const { data: promoData, error: promoErr } = await adminApi.insert('crm_promotions', {
        name,
        description_html: desc || null,
        enrollment_deadline: new Date(deadline).toISOString(),
        max_enrollees: parseInt(maxEnrollees)
      })
      if (promoErr || !promoData) throw new Error(promoErr || 'Failed to create promo')
      const promoId = promoData[0].id

      // 2. Create Giveaway if enabled
      if (hasGiveaway) {
        const { error: gwErr } = await adminApi.insert('crm_promo_giveaways', {
          promotion_id: promoId,
          start_date: new Date(gwStart).toISOString(),
          end_date: new Date(gwEnd).toISOString()
        })
        if (gwErr) throw new Error(gwErr)
      }

      // 3. Create Credits if enabled
      if (hasCredits) {
        const { error: crErr } = await adminApi.insert('crm_recurring_user_incentives_blueprint', {
          promotion_id: promoId,
          amount_usd: parseFloat(crAmount),
          credit_type: crType,
          cap_type: crCapType,
          cap_value: parseFloat(crCapValue),
          frequency: crFreq,
          occurrences: parseInt(crOccurrences),
          start_date: new Date(crStart).toISOString()
        })
        if (crErr) throw new Error(crErr)
      }

      // 4. Create CRM Campaign and Landing Page if enabled
      if (createLandingPage) {
        const { data: campData, error: campErr } = await adminApi.insert('crm_campaigns', {
          name: `${name} Campaign`,
          channel: 'email',
          promotion_id: promoId,
          status: 'draft'
        })
        if (campErr || !campData) throw new Error(campErr || 'Failed to create campaign')
        const campId = campData[0].id

        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
        const { error: lpErr } = await adminApi.insert('crm_landing_pages', {
          slug,
          title: name,
          campaign_id: campId
        })
        if (lpErr) throw new Error(lpErr)
        
        setSuccessMsg(`Promotion created! Landing page live at /p/${slug}`)
      } else {
        setSuccessMsg('Promotion created successfully.')
      }

      setIsAdding(false)
      resetForm()
      setTimeout(() => setSuccessMsg(''), 5000)
      fetchPromotions()
    } catch (e: any) {
      setErrorMsg(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promotion?')) return
    const { error } = await adminApi.delete('crm_promotions', { eq: { id } })
    if (error) setErrorMsg(`Delete failed: ${error}`)
    else fetchPromotions()
  }

  const resetForm = () => {
    setName('')
    setDesc('')
    setDeadline('')
    setMaxEnrollees('100')
    setHasGiveaway(false)
    setHasCredits(false)
    setCreateLandingPage(true)
    setGwStart('')
    setGwEnd('')
    setCrAmount('')
    setCrCapValue('')
    setCrOccurrences('1')
    setCrStart('')
    setErrorMsg('')
  }

  return (
    <YStack flex={1} padding="$6" gap="$5" maxWidth={1000}>
      <XStack justifyContent="space-between" alignItems="center">
        <YStack>
          <Text fontSize="$8" fontWeight="bold" color={colors.green[900]}>Public Promotions</Text>
          <Text color={colors.gray[600]}>Build multi-offer CRM campaigns and auto-generate landing pages.</Text>
        </YStack>
        {!isAdding && (
          <Button icon={Plus} backgroundColor={colors.green[600]} onPress={() => { resetForm(); setIsAdding(true) }}>
            <Text color="white" fontWeight="600">New Promotion</Text>
          </Button>
        )}
      </XStack>

      {errorMsg ? (
        <YStack backgroundColor={colors.red[50]} padding="$3" borderRadius="$2" borderWidth={1} borderColor={colors.red[200]}>
          <Text color={colors.red[800]} fontWeight="600">{errorMsg}</Text>
        </YStack>
      ) : null}

      {successMsg ? (
        <YStack backgroundColor={colors.green[50]} padding="$3" borderRadius="$2" borderWidth={1} borderColor={colors.green[200]}>
          <Text color={colors.green[800]} fontWeight="600">{successMsg}</Text>
        </YStack>
      ) : null}

      {isAdding && (
        <YStack borderWidth={1} borderColor={colors.gray[200]} padding="$5" backgroundColor="white" borderRadius="$4" elevation="$1" gap="$4">
          <Text fontSize="$5" fontWeight="600" color={colors.gray[800]} borderBottomWidth={1} borderColor={colors.gray[200]} paddingBottom="$3">
            1. Base Configuration
          </Text>
          
          <YStack gap="$3">
            <YStack gap="$1">
              <Label>Promotion Name *</Label>
              <Input value={name} onChangeText={setName} placeholder="e.g. Spring Harvest Giveaway" />
            </YStack>
            <YStack gap="$1">
              <Label>Description HTML</Label>
              <TextArea value={desc} onChangeText={setDesc} placeholder="<p>Sign up to win...</p>" minHeight={80} />
            </YStack>
            <XStack gap="$3">
              <YStack gap="$1" flex={1}>
                <Label>Enrollment Deadline *</Label>
                <Input type="datetime-local" value={deadline} onChangeText={setDeadline} />
              </YStack>
              <YStack gap="$1" flex={1}>
                <Label>Max Enrollees *</Label>
                <Input keyboardType="numeric" value={maxEnrollees} onChangeText={setMaxEnrollees} />
              </YStack>
            </XStack>
          </YStack>

          <Text fontSize="$5" fontWeight="600" color={colors.gray[800]} borderBottomWidth={1} borderColor={colors.gray[200]} paddingBottom="$3" marginTop="$4">
            2. Offer Configuration (Composition)
          </Text>

          {/* Giveaway Toggle & Form */}
          <YStack backgroundColor={hasGiveaway ? colors.green[50] : colors.gray[50]} padding="$4" borderRadius="$3" borderWidth={1} borderColor={hasGiveaway ? colors.green[200] : colors.gray[200]} gap="$3">
            <XStack alignItems="center" gap="$3">
              <Checkbox size="$5" checked={hasGiveaway} onCheckedChange={(c) => setHasGiveaway(!!c)} backgroundColor={hasGiveaway ? colors.green[500] : 'white'}>
                <Checkbox.Indicator><Check size={18} color="white" /></Checkbox.Indicator>
              </Checkbox>
              <Gift size={20} color={hasGiveaway ? colors.green[700] : colors.gray[400]} />
              <Text fontWeight="600" color={hasGiveaway ? colors.green[900] : colors.gray[500]}>Enable Giveaway Prize</Text>
            </XStack>
            
            {hasGiveaway && (
              <XStack gap="$3" marginTop="$2">
                <YStack gap="$1" flex={1}>
                  <Label>Giveaway Start Date</Label>
                  <Input type="date" value={gwStart} onChangeText={setGwStart} />
                </YStack>
                <YStack gap="$1" flex={1}>
                  <Label>Giveaway End Date</Label>
                  <Input type="date" value={gwEnd} onChangeText={setGwEnd} />
                </YStack>
              </XStack>
            )}
          </YStack>

          {/* Credits Toggle & Form */}
          <YStack backgroundColor={hasCredits ? colors.green[50] : colors.gray[50]} padding="$4" borderRadius="$3" borderWidth={1} borderColor={hasCredits ? colors.green[200] : colors.gray[200]} gap="$3">
            <XStack alignItems="center" gap="$3">
              <Checkbox size="$5" checked={hasCredits} onCheckedChange={(c) => setHasCredits(!!c)} backgroundColor={hasCredits ? colors.green[500] : 'white'}>
                <Checkbox.Indicator><Check size={18} color="white" /></Checkbox.Indicator>
              </Checkbox>
              <CreditCard size={20} color={hasCredits ? colors.green[700] : colors.gray[400]} />
              <Text fontWeight="600" color={hasCredits ? colors.green[900] : colors.gray[500]}>Enable Recurring Store Credits</Text>
            </XStack>
            
            {hasCredits && (
              <YStack gap="$3" marginTop="$2">
                <XStack gap="$3">
                  <YStack gap="$1" flex={1}>
                    <Label>Amount ($)</Label>
                    <Input keyboardType="numeric" value={crAmount} onChangeText={setCrAmount} />
                  </YStack>
                  <YStack gap="$1" flex={1}>
                    <Label>Credit Type</Label>
                    <select value={crType} onChange={e => setCrType(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.gray[300]}`, borderRadius: 8, backgroundColor: 'white' }}>
                      <option value="universal">Universal</option>
                      <option value="purchase">Purchase</option>
                      <option value="platform_fee">Platform Fee</option>
                    </select>
                  </YStack>
                </XStack>
                <XStack gap="$3">
                  <YStack gap="$1" flex={1}>
                    <Label>Cap Type</Label>
                    <select value={crCapType} onChange={e => setCrCapType(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.gray[300]}`, borderRadius: 8, backgroundColor: 'white' }}>
                      <option value="percentage">Percentage</option>
                      <option value="flat_amount">Flat Amount</option>
                    </select>
                  </YStack>
                  <YStack gap="$1" flex={1}>
                    <Label>Cap Value</Label>
                    <Input keyboardType="numeric" value={crCapValue} onChangeText={setCrCapValue} />
                  </YStack>
                </XStack>
                <XStack gap="$3">
                  <YStack gap="$1" flex={1}>
                    <Label>Frequency</Label>
                    <select value={crFreq} onChange={e => setCrFreq(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.gray[300]}`, borderRadius: 8, backgroundColor: 'white' }}>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="onetime">One-Time</option>
                    </select>
                  </YStack>
                  <YStack gap="$1" flex={1}>
                    <Label>Occurrences</Label>
                    <Input keyboardType="numeric" value={crOccurrences} onChangeText={setCrOccurrences} />
                  </YStack>
                  <YStack gap="$1" flex={1}>
                    <Label>Start Date</Label>
                    <Input type="date" value={crStart} onChangeText={setCrStart} />
                  </YStack>
                </XStack>
              </YStack>
            )}
          </YStack>

          <Text fontSize="$5" fontWeight="600" color={colors.gray[800]} borderBottomWidth={1} borderColor={colors.gray[200]} paddingBottom="$3" marginTop="$4">
            3. Delivery
          </Text>

          <XStack alignItems="center" gap="$3">
            <Checkbox size="$5" checked={createLandingPage} onCheckedChange={(c) => setCreateLandingPage(!!c)} backgroundColor={createLandingPage ? colors.green[500] : 'white'}>
              <Checkbox.Indicator><Check size={18} color="white" /></Checkbox.Indicator>
            </Checkbox>
            <LinkIcon size={20} color={colors.gray[600]} />
            <Text fontWeight="600" color={colors.gray[800]}>Auto-generate CRM Campaign and Public Landing Page Route</Text>
          </XStack>

          <XStack gap="$3" justifyContent="flex-end" marginTop="$4">
            <Button chromeless onPress={() => { setIsAdding(false); resetForm() }}>
              <Text color={colors.gray[600]}>Cancel</Text>
            </Button>
            <Button backgroundColor={colors.green[600]} onPress={handleCreate} disabled={submitting}>
              <Text color="white" fontWeight="600">{submitting ? 'Creating...' : 'Create Promotion'}</Text>
            </Button>
          </XStack>
        </YStack>
      )}

      {/* TABLE */}
      <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} overflow="hidden">
        <XStack backgroundColor={colors.gray[50]} padding="$3" borderBottomWidth={1} borderColor={colors.gray[200]}>
          <Text flex={2} fontWeight="600" color={colors.gray[600]} fontSize={14}>Promotion</Text>
          <Text flex={2} fontWeight="600" color={colors.gray[600]} fontSize={14}>Offers</Text>
          <Text flex={1} fontWeight="600" color={colors.gray[600]} fontSize={14}>Enrollment</Text>
          <Text width={60} fontWeight="600" color={colors.gray[600]} fontSize={14} textAlign="right">Actions</Text>
        </XStack>
        
        {loading ? (
          <YStack padding="$6" alignItems="center"><Spinner size="large" color={colors.green[600]} /></YStack>
        ) : promotions.length === 0 ? (
          <YStack padding="$6" alignItems="center">
            <Text color={colors.gray[500]}>No promotions found.</Text>
          </YStack>
        ) : (
          <ScrollView>
            {promotions.map((promo, idx) => (
              <YStack key={promo.id}>
                {idx > 0 && <Separator />}
                <XStack padding="$3" paddingVertical="$4" alignItems="center" hoverStyle={{ backgroundColor: colors.gray[50] }}>
                  <YStack flex={2} paddingRight="$2">
                    <Text fontWeight="600" color={colors.gray[900]}>{promo.name}</Text>
                    <Text fontSize={12} color={colors.gray[500]}>Ends: {new Date(promo.enrollment_deadline).toLocaleString()}</Text>
                  </YStack>
                  <YStack flex={2} gap="$1">
                    {promo.giveaway && (
                      <XStack backgroundColor={colors.pink[50]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignSelf="flex-start" alignItems="center" gap="$2">
                        <Gift size={14} color={colors.pink[700]} />
                        <Text fontSize={12} fontWeight="600" color={colors.pink[800]}>Giveaway</Text>
                      </XStack>
                    )}
                    {promo.credits && (
                      <XStack backgroundColor={colors.green[50]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignSelf="flex-start" alignItems="center" gap="$2">
                        <CreditCard size={14} color={colors.green[700]} />
                        <Text fontSize={12} fontWeight="600" color={colors.green[800]}>${promo.credits.amount_usd} {promo.credits.frequency}</Text>
                      </XStack>
                    )}
                  </YStack>
                  <YStack flex={1}>
                    <Text fontSize={14} fontWeight="600" color={promo.current_enrollees >= promo.max_enrollees ? colors.red[600] : colors.gray[800]}>
                      {promo.current_enrollees} / {promo.max_enrollees}
                    </Text>
                  </YStack>
                  <XStack width={60} justifyContent="flex-end">
                    <Button size="$2" circular icon={<Trash2 size={16} color={colors.red[500]} />} chromeless onPress={() => handleDelete(promo.id)} />
                  </XStack>
                </XStack>
              </YStack>
            ))}
          </ScrollView>
        )}
      </YStack>
    </YStack>
  )
}
