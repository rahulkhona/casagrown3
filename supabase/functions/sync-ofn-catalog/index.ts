import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const OFN_API_URL = 'https://openfoodnetwork.net/api/dfc'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('OFN_API_KEY')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
    // OFN uses X-Api-Token for user API tokens
    if (apiKey) headers['X-Api-Token'] = apiKey

    // 1. Fetch Enterprises
    const enterprisesRes = await fetch(`${OFN_API_URL}/enterprises`, { headers })
    if (!enterprisesRes.ok) {
      throw new Error(`Failed to fetch enterprises: ${enterprisesRes.statusText}`)
    }
    
    // OFN DFC API returns JSON-LD with @graph containing the enterprise objects
    const rawData = await enterprisesRes.json()
    const enterprisesList: any[] = rawData['@graph'] || rawData['hydra:member'] || rawData.data || (Array.isArray(rawData) ? rawData : [])
    
    let totalEnterprisesSynced = 0
    let totalProductsSynced = 0

    for (const ent of enterprisesList) {
      // Only process Enterprise nodes (skip address/social media nodes in the @graph)
      if (ent['@type'] && ent['@type'] !== 'dfc-b:Enterprise') continue

      const entId = ent['@id'] || ent.id
      if (!entId) continue
      
      const parsedId = entId.split('/').pop() // Get numeric ID from IRI
      
      const name = ent['dfc-b:name'] || ent.name || 'Unknown Enterprise'
      const description = ent['dfc-b:hasDescription'] || ent.description || null
      const contact_email = ent['dfc-b:email'] || ent.email || null
      const contact_phone = ent['dfc-b:hasPhoneNumber']?.['dfc-b:phoneNumber'] || ent.phone || null
      
      // Address is a URL reference in DFC — fetch it separately
      let lat = null
      let lng = null
      let address_text = null
      let city = null
      let state = null
      let zipcode = null
      
      const addressRef = ent['dfc-b:hasAddress']
      if (typeof addressRef === 'string' && addressRef.startsWith('http')) {
        try {
          const addrRes = await fetch(addressRef, { headers })
          if (addrRes.ok) {
            const addrData = await addrRes.json()
            const addr = addrData['@graph']?.[0] || addrData
            city = addr['dfc-b:hasCity'] || null
            zipcode = addr['dfc-b:hasPostalCode'] || null
            state = addr['dfc-b:hasCountryOfOrigin'] || null
            address_text = addr['dfc-b:hasStreet'] || null
          }
        } catch { /* ignore address fetch errors */ }
      } else if (typeof addressRef === 'object' && addressRef !== null) {
        city = addressRef['dfc-b:hasCity'] || null
        zipcode = addressRef['dfc-b:hasPostalCode'] || null
        address_text = addressRef['dfc-b:hasStreet'] || null
      }


      // Upsert Enterprise
      const { error: entError } = await supabase
        .from('ofn_enterprises')
        .upsert({
          id: parsedId,
          name,
          description,
          contact_email,
          contact_phone,
          address_text,
          city,
          state,
          zipcode,
          lat: lat ? parseFloat(lat) : null,
          lng: lng ? parseFloat(lng) : null,
          last_synced_at: new Date().toISOString()
        }, { onConflict: 'id' })

      if (entError) {
        console.warn(`Failed to upsert enterprise ${parsedId}:`, entError.message)
        continue
      }
      
      totalEnterprisesSynced++

      // 2. Fetch Catalog Items for this enterprise
      try {
        const catalogRes = await fetch(`${OFN_API_URL}/enterprises/${parsedId}/catalog_items`, { headers })
        if (catalogRes.ok) {
          const catData = await catalogRes.json()
          const catalogItems = catData['hydra:member'] || catData.data || catData || []
          
          for (const item of catalogItems) {
            const itemId = item['@id'] || item.id
            if (!itemId) continue
            
            const pId = itemId.split('/').pop()
            
            // Extract product data matching DFC schema
            const pName = item.name || item['dfc-b:name'] || 'Unknown Product'
            const pDesc = item.description || item['dfc-b:description'] || null
            const pPrice = item.price || item.price_usd || null
            const pImage = item.image || item.image_url || null
            
            await supabase
              .from('ofn_product_cache')
              .upsert({
                id: pId,
                enterprise_id: parsedId,
                name: pName,
                description: pDesc,
                price_usd: pPrice ? parseFloat(pPrice) : null,
                image_url: pImage,
                last_synced_at: new Date().toISOString()
              }, { onConflict: 'id' })
              
            totalProductsSynced++
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch catalog for enterprise ${parsedId}`, err)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced ${totalEnterprisesSynced} enterprises and ${totalProductsSynced} products.` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Sync Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
