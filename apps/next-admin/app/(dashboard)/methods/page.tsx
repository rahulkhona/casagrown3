'use client'

import React, { useEffect, useState } from 'react'
import { YStack, XStack, Text, Button, ScrollView, Separator, Checkbox, Spinner } from 'tamagui'
import { RefreshCw, Check } from '@tamagui/lucide-icons'
import { supabase } from '@casagrown/app/features/auth/auth-hook'
import { adminSupabase } from '../../../lib/adminSupabase'
import { colors } from '@casagrown/app/design-tokens'

const METHOD_LABELS: Record<string, { label: string; description: string }> = {
  giftcards: { label: 'Gift Cards', description: 'Redeem points for gift cards via multiple providers' },
  cashout: { label: 'Cash Out', description: 'PayPal payouts to user accounts' },
  charity: { label: 'Charity Donations', description: 'Donate points to GlobalGiving projects' },
  '529c': { label: '529c Education', description: 'Contribute to 529c education savings plans' },
}

const INSTRUMENT_LABELS: Record<string, string> = {
  tremendous: 'Tremendous',
  reloadly: 'Reloadly',
  paypal: 'PayPal',
  globalgiving: 'GlobalGiving',
}

type InstrumentData = {
  instrument: string
  is_active: boolean
  is_queuing: boolean
}

type MethodData = {
  method: string
  is_active: boolean
  instruments: InstrumentData[]
}

