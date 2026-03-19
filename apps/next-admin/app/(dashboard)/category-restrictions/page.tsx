'use client'

import React, { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Card, Input, Label, Spinner } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Plus, Trash2, Ban, ChevronDown } from '@tamagui/lucide-icons'
import { AdminDataGrid, ColumnDef } from '../../../../../packages/app/features/admin/components/AdminDataGrid'
import { useAdminQuery } from '../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminApi } from '../../../lib/adminApi'

// Jurisdiction level labels
const SCOPE_LABELS: Record<string, string> = {
  global: 'Global (all jurisdictions)',
  country: 'Country-wide',
  state: 'State-level',
  county: 'County-level',
  city: 'City-level',
}

export default function CategoryRestrictionsPage() {
  const { data, loading, next, prev, hasMore, hasPrev, page, refresh } = useAdminQuery({ 
    table: 'category_restrictions',
    defaultSortParams: { column: 'created_at', ascending: false }
  })

  // We need categories for the dropdown
  const { data: categories } = useAdminQuery({ table: 'sales_categories' })

  const [isAdding, setIsAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Form State
  const [categoryName, setCategoryName] = useState('')
  const [reason, setReason] = useState('')
  
  // Jurisdiction cascading state
  const [scope, setScope] = useState<'global' | 'country' | 'state' | 'county' | 'city'>('country')
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

  // Fetch cities when state changes (cities may be linked to state, not county)
  useEffect(() => {
    if (selectedState) {
      let q = adminApi.select('cities', 'id, name', { eq: { state_id: selectedState } }, { order: { column: 'name', ascending: true } })
      q.then(({ data }) => {
        if (data) setCities(data as any[])
      })
    } else {
      setCities([])
    }
    setSelectedCity('')
  }, [selectedState])

  // Resolve scope display label for a restriction row
  const getScopeDisplay = (item: any) => {
    if (!item.country_iso_3 && !item.state_id && !item.county_id && !item.city_id) {
      return { label: 'GLOBAL', color: colors.red[800], bg: colors.red[100] }
    }
    // Build jurisdiction hierarchy string
    const parts: string[] = []
    if (item.country_iso_3) parts.push(item.country_iso_3)
    if (item.state_name) parts.push(item.state_name)
    else if (item.state_id) parts.push('State')
    if (item.county_name) parts.push(item.county_name)
    if (item.city_name) parts.push(item.city_name)
    
    return { 
      label: parts.length > 0 ? parts.join(' › ') : 'Regional', 
      color: colors.blue[700], 
      bg: colors.blue[100] 
    }
  }

  // Enrich data with state/county/city names for display
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

  const columns: ColumnDef<any>[] = [
    {
      header: 'Category',
      accessorKey: 'category_name',
      flex: 1,
      cell: (item) => <Text fontWeight="600">{item.category_name}</Text>
    },
    {
      header: 'Jurisdiction',
      accessorKey: 'country_iso_3',
      flex: 2,
      cell: (item) => {
        const { label, color, bg } = getScopeDisplay(item)
        return (
          <XStack backgroundColor={bg} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignSelf="flex-start">
            <Text fontSize="$2" color={color} fontWeight="600">{label}</Text>
          </XStack>
        )
      }
    },
    {
      header: 'Reason',
      accessorKey: 'reason',
      flex: 2,
    },
    {
      header: 'Actions',
      accessorKey: 'id',
      width: 80,
      cell: (item) => (
        <Button 
          size="$2" 
          chromeless 
          icon={<Trash2 size={16} color={colors.red[500]} />} 
          onPress={async () => {
            const { error } = await adminApi.delete('category_restrictions', { eq: { id: item.id } })
            if (error) {
              setErrorMessage(`Failed to delete: ${error}`)
            } else {
              refresh()
            }
          }} 
        />
      )
    }
  ]

  const resetForm = () => {
    setCategoryName('')
    setReason('')
    setScope('country')
    setSelectedCountry('USA')
    setSelectedState('')
    setSelectedCounty('')
    setSelectedCity('')
    setErrorMessage('')
  }

  const handleCreate = async () => {
    if (!categoryName) {
      setErrorMessage('Please select or enter a category name.')
      return
    }

    setSubmitting(true)
    setErrorMessage('')
    try {
      const row: any = {
        category_name: categoryName,
        reason: reason || null,
        country_iso_3: null,
        state_id: null,
        county_id: null,
        city_id: null,
      }

      // Set jurisdiction columns based on scope
      if (scope !== 'global') {
        if (!selectedCountry) {
          setErrorMessage('Please select a country.')
          setSubmitting(false)
          return
        }
        row.country_iso_3 = selectedCountry
      }
      if (scope === 'state' || scope === 'county' || scope === 'city') {
        if (!selectedState) {
          setErrorMessage('Please select a state.')
          setSubmitting(false)
          return
        }
        row.state_id = selectedState
      }
      if (scope === 'county' || scope === 'city') {
        if (scope === 'county' && !selectedCounty) {
          setErrorMessage('Please select a county.')
          setSubmitting(false)
          return
        }
        if (selectedCounty) row.county_id = selectedCounty
      }
      if (scope === 'city') {
        if (!selectedCity) {
          setErrorMessage('Please select a city.')
          setSubmitting(false)
          return
        }
        row.city_id = selectedCity
      }

      const { error } = await adminApi.insert('category_restrictions', row)
      if (error) throw new Error(error)
      
      setIsAdding(false)
      resetForm()
      refresh()
    } catch (e: any) {
      setErrorMessage(`Failed to create restriction: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Styled Select-like component using native select for web
  const JurisdictionSelect = ({ 
    label, value, onChange, options, placeholder, disabled = false 
  }: {
    label: string
    value: string
    onChange: (val: string) => void
    options: { value: string; label: string }[]
    placeholder: string
    disabled?: boolean
  }) => (
    <YStack gap="$1" flex={1}>
      <Label fontSize="$2" color={colors.gray[600]}>{label}</Label>
      <XStack 
        borderWidth={1} 
        borderColor={colors.gray[300]} 
        borderRadius="$3" 
        backgroundColor={disabled ? colors.gray[50] : 'white'}
        overflow="hidden"
      >
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: 'none',
            backgroundColor: 'transparent',
            fontSize: 14,
            color: value ? '#1a1a1a' : '#9ca3af',
            cursor: disabled ? 'not-allowed' : 'pointer',
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
          }}
        >
          <option value="">{placeholder}</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
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
          <Text fontSize="$6" fontWeight="700" color={colors.red[800]}>Category Restrictions</Text>
          <Text fontSize="$3" color={colors.gray[600]}>Block product categories by jurisdiction (US market).</Text>
        </YStack>
        {!isAdding && (
          <Button 
            backgroundColor={colors.red[600]} 
            icon={<Ban size={16} color="white" />} 
            onPress={() => { resetForm(); setIsAdding(true) }}
          >
            <Text color="white" fontWeight="600">Add Restriction</Text>
          </Button>
        )}
      </XStack>

      {errorMessage ? (
        <YStack 
          backgroundColor={colors.red[50]} 
          padding="$3" 
          borderRadius="$2" 
          borderWidth={1} 
          borderColor={colors.red[200]}
        >
          <Text color={colors.red[800]} fontWeight="600">{errorMessage}</Text>
        </YStack>
      ) : null}

      {isAdding && (
        <Card borderWidth={1} borderColor={colors.gray[200]} padding="$4" backgroundColor="white" elevation="$1">
          <YStack gap="$4">
            <XStack alignItems="center" gap="$2" borderBottomWidth={1} borderColor={colors.gray[200]} paddingBottom="$3">
              <Ban size={20} color={colors.red[700]} />
              <Text fontSize="$5" fontWeight="600" color={colors.gray[800]}>Create New Restriction</Text>
            </XStack>

            <YStack gap="$3">
              {/* Category Selection */}
              <Label>Category to Block</Label>
              <Input 
                value={categoryName}
                onChangeText={setCategoryName}
                placeholder="Type exact category name (e.g. firearms, alcohol)"
              />
              {categories && categories.length > 0 && (
                <XStack gap="$2" flexWrap="wrap">
                  {categories.map((c: any) => (
                    <Button 
                      key={c.name} 
                      size="$2" 
                      backgroundColor={categoryName === c.name ? colors.green[100] : undefined}
                      borderWidth={categoryName === c.name ? 1 : 0}
                      borderColor={colors.green[500]}
                      onPress={() => setCategoryName(c.name)}
                    >
                      {c.name}
                    </Button>
                  ))}
                </XStack>
              )}

              {/* Reason */}
              <Label>Internal Reason / Note</Label>
              <Input 
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. Compliance with state law passed 2026."
              />

              {/* Jurisdiction Scope */}
              <Label>Restriction Scope</Label>
              <XStack gap="$2" flexWrap="wrap">
                {(['country', 'state', 'county', 'city'] as const).map((s) => (
                  <Button
                    key={s}
                    size="$3"
                    backgroundColor={scope === s ? colors.red[600] : 'white'}
                    borderWidth={1}
                    borderColor={scope === s ? colors.red[600] : colors.gray[300]}
                    onPress={() => setScope(s)}
                    borderRadius="$6"
                  >
                    <Text 
                      color={scope === s ? 'white' : colors.gray[700]}
                      fontWeight={scope === s ? '700' : '400'}
                      fontSize="$3"
                    >
                      {SCOPE_LABELS[s]}
                    </Text>
                  </Button>
                ))}
              </XStack>

              {/* Cascading Dropdowns */}
              {scope !== 'global' && (
                <YStack gap="$3" marginTop="$2" padding="$3" backgroundColor={colors.gray[50]} borderRadius="$3">
                  {/* Country is fixed to US for now */}
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize="$3" color={colors.gray[500]}>Country:</Text>
                    <XStack backgroundColor={colors.blue[100]} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2">
                      <Text fontSize="$3" fontWeight="600" color={colors.blue[700]}>United States (USA)</Text>
                    </XStack>
                  </XStack>
                  <XStack gap="$3" flexWrap="wrap">
                    
                    {(scope === 'state' || scope === 'county' || scope === 'city') && (
                      <JurisdictionSelect
                        label="State"
                        value={selectedState}
                        onChange={setSelectedState}
                        options={states.map((s: any) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
                        placeholder="Select state..."
                        disabled={!selectedCountry}
                      />
                    )}
                    
                    {(scope === 'county' || scope === 'city') && (
                      <JurisdictionSelect
                        label="County"
                        value={selectedCounty}
                        onChange={setSelectedCounty}
                        options={counties.map((c: any) => ({ value: c.id, label: c.name }))}
                        placeholder={counties.length === 0 ? 'No counties available' : 'Select county...'}
                        disabled={!selectedState || counties.length === 0}
                      />
                    )}
                    
                    {scope === 'city' && (
                      <JurisdictionSelect
                        label="City"
                        value={selectedCity}
                        onChange={setSelectedCity}
                        options={cities.map((c: any) => ({ value: c.id, label: c.name }))}
                        placeholder={cities.length === 0 ? 'No cities available' : 'Select city...'}
                        disabled={!selectedState || cities.length === 0}
                      />
                    )}
                  </XStack>
                </YStack>
              )}

              <XStack gap="$3" justifyContent="flex-end" marginTop="$4">
                <Button chromeless onPress={() => { setIsAdding(false); resetForm() }}>Cancel</Button>
                <Button backgroundColor={colors.red[600]} onPress={handleCreate} disabled={submitting}>
                  <Text color="white" fontWeight="600">{submitting ? 'Saving...' : 'Enforce Restriction'}</Text>
                </Button>
              </XStack>
            </YStack>

          </YStack>
        </Card>
      )}

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
          emptyMessage="No category restrictions are currently enforced."
        />
      </YStack>
    </YStack>
  )
}
