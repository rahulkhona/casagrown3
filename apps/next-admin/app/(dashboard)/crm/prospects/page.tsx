'use client'

import React, { useState } from 'react'
import { YStack, XStack, Text, Input, Button, Spinner } from 'tamagui'
import { createClient } from '../../../../lib/supabase'
import { geocodeAddress } from '../../../../lib/geocode'

async function addFarmToLeads(farm: any): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('crm_leads').insert({
    name: farm.listing_name || 'Unknown Farm',
    email: farm.contact_email || null,
    phone: farm.contact_phone || null,
    source_platform: 'usda',
    notes: [
      farm.listing_desc,
      farm.media_website ? `Website: ${farm.media_website}` : null,
    ].filter(Boolean).join('\n') || null,
    metadata: {
      lead_type: 'farmer',
      usda_directory: farm._directory,
      location: [farm.location_city, farm.location_state, farm.location_zipcode].filter(Boolean).join(', '),
      listing_name: farm.listing_name,
    },
    zipcode: farm.location_zipcode || null,
    status: 'new',
  })
  if (error) throw new Error(error.message)
}

function FarmCard({ farm }: { farm: any }) {
  const isCSA = farm._directory === 'csa'
  const location = [farm.location_city, farm.location_state, farm.location_zipcode].filter(Boolean).join(', ')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const handleAdd = async () => {
    setSaving(true); setSaveError('')
    try {
      await addFarmToLeads(farm)
      setSaved(true)
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{farm.listing_name}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'white', borderRadius: 999, padding: '2px 10px',
              background: isCSA ? '#16a34a' : '#15803d'
            }}>
              {isCSA ? 'CSA' : 'On-Farm Market'}
            </span>
          </div>
          {location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280', fontSize: 13 }}>
              <MapPin size={13} color="#9ca3af" />
              <span>{location}</span>
            </div>
          )}
        </div>
        {farm.media_website && (
          <a
            href={farm.media_website.startsWith('http') ? farm.media_website : `https://${farm.media_website}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <ExternalLink size={13} />
            Website
          </a>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', background: '#f9fafb', borderTop: '1px solid #f3f4f6' }}>
        {farm.listing_desc && (
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>{farm.listing_desc}</p>
        )}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
          {farm.contact_name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151' }}>
              <Leaf size={13} color="#16a34a" />
              {farm.contact_name}
            </div>
          )}
          {farm.contact_email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#2563eb' }}>
              <Mail size={13} color="#2563eb" />
              <a href={`mailto:${farm.contact_email}`} style={{ color: 'inherit' }}>{farm.contact_email}</a>
            </div>
          )}
          {farm.contact_phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151' }}>
              <Phone size={13} color="#6b7280" />
              {farm.contact_phone}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
          {saveError && <span style={{ fontSize: 12, color: '#dc2626' }}>{saveError}</span>}
          {saved
            ? <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✓ Added to CRM</span>
            : <button
                onClick={handleAdd}
                disabled={saving}
                style={{
                  padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: saving ? '#86efac' : '#16a34a', color: 'white', border: 'none', cursor: saving ? 'default' : 'pointer'
                }}
              >
                {saving ? 'Adding…' : 'Add to CRM Leads'}
              </button>
          }
        </div>
      </div>
    </div>
  )
}
function MarketManagerCard({ market }: { market: any }) {
  const location = [market.location_city, market.location_state, market.location_zipcode].filter(Boolean).join(', ')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const pitchSubject = encodeURIComponent(`Partnership opportunity: CasaGrown online marketplace for your vendors`)
  const pitchBody = encodeURIComponent(
    `Hi,\n\nI'm reaching out from CasaGrown, a hyperlocal marketplace that connects backyard growers and small farms with buyers in their community.\n\nWe'd love to partner with ${market.listing_name || 'your farmers market'} to help your vendors sell online between market days — expanding their reach without replacing the in-person experience.\n\nWould you be open to a quick call to explore this?\n\nBest,\nCasaGrown Team`
  )
  const mailtoHref = market.contact_email
    ? `mailto:${market.contact_email}?subject=${pitchSubject}&body=${pitchBody}`
    : null

  const handleAddToLeads = async () => {
    setSaving(true); setSaveError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.from('crm_leads').insert({
        name: market.listing_name || 'Farmers Market Manager',
        email: market.contact_email || null,
        phone: market.contact_phone || null,
        source_platform: 'usda',
        notes: market.media_website ? `Website: ${market.media_website}` : null,
        metadata: {
          lead_type: 'market_manager',
          usda_directory: 'farmersmarket',
          location,
          listing_name: market.listing_name,
        },
        zipcode: market.location_zipcode || null,
        status: 'new',
      })
      if (error) throw new Error(error.message)
      setSaved(true)
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ border: '1px solid #dbeafe', borderRadius: 12, overflow: 'hidden', background: '#f0f9ff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#1e3a5f' }}>{market.listing_name}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'white', borderRadius: 999, padding: '2px 10px', background: '#2563eb' }}>
              Farmers Market
            </span>
          </div>
          {location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280', fontSize: 13 }}>
              <MapPin size={13} color="#9ca3af" />
              <span>{location}</span>
            </div>
          )}
        </div>
        {market.media_website && (
          <a
            href={market.media_website.startsWith('http') ? market.media_website : `https://${market.media_website}`}
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <ExternalLink size={13} />
            Website
          </a>
        )}
      </div>
      <div style={{ padding: '10px 20px 14px', background: '#e0f2fe', borderTop: '1px solid #bae6fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {market.contact_email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#1d4ed8' }}>
              <Mail size={13} color="#2563eb" />
              <span>{market.contact_email}</span>
            </div>
          )}
          {market.contact_phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151' }}>
              <Phone size={13} color="#6b7280" />
              {market.contact_phone}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveError && <span style={{ fontSize: 12, color: '#dc2626' }}>{saveError}</span>}
          {saved
            ? <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✓ Added to CRM</span>
            : <button onClick={handleAddToLeads} disabled={saving} style={{ padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: saving ? '#93c5fd' : '#2563eb', color: 'white', border: 'none', cursor: saving ? 'default' : 'pointer' }}>
                {saving ? 'Adding…' : 'Add to CRM'}
              </button>
          }
          {mailtoHref
            ? <a href={mailtoHref} style={{ padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#1d4ed8', color: 'white', textDecoration: 'none' }}>
                ✉ Contact Manager
              </a>
            : market.media_website && (
              <a href={market.media_website.startsWith('http') ? market.media_website : `https://${market.media_website}`} target="_blank" rel="noopener noreferrer"
                style={{ padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#1d4ed8', color: 'white', textDecoration: 'none' }}>
                Visit Website
              </a>
            )
          }
        </div>
      </div>
    </div>
  )
}


export default function ExternalLeadsPage() {
  const [source, setSource] = useState<'usda' | 'ofn'>('usda')
  const [zipcode, setZipcode] = useState('')
  const [radius, setRadius] = useState('25')
  const [loading, setLoading] = useState(false)
  const [onfarmProspects, setOnfarmProspects] = useState<any[]>([])
  const [csaProspects, setCsaProspects] = useState<any[]>([])
  const [marketProspects, setMarketProspects] = useState<any[]>([])
  const [ofnProspects, setOfnProspects] = useState<any[]>([])
  const [error, setError] = useState('')

  const handleSearch = async () => {
    if (!zipcode.trim()) return
    setLoading(true)
    setError('')
    setOfnProspects([])
    setOnfarmProspects([])
    setCsaProspects([])
    setMarketProspects([])

    try {
      const supabase = createClient()
      const radNum = parseInt(radius) || 25
      
      if (source === 'usda') {
        const { data, error: funcError } = await supabase.functions.invoke('usda-farmers-markets', {
          body: { zipcode, radius: radNum }
        })
        if (funcError) throw new Error(funcError.message)
        setOnfarmProspects(data?.onfarm || [])
        setCsaProspects(data?.csas || [])
        setMarketProspects(data?.data || [])
      } else {
        // Geocode locally before passing to OFN edge function
        const geo = await geocodeAddress(zipcode)
        if (!geo) throw new Error('Could not find location for that zip code.')
        const { data, error: funcError } = await supabase.functions.invoke('crm-ofn-prospects', {
          body: { lat: geo.lat, lng: geo.lng, radius: radNum, zipcode }
        })
        if (funcError) throw new Error(funcError.message)
        setOfnProspects(data?.data || [])
      }
    } catch (e: any) {
      setError(e.message || 'Failed to search prospects')
    } finally {
      setLoading(false)
    }
  }

  const allUsdaProspects = [...onfarmProspects, ...csaProspects]

  return (
    <YStack flex={1} gap="$4">
      <YStack>
        <Text fontSize="$6" fontWeight="bold">External Network Prospects</Text>
        <Text color="$gray10">Find registered farms, markets, and CSAs to onboard to CasaGrown.</Text>
      </YStack>

      <XStack gap="$2" marginBottom="$2">
        <Button size="$3" theme={source === 'usda' ? 'active' : 'alt1'} onPress={() => setSource('usda')}>USDA Directory</Button>
        <Button size="$3" theme={source === 'ofn' ? 'active' : 'alt1'} onPress={() => setSource('ofn')}>Open Food Network</Button>
      </XStack>

      {/* Search form — plain div avoids Card web issues */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <XStack gap="$3" alignItems="flex-end">
          <YStack flex={1}>
            <Text fontSize="$3" fontWeight="600" marginBottom="$2">Zip Code</Text>
            <Input
              value={zipcode}
              onChange={(e: any) => setZipcode(e.target.value)}
              onKeyPress={(e: any) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g. 95120"
            />
          </YStack>
          <YStack flex={1}>
            <Text fontSize="$3" fontWeight="600" marginBottom="$2">Radius (miles)</Text>
            <Input
              value={radius}
              onChange={(e: any) => setRadius(e.target.value)}
              placeholder="25"
            />
          </YStack>
          <Button
            icon={loading ? () => <Spinner color="white" /> : Search}
            theme="active"
            onPress={handleSearch}
            disabled={loading || !zipcode.trim()}
          >
            Find Farms
          </Button>
        </XStack>
        {error && <Text color="$red10" marginTop="$3">{error}</Text>}
      </div>

      {!loading && (onfarmProspects.length > 0 || marketProspects.length > 0) && (
        <Text fontSize="$3" color="$gray10">
          Found {onfarmProspects.length} on-farm market{onfarmProspects.length !== 1 ? 's' : ''},{' '}
          {csaProspects.length} CSA{csaProspects.length !== 1 ? 's' : ''} and{' '}
          {marketProspects.length} farmers market{marketProspects.length !== 1 ? 's' : ''} within {radius} miles
        </Text>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 32 }}>
        {allUsdaProspects.length === 0 && marketProspects.length === 0 && ofnProspects.length === 0 && !loading && !error && (
          <Text color="$gray9" textAlign="center" marginTop="$8">
            Enter a zipcode to find nearby local farms and CSAs.
          </Text>
        )}
        
        {source === 'usda' && allUsdaProspects.map((farm, i) => (
          <FarmCard key={`usda-${i}`} farm={farm} />
        ))}
        
        {source === 'ofn' && ofnProspects.map((farm, i) => (
          <FarmCard key={`ofn-${i}`} farm={{
            listing_name: farm.name,
            contact_email: farm.contact_email,
            contact_phone: farm.contact_phone,
            media_website: farm.website,
            listing_desc: farm.description,
            location_city: farm.city,
            location_state: farm.state,
            location_zipcode: farm.zipcode,
            _directory: 'openfoodnetwork',
            distance: farm.distance_miles
          }} />
        ))}

        {/* Farmers Markets section */}
        {marketProspects.length > 0 && (
          <>
            <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: 16, marginTop: 8 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 15, color: '#111827' }}>🏪 Farmers Markets</p>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6b7280' }}>
                Contact market managers to reach their vendors — pitch CasaGrown as an online channel between market days.
              </p>
            </div>
            {marketProspects.map((market, i) => (
              <MarketManagerCard key={i} market={market} />
            ))}
          </>
        )}
      </div>
    </YStack>
  )
}