export default function MethodsPage() {
  const [methodsData, setMethodsData] = useState<MethodData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMethods = async () => {
    setLoading(true)
    
    const { data: methods } = await supabase
      .from('available_redemption_methods')
      .select('*')
      .order('method')
      
    const { data: instruments } = await supabase
      .from('available_redemption_method_instruments')
      .select('*')
      
    const { data: queues } = await supabase
      .from('instrument_queuing_status')
      .select('*')

    if (methods && instruments) {
      const formatted = methods.map((m: any) => {
        const matchingInstruments = instruments
          .filter((i: any) => i.method === m.method)
          .map((i: any) => {
            const queueStat = queues?.find((q: any) => q.instrument === i.instrument)
            return {
              instrument: i.instrument,
              is_active: i.is_active,
              is_queuing: queueStat?.is_queuing ?? false
            }
          })
          
        return {
          method: m.method,
          is_active: m.is_active,
          instruments: matchingInstruments
        }
      })
      setMethodsData(formatted)
    }
    setLoading(false)
  }

  useEffect(() => { fetchMethods() }, [])

  const toggleMethod = async (methodName: string, currentStatus: boolean) => {
    setMethodsData(prev => prev.map(m => 
      m.method === methodName ? { ...m, is_active: !currentStatus } : m
    ))
    
    const { error } = await adminSupabase
      .from('available_redemption_methods')
      .update({ is_active: !currentStatus })
      .eq('method', methodName)
      
    if (error) {
      console.error('Failed to update method:', error)
      setMethodsData(prev => prev.map(m => 
        m.method === methodName ? { ...m, is_active: currentStatus } : m
      ))
    }
  }

  const toggleInstrument = async (methodName: string, instrumentName: string, currentStatus: boolean, field: 'is_active' | 'is_queuing') => {
    setMethodsData(prev => prev.map(m => {
      if (m.method !== methodName) return m
      return {
        ...m,
        instruments: m.instruments.map(i => 
          i.instrument === instrumentName ? { ...i, [field]: !currentStatus } : i
        )
      }
    }))
    
    const table = field === 'is_active' ? 'available_redemption_method_instruments' : 'instrument_queuing_status'
    
    const { error } = await adminSupabase
      .from(table)
      .update({ [field]: !currentStatus })
      .eq('instrument', instrumentName)
      
    if (error) {
      console.error(`Failed to update ${field}:`, error)
      fetchMethods()
    }
  }

  const hasMultipleProviders = (method: MethodData) => method.instruments.length > 1

  return (
    <YStack flex={1} padding="$6" gap="$5" maxWidth={1000}>
      <XStack justifyContent="space-between" alignItems="center">
        <YStack>
          <Text fontSize="$8" fontWeight="bold" color={colors.green[900]}>Redemption Methods</Text>
          <Text color={colors.gray[600]}>Manage active cashout methods and provider-level controls.</Text>
        </YStack>
        <Button icon={RefreshCw} backgroundColor={colors.green[600]} onPress={fetchMethods} disabled={loading}>
          <Text color="white">Refresh</Text>
        </Button>
      </XStack>

      {loading ? (
        <YStack padding="$6" alignItems="center"><Spinner size="large" color={colors.green[600]} /></YStack>
      ) : (
        <YStack gap="$4">
          {methodsData.map((method) => {
            const info = METHOD_LABELS[method.method] || { label: method.method, description: '' }
            const multiProvider = hasMultipleProviders(method)

            return (
              <YStack 
                key={method.method} 
                data-testid={`method-card-${method.method}`}
                backgroundColor="white" 
                borderRadius="$4" 
                borderWidth={1} 
                borderColor={colors.gray[200]} 
                overflow="hidden"
              >
                {/* Method Header */}
                <XStack 
                  padding="$4" 
                  alignItems="center" 
                  backgroundColor={colors.gray[50]} 
                  borderBottomWidth={multiProvider ? 1 : 0} 
                  borderColor={colors.gray[200]}
                >
                  <YStack flex={1}>
                    <Text fontWeight="bold" fontSize="$5" color={colors.gray[900]}>
                      {info.label}
                    </Text>
                    <Text fontSize={13} color={colors.gray[500]}>{info.description}</Text>
                  </YStack>
                  <XStack alignItems="center" gap="$3">
                    <Text fontSize={13} fontWeight="600" color={method.is_active ? colors.green[700] : colors.gray[400]}>
                      {method.is_active ? 'Active' : 'Disabled'}
                    </Text>
                    <Checkbox 
                      size="$4" 
                      checked={method.is_active} 
                      onCheckedChange={() => toggleMethod(method.method, method.is_active)} 
                      borderColor={colors.gray[300]} 
                      backgroundColor={method.is_active ? colors.green[50] : 'white'}
                      data-testid={`method-active-${method.method}`}
                    >
                      <Checkbox.Indicator>
                        <Check size={16} color={colors.green[700]} />
                      </Checkbox.Indicator>
                    </Checkbox>
                  </XStack>
                </XStack>

                {/* Provider-level controls — only for multi-provider methods (gift cards) */}
                {multiProvider && (
                  <YStack>
                    {/* Sub-header */}
                    <XStack paddingHorizontal="$5" paddingVertical="$2" borderBottomWidth={1} borderColor={colors.gray[100]}>
                      <Text flex={1} fontSize={12} fontWeight="600" color={colors.gray[400]} textTransform="uppercase">Provider</Text>
                      <Text width={100} fontSize={12} fontWeight="600" color={colors.gray[400]} textTransform="uppercase" textAlign="center">Active</Text>
                      <Text width={130} fontSize={12} fontWeight="600" color={colors.gray[400]} textTransform="uppercase" textAlign="center">Queue Redemptions</Text>
                    </XStack>

                    {method.instruments.map((inst, idx) => (
                      <XStack 
                        key={inst.instrument} 
                        paddingHorizontal="$5" 
                        paddingVertical="$3" 
                        alignItems="center"
                        borderBottomWidth={idx < method.instruments.length - 1 ? 1 : 0}
                        borderColor={colors.gray[100]}
                        hoverStyle={{ backgroundColor: colors.gray[50] }}
                      >
                        <YStack flex={1}>
                          <Text fontWeight="600" color={colors.gray[800]}>
                            {INSTRUMENT_LABELS[inst.instrument] || inst.instrument}
                          </Text>
                        </YStack>
                        <XStack width={100} justifyContent="center">
                          <Checkbox 
                            size="$3" 
                            checked={inst.is_active} 
                            onCheckedChange={() => toggleInstrument(method.method, inst.instrument, inst.is_active, 'is_active')} 
                            borderColor={colors.gray[300]} 
                            backgroundColor={inst.is_active ? colors.green[50] : 'white'}
                            data-testid={`instrument-active-${inst.instrument}`}
                          >
                            <Checkbox.Indicator>
                              <Check size={14} color={colors.green[700]} />
                            </Checkbox.Indicator>
                          </Checkbox>
                        </XStack>
                        <XStack width={130} justifyContent="center">
                          <Checkbox 
                            size="$3" 
                            checked={inst.is_queuing} 
                            onCheckedChange={() => toggleInstrument(method.method, inst.instrument, inst.is_queuing, 'is_queuing')} 
                            borderColor={colors.gray[300]} 
                            backgroundColor={inst.is_queuing ? '#fff7ed' : 'white'}
                            data-testid={`instrument-queue-${inst.instrument}`}
                          >
                            <Checkbox.Indicator>
                              <Check size={14} color="#ea580c" />
                            </Checkbox.Indicator>
                          </Checkbox>
                        </XStack>
                      </XStack>
                    ))}
                  </YStack>
                )}

                {/* Single-provider — show provider name + queue toggle inline */}
                {!multiProvider && method.instruments.length === 1 && (
                  <XStack paddingHorizontal="$4" paddingVertical="$3" alignItems="center" justifyContent="space-between">
                    <Text fontSize={13} color={colors.gray[400]}>
                      Provider: {INSTRUMENT_LABELS[method.instruments[0]!.instrument] || method.instruments[0]!.instrument}
                    </Text>
                    <XStack alignItems="center" gap="$2">
                      <Text fontSize={12} fontWeight="600" color={method.instruments[0]!.is_queuing ? '#ea580c' : colors.gray[400]}>
                        {method.instruments[0]!.is_queuing ? 'Queuing ON' : 'Queue Redemptions'}
                      </Text>
                      <Checkbox 
                        size="$3" 
                        checked={method.instruments[0]!.is_queuing} 
                        onCheckedChange={() => toggleInstrument(method.method, method.instruments[0]!.instrument, method.instruments[0]!.is_queuing, 'is_queuing')} 
                        borderColor={colors.gray[300]} 
                        backgroundColor={method.instruments[0]!.is_queuing ? '#fff7ed' : 'white'}
                        data-testid={`instrument-queue-${method.instruments[0]!.instrument}`}
                      >
                        <Checkbox.Indicator>
                          <Check size={14} color="#ea580c" />
                        </Checkbox.Indicator>
                      </Checkbox>
                    </XStack>
                  </XStack>
                )}
              </YStack>
            )
          })}
        </YStack>
      )}

      <YStack backgroundColor="#fffedd" padding="$4" borderRadius="$4" borderWidth={1} borderColor="#fdb528">
        <Text fontWeight="bold" color="#ea580c">About Queue Redemptions</Text>
        <Text fontSize={13} color="#9a3412" marginTop="$2">
          For gift card providers, you can individually control each provider and enable queuing if its API is down. New user redemptions will still be accepted (points debited), but placed in a delayed queue. A cron job retries queued items and auto-clears the queue once the provider recovers.
        </Text>
        <Text fontSize={13} color="#9a3412" marginTop="$1">
          For single-provider methods (Cash Out, Charity), simply toggle the method on/off.
        </Text>
      </YStack>
    </YStack>
  )
}
