'use client'

import React, { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Card, Input, Label, Spinner, Switch } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, AlertTriangle, ChevronDown, ExternalLink } from '@tamagui/lucide-icons'
import { AdminDataGrid, ColumnDef } from '../../../../../packages/app/features/admin/components/AdminDataGrid'
import { useAdminQuery } from '../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminApi } from '../../../lib/adminApi'

const SCOPE_LABELS: Record<string, string> = {
  global: 'Global (all jurisdictions)',
  country: 'Country-wide',
  state: 'State-level',
  county: 'County-level',
  city: 'City-level',
}

export default function QuarantineZonesPage() {
  const { data, loading, next, prev, hasMore, hasPrev, page, refresh } = useAdminQuery({ 
    table: 'quarantine_zones',
    defaultSortParams: { column: 'created_at', ascending: false }
  })

  const { data: categories } = useAdminQuery({ table: 'sales_categories' })

  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Form State
  const [category, setCategory] = useState('')
  const [pestName, setPestName] = useState('')
  const [startsAt, setStartsAt] = useState(new Date().toISOString().split('T')[0])
  const [endsAt, setEndsAt] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [reason, setReason] = useState('')
  
  // Jurisdiction cascading state
  const [scope, setScope] = useState<'global' | 'country' | 'state' | 'county' | 'city'>('county')
  const [countries, setCountries] = useState<any[]>([])
  const [states, setStates] = useState<any[]>([])
  const [counties, setCounties] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])
  
  const [selectedCountry, setSelectedCountry] = useState('USA')
  const [selectedState, setSelectedState] = useState('')
  const [selectedCounty, setSelectedCounty] = useState('')
  const [selectedCity, setSelectedCity] = useState('')

  // Fetch countries on mount
  useEffect(() => {
    adminApi.select('countries', 'iso_3, name', undefined, { order: { column: 'name', ascending: true } }).then(({ data }) => {
      if (data) setCountries(data as any[])
    })
  }, [])

  // Fetch states when country changes
  useEffect(() => {
    if (selectedCountry) {
      adminApi.select('states', 'id, name, code', { eq: { country_iso_3: selectedCountry } }, { order: { column: 'name', ascending: true } }).then(({ data }) => {
        if (data) setStates(data as any[])
      })
    } else {
      setStates([])
    }
    setSelectedState('')
    setSelectedCounty('')
    setSelectedCity('')
  }, [selectedCountry])

  // Fetch counties when state changes
  useEffect(() => {
    if (selectedState) {
      adminApi.select('counties', 'id, name', { eq: { state_id: selectedState } }, { order: { column: 'name', ascending: true } }).then(({ data }) => {
        if (data) setCounties(data as any[])
      })
    } else {
      setCounties([])
    }
    setSelectedCounty('')
    setSelectedCity('')
  }, [selectedState])

  // Fetch cities when state changes
  useEffect(() => {
    if (selectedState) {
      adminApi.select('cities', 'id, name', { eq: { state_id: selectedState } }, { order: { column: 'name', ascending: true } }).then(({ data }) => {
        if (data) setCities(data as any[])
      })
    } else {
      setCities([])
    }
    setSelectedCity('')
  }, [selectedState])

  // Enrich data with state/county/city names
  const [enrichedData, setEnrichedData] = useState<any[]>([])
  
  useEffect(() => {
    if (!data || data.length === 0) {
      setEnrichedData([])
      return
    }
    
    const enrichRows = async () => {
      const stateIds = Array.from(new Set(data.filter((d: any) => d.state_id).map((d: any) => d.state_id)))
      const countyIds = Array.from(new Set(data.filter((d: any) => d.county_id).map((d: any) => d.county_id)))
      const cityIds = Array.from(new Set(data.filter((d: any) => d.city_id).map((d: any) => d.city_id)))
      
      const [statesRes, countiesRes, citiesRes] = await Promise.all([
        stateIds.length > 0 ? adminApi.select('states', 'id, name', { in: { id: stateIds } }) : { data: [] },
        countyIds.length > 0 ? adminApi.select('counties', 'id, name', { in: { id: countyIds } }) : { data: [] },
        cityIds.length > 0 ? adminApi.select('cities', 'id, name', { in: { id: cityIds } }) : { data: [] },
      ])
      
      const stateMap = Object.fromEntries((statesRes.data || []).map((s: any) => [s.id, s.name]))
      const countyMap = Object.fromEntries((countiesRes.data || []).map((c: any) => [c.id, c.name]))
      const cityMap = Object.fromEntries((citiesRes.data || []).map((c: any) => [c.id, c.name]))
      
      setEnrichedData(data.map((row: any) => ({
        ...row,
        state_name: stateMap[row.state_id] || null,
        county_name: countyMap[row.county_id] || null,
        city_name: cityMap[row.city_id] || null,
      })))
    }
    
    enrichRows()
  }, [data])

  const getStatusBadge = (item: any) => {
    const now = new Date()
    const start = new Date(item.starts_at)
    const end = item.ends_at ? new Date(item.ends_at) : null
    
    if (!item.is_active) {
      return { label: 'INACTIVE', color: colors.gray[600], bg: colors.gray[100] }
    }
    if (start > now) {
      return { label: 'UPCOMING', color: colors.blue[700], bg: colors.blue[100] }
    }
    if (end && end < now) {
      return { label: 'EXPIRED', color: colors.gray[600], bg: colors.gray[100] }
    }
    return { label: 'ACTIVE', color: colors.red[700], bg: colors.red[100] }
  }

  const getJurisdictionDisplay = (item: any) => {
    const parts: string[] = []
    if (item.country_iso_3) parts.push(item.country_iso_3)
    if (item.state_name) parts.push(item.state_name)
    if (item.county_name) parts.push(item.county_name + ' County')
    if (item.city_name) parts.push(item.city_name)
    if (parts.length === 0) return 'GLOBAL'
    return parts.join(' › ')
  }

  const columns: ColumnDef<any>[] = [
    {
      header: 'Status',
      accessorKey: 'is_active',
      width: 90,
      cell: (item) => {
        const { label, color, bg } = getStatusBadge(item)
        return (
          <XStack backgroundColor={bg} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignSelf="flex-start">
            <Text fontSize="$1" color={color} fontWeight="700">{label}</Text>
          </XStack>
        )
      }
    },
    {
      header: 'Pest / Disease',
      accessorKey: 'pest_name',
      flex: 1.5,
      cell: (item) => (
        <YStack>
          <Text fontWeight="600" fontSize="$3">{item.pest_name}</Text>
          {item.source_url ? (
            <a href={item.source_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <XStack alignItems="center" gap="$1" marginTop="$1">
                <ExternalLink size={12} color={'#3b82f6'} />
                <Text fontSize="$1" color={'#3b82f6'}>CDFA Notice</Text>
              </XStack>
            </a>
          ) : null}
        </YStack>
      )
    },
    {
      header: 'Category',
      accessorKey: 'category',
      width: 100,
      cell: (item) => (
        <XStack backgroundColor={item.category === 'ALL' ? colors.red[100] : "#ffedd5"} 
               paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignSelf="flex-start">
          <Text fontSize="$2" fontWeight="600" 
                color={item.category === 'ALL' ? colors.red[700] : "#c2410c"}>
            {item.category === 'ALL' ? '⛔ ALL' : item.category}
          </Text>
        </XStack>
      )
    },
    {
      header: 'Jurisdiction',
      accessorKey: 'county_id',
      flex: 2,
      cell: (item) => <Text fontSize="$2" color={colors.gray[700]}>{getJurisdictionDisplay(item)}</Text>
    },
    {
      header: 'Dates',
      accessorKey: 'starts_at',
      width: 140,
      cell: (item) => (
        <YStack>
          <Text fontSize="$2">{new Date(item.starts_at).toLocaleDateString()}</Text>
          <Text fontSize="$1" color={colors.gray[500]}>
            {item.ends_at ? `→ ${new Date(item.ends_at).toLocaleDateString()}` : '→ Indefinite'}
          </Text>
        </YStack>
      )
    },
    {
      header: 'Actions',
      accessorKey: 'id',
      width: 100,
      cell: (item) => (
        <XStack gap="$2">
          <Button size="$2" chromeless
            onPress={async () => {
              await adminApi.update('quarantine_zones', { is_active: !item.is_active }, { eq: { id: item.id } })
              refresh()
            }}
          >
            <Text fontSize="$1" color={item.is_active ? colors.gray[500] : colors.green[600]}>
              {item.is_active ? 'Disable' : 'Enable'}
            </Text>
          </Button>
          <Button size="$2" chromeless icon={<Trash2 size={14} color={colors.red[500]} />}
            onPress={async () => {
              const { error } = await adminApi.delete('quarantine_zones', { eq: { id: item.id } })
              if (error) setErrorMessage(`Failed to delete: ${error}`)
              else refresh()
            }} 
          />
        </XStack>
      )
    }
  ]

  const resetForm = () => {
    setCategory('')
    setPestName('')
    setStartsAt(new Date().toISOString().split('T')[0])
    setEndsAt('')
    setSourceUrl('')
    setReason('')
    setScope('county')
    setSelectedCountry('USA')
    setSelectedState('')
    setSelectedCounty('')
    setSelectedCity('')
    setErrorMessage('')
  }

  const handleCreate = async () => {
    if (!category) { setErrorMessage('Please select a category.'); return }
    if (!pestName) { setErrorMessage('Please enter the pest/disease name.'); return }

    setSubmitting(true)
    setErrorMessage('')
    try {
      const row: any = {
        category,
        pest_name: pestName,
        starts_at: startsAt,
        ends_at: endsAt || null,
        source_url: sourceUrl || null,
        reason: reason || null,
        is_active: true,
        country_iso_3: null,
        state_id: null,
        county_id: null,
        city_id: null,
      }

      if (scope !== 'global') {
        if (!selectedCountry) { setErrorMessage('Select a country.'); setSubmitting(false); return }
        row.country_iso_3 = selectedCountry
      }
      if (scope === 'state' || scope === 'county' || scope === 'city') {
        if (!selectedState) { setErrorMessage('Select a state.'); setSubmitting(false); return }
        row.state_id = selectedState
      }
      if (scope === 'county' || scope === 'city') {
        if (scope === 'county' && !selectedCounty) { setErrorMessage('Select a county.'); setSubmitting(false); return }
        if (selectedCounty) row.county_id = selectedCounty
      }
      if (scope === 'city') {
        if (!selectedCity) { setErrorMessage('Select a city.'); setSubmitting(false); return }
        row.city_id = selectedCity
      }

      const { error } = await adminApi.insert('quarantine_zones', row)
      if (error) throw new Error(error)
      
      setIsAdding(false)
      resetForm()
      refresh()
    } catch (e: any) {
      setErrorMessage(`Failed to create: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const JurisdictionSelect = ({ label, value, onChange, options, placeholder, disabled = false }: {
    label: string; value: string; onChange: (val: string) => void
    options: { value: string; label: string }[]; placeholder: string; disabled?: boolean
  }) => (
    <YStack gap="$1" flex={1}>
      <Label fontSize="$2" color={colors.gray[600]}>{label}</Label>
      <XStack borderWidth={1} borderColor={colors.gray[300]} borderRadius="$3"
              backgroundColor={disabled ? colors.gray[50] : 'white'} overflow="hidden">
        <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
          style={{ width: '100%', padding: '10px 12px', border: 'none', backgroundColor: 'transparent',
                   fontSize: 14, color: value ? '#1a1a1a' : '#9ca3af', cursor: disabled ? 'not-allowed' : 'pointer',
                   outline: 'none', appearance: 'none', WebkitAppearance: 'none' }}>
          <option value="">{placeholder}</option>
          {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <XStack position="absolute" right={12} top={0} bottom={0} alignItems="center" pointerEvents="none">
          <ChevronDown size={16} color={colors.gray[400]} />
        </XStack>
      </XStack>
    </YStack>
  )

  return (
    <YStack flex={1} padding="$4" gap="$4">
      <XStack justifyContent="space-between" alignItems="center">
        <YStack>
          <XStack alignItems="center" gap="$2">
            <AlertTriangle size={24} color={"#ea580c"} />
            <Text fontSize="$6" fontWeight="700" color={"#9a3412"}>Quarantine Zones</Text>
          </XStack>
          <Text fontSize="$3" color={colors.gray[600]}>
            Manage agricultural pest quarantines. Sellers in quarantined areas cannot list affected produce.
          </Text>
        </YStack>
        {!isAdding ? (
          <Button backgroundColor={"#ea580c"} icon={<AlertTriangle size={16} color="white" />}
                  onPress={() => { resetForm(); setIsAdding(true) }}>
            <Text color="white" fontWeight="600">Add Quarantine</Text>
          </Button>
        ) : null}
      </XStack>

      {errorMessage ? (
        <YStack backgroundColor={colors.red[50]} padding="$3" borderRadius="$2" 
                borderWidth={1} borderColor={colors.red[200]}>
          <Text color={colors.red[800]} fontWeight="600">{errorMessage}</Text>
        </YStack>
      ) : null}

      {isAdding ? (
        <Card borderWidth={1} borderColor={"#fed7aa"} padding="$4" backgroundColor="white" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" gap="$2" borderBottomWidth={1} borderColor={colors.gray[200]} paddingBottom="$3">
              <AlertTriangle size={20} color={"#c2410c"} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>New Quarantine Zone</Text>
            </XStack>

            <YStack gap="$3">
              {/* Pest Name */}
              <YStack gap="$1">
                <Label>Pest / Disease Name *</Label>
                <Input value={pestName} onChangeText={setPestName}
                       placeholder="e.g. Mexican Fruit Fly, Citrus Greening (HLB)" />
              </YStack>

              {/* Category Selection */}
              <YStack gap="$1">
                <Label>Quarantined Category *</Label>
                <XStack gap="$2" flexWrap="wrap">
                  <Button key="ALL" size="$2" 
                    backgroundColor={category === 'ALL' ? colors.red[100] : undefined}
                    borderWidth={category === 'ALL' ? 1 : 0} borderColor={colors.red[500]}
                    onPress={() => setCategory('ALL')}>
                    <Text fontWeight={category === 'ALL' ? '700' : '400'} color={category === 'ALL' ? colors.red[700] : undefined}>
                      ⛔ ALL Categories
                    </Text>
                  </Button>
                  {categories?.map((c: any) => (
                    <Button key={c.name} size="$2"
                      backgroundColor={category === c.name ? "#ffedd5" : undefined}
                      borderWidth={category === c.name ? 1 : 0} borderColor={"#f97316"}
                      onPress={() => setCategory(c.name)}>
                      <Text fontWeight={category === c.name ? '700' : '400'}>{c.name}</Text>
                    </Button>
                  ))}
                </XStack>
              </YStack>

              {/* Dates */}
              <XStack gap="$3">
                <YStack gap="$1" flex={1}>
                  <Label>Start Date *</Label>
                  <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${colors.gray[300]}`,
                             fontSize: 14, outline: 'none' }} />
                </YStack>
                <YStack gap="$1" flex={1}>
                  <Label>End Date (leave empty = indefinite)</Label>
                  <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${colors.gray[300]}`,
                             fontSize: 14, outline: 'none' }} />
                </YStack>
              </XStack>

              {/* Jurisdiction Scope */}
              <Label>Affected Area</Label>
              <XStack gap="$2" flexWrap="wrap">
                {(['county', 'state', 'country'] as const).map((s) => (
                  <Button key={s} size="$3"
                    backgroundColor={scope === s ? "#ea580c" : 'white'}
                    borderWidth={1} borderColor={scope === s ? "#ea580c" : colors.gray[300]}
                    onPress={() => setScope(s)} borderRadius="$6">
                    <Text color={scope === s ? 'white' : colors.gray[700]}
                          fontWeight={scope === s ? '700' : '400'} fontSize="$3">
                      {SCOPE_LABELS[s]}
                    </Text>
                  </Button>
                ))}
              </XStack>

              {/* Cascading Dropdowns */}
              {scope !== 'global' ? (
                <YStack gap="$3" marginTop="$2" padding="$3" backgroundColor={colors.gray[50]} borderRadius="$3">
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize="$3" color={colors.gray[500]}>Country:</Text>
                    <XStack backgroundColor={colors.blue[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2">
                      <Text fontSize="$3" fontWeight="600" color={colors.blue[700]}>United States (USA)</Text>
                    </XStack>
                  </XStack>
                  <XStack gap="$3" flexWrap="wrap">
                    {(scope === 'state' || scope === 'county' || scope === 'city') ? (
                      <JurisdictionSelect label="State" value={selectedState} onChange={setSelectedState}
                        options={states.map((s: any) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
                        placeholder="Select state..." disabled={!selectedCountry} />
                    ) : null}
                    {(scope === 'county' || scope === 'city') ? (
                      <JurisdictionSelect label="County" value={selectedCounty} onChange={setSelectedCounty}
                        options={counties.map((c: any) => ({ value: c.id, label: c.name }))}
                        placeholder={counties.length === 0 ? 'Select state first' : 'Select county...'}
                        disabled={!selectedState || counties.length === 0} />
                    ) : null}
                    {scope === 'city' ? (
                      <JurisdictionSelect label="City" value={selectedCity} onChange={setSelectedCity}
                        options={cities.map((c: any) => ({ value: c.id, label: c.name }))}
                        placeholder={cities.length === 0 ? 'Select state first' : 'Select city...'}
                        disabled={!selectedState || cities.length === 0} />
                    ) : null}
                  </XStack>
                </YStack>
              ) : null}

              {/* Source URL */}
              <YStack gap="$1">
                <Label>CDFA Source URL</Label>
                <Input value={sourceUrl} onChangeText={setSourceUrl}
                       placeholder="https://www.cdfa.ca.gov/plant/..." />
              </YStack>

              {/* Reason */}
              <YStack gap="$1">
                <Label>Internal Notes / Reason</Label>
                <Input value={reason} onChangeText={setReason}
                       placeholder="e.g. CDFA quarantine expanded March 2026" />
              </YStack>

              <XStack gap="$3" justifyContent="flex-end" marginTop="$4">
                <Button chromeless onPress={() => { setIsAdding(false); resetForm() }}>Cancel</Button>
                <Button backgroundColor={"#ea580c"} onPress={handleCreate} disabled={submitting}>
                  <Text color="white" fontWeight="600">{submitting ? 'Saving...' : 'Enforce Quarantine'}</Text>
                </Button>
              </XStack>
            </YStack>
          </YStack>
        </Card>
      ) : null}

      <YStack flex={1} paddingBottom="$8">
        <AdminDataGrid 
          data={enrichedData.length > 0 ? enrichedData : data} 
          columns={columns} 
          isLoading={loading}
          page={page}
          hasMore={hasMore}
          hasPrev={hasPrev}
          onNextPage={next}
          onPrevPage={prev}
          emptyMessage="No quarantine zones are currently defined. Add one to restrict produce listings in affected areas."
        />
      </YStack>
    </YStack>
  )
}
