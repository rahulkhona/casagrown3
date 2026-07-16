'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../lib/supabase'
import ProductListingWizard from '../../components/wizard/ProductListingWizard'
import SimpleListingEntry from '../../components/simple-wizard/SimpleListingEntry'

export default function ExperimentWrapper() {
  const [resolvedVariant, setResolvedVariant] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function resolveVariant() {
      // 1. Check variant override query param
      const params = new URLSearchParams(window.location.search)
      const override = params.get('variant_override')
      if (override === 'standard') {
        setResolvedVariant('/create-listing-wizard')
        return
      }
      if (override === 'simple') {
        setResolvedVariant('/create-listing-simple')
        return
      }

      // 2. Resolve anonymous ID
      let anonId = localStorage.getItem('crm_bandit_anon_id')
      if (!anonId) {
        anonId = crypto.randomUUID()
        localStorage.setItem('crm_bandit_anon_id', anonId)
      }

      // 3. Get user id if logged in
      const { data: { user } } = await supabase.auth.getUser()

      // 4. Call RPC to get variant
      const { data, error } = await supabase.rpc('get_or_assign_bandit_variant', {
        p_experiment_name: 'listing_wizard_v2',
        p_anonymous_id: anonId,
        p_user_id: user?.id || null
      })

      if (error || !data) {
        console.error('Error resolving bandit variant, falling back to /create-listing-simple:', error)
        setResolvedVariant('/create-listing-simple') // fallback to simple
      } else {
        setResolvedVariant(data)
      }
    }

    resolveVariant()
  }, [])

  if (!resolvedVariant) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTop: '3px solid #16a34a', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          <p style={{ marginTop: 12, color: '#64748b', fontSize: 14 }}>Loading listing flow...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (resolvedVariant === '/create-listing-wizard') {
    return <ProductListingWizard pageSlug="/create-listing-wizard" />
  }

  return <SimpleListingEntry pageSlug="/create-listing-simple" />
}
