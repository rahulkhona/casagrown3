'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import dynamic from 'next/dynamic'
import TrackingUrlBuilder from '../../../../components/TrackingUrlBuilder'
import 'react-quill-new/dist/quill.snow.css'

const ReactQuill = dynamic(() => import('../../../components/QuillEditor'), { ssr: false })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    [{ 'font': ['sans-serif', 'serif', 'monospace', 'arial', 'courier', 'garamond', 'tahoma', 'times', 'verdana'] }],
    [{ 'size': ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '32px'] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'align': [] }],
    ['link', 'clean'] // 'clean' is the crucial clear formatting button
  ],
}

const marketUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3002' : 'https://casagrown.com'

type Promotion = {
  id: string
  name: string
  description_html: string
  enrollment_deadline: string
  max_enrollees: number
  current_enrollees: number
  created_at: string
}

type LandingPage = {
  id: string
  title: string
  slug: string
}

type Audience = {
  id: string
  name: string
  estimated_count: number
}

type Enrollee = {
  user_id: string
  enrolled_at: string
  full_name: string
  email: string
  phone_number: string | null
  street_address: string | null
  city: string | null
  state_code: string | null
  zip_code: string | null
}

export default function CrmPromotionsBuilderPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [landingPages, setLandingPages] = useState<LandingPage[]>([])
  const [audiences, setAudiences] = useState<Audience[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingCreditImage, setUploadingCreditImage] = useState(false)
  const [promoLinks, setPromoLinks] = useState<any[]>([])
  const [enrollees, setEnrollees] = useState<Enrollee[]>([])
  const [enrolleesPromoName, setEnrolleesPromoName] = useState('')
  const [showEnrollees, setShowEnrollees] = useState(false)
  const [loadingEnrollees, setLoadingEnrollees] = useState(false)
  const [proSubPrice, setProSubPrice] = useState(10)
  const [standardFeeRate, setStandardFeeRate] = useState(0.10)

  const emptyForm = {
    name: '',
    description_html: '<p>Claim your rewards!</p>',
    days_until_deadline: '30',
    max_enrollees: '1000',
    landing_page_id: '',
    new_slug: '',
    new_title: '',
    audience_id: '',
    allow_existing_users: true,
    short_link: '',
    include_giveaway: false,
    giveaway_title: 'Limited Edition Tote Bag',
    giveaway_desc: 'Heavy-duty canvas grocery tote',
    giveaway_image_url: '/tote-bag-hero.png',
    include_credits: false,
    credit_amount: '15.00',
    credit_type: 'universal',
    cap_type: 'percentage',
    cap_value: '100',
    credit_frequency: 'weekly' as 'weekly' | 'monthly' | 'onetime',
    credit_occurrences: '4',
    credit_start_date: new Date().toISOString().split('T')[0],
    credit_image_url: '',
    discounts: {} as Record<string, {
      included: boolean
      discount_pct: string
      duration_months: string
      platform_fee_reduction_pct: string
      stripe_fee_handling_override: string
    }>
  }

  // Form State
  const [form, setForm] = useState(emptyForm)
  const [tiers, setTiers] = useState<any[]>([])

  const fetchPromotions = async () => {
    setLoading(true)
    const [promoRes, lpRes, audRes, settingsRes, tiersRes, feeRes] = await Promise.all([
      supabase.from('crm_promotions').select('*').order('created_at', { ascending: false }),
      supabase.from('crm_landing_pages').select('id, title, slug').eq('is_active', true),
      supabase.from('crm_audiences').select('id, name, estimated_count').order('name'),
      supabase.from('platform_settings').select('pro_monthly_price_usd').limit(1).single(),
      supabase.from('subscription_tiers').select('*').order('subscription_price', { ascending: true }),
      supabase.from('platform_fees').select('fees').order('creation_date', { ascending: false }).limit(1).maybeSingle()
    ])
    setPromotions((promoRes.data as Promotion[]) ?? [])
    setLandingPages((lpRes.data as LandingPage[]) ?? [])
    setAudiences((audRes.data as Audience[]) ?? [])
    if (settingsRes.data?.pro_monthly_price_usd) setProSubPrice(settingsRes.data.pro_monthly_price_usd)
    if (feeRes.data?.fees !== undefined && feeRes.data?.fees !== null) {
      setStandardFeeRate(feeRes.data.fees)
    }
    
    const activeTiers = (tiersRes.data as any[]) ?? []
    setTiers(activeTiers)

    // Populate initial default values in form.discounts
    const initialDiscounts: Record<string, any> = {}
    activeTiers.forEach(t => {
      initialDiscounts[t.tier_name] = {
        included: false,
        discount_pct: '25',
        duration_months: '',
        platform_fee_reduction_pct: '0',
        stripe_fee_handling_override: 'keep_tier'
      }
    })
    
    setForm(f => ({
      ...f,
      discounts: initialDiscounts
    }))

    setLoading(false)
  }

  useEffect(() => { fetchPromotions() }, [])

  const toast = (msg: string, ms = 5000) => { 
    setMessage(msg); 
    if (!msg.startsWith('Error')) setTimeout(() => setMessage(''), ms) 
  }

  const handleNameChange = (val: string) => {
    setForm(f => ({ ...f, name: val }))
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    try {
      const path = `crm/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage
        .from('media')
        .upload(path, file, { upsert: true })

      if (uploadErr) throw uploadErr

      // Add to Assets tab registry
      await supabase.from('crm_assets').insert({
        name: `${form.name || 'Promo'} Giveaway Image`,
        type: 'image',
        storage_path: path
      })

      const publicUrl = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      setForm(f => ({ ...f, giveaway_image_url: publicUrl }))
      toast('Image uploaded and applied successfully!')
    } catch (err: any) {
      toast(`Upload failed: ${err.message}`)
    } finally {
      setUploadingImage(false)
    }
  }

  const handleCreditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingCreditImage(true)
    try {
      const path = `crm/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage
        .from('media')
        .upload(path, file, { upsert: true })

      if (uploadErr) throw uploadErr

      await supabase.from('crm_assets').insert({
        name: `${form.name || 'Promo'} Credit Image`,
        type: 'image',
        storage_path: path
      })

      const publicUrl = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      setForm(f => ({ ...f, credit_image_url: publicUrl }))
      toast('Credit image uploaded successfully!')
    } catch (err: any) {
      toast(`Upload failed: ${err.message}`)
    } finally {
      setUploadingCreditImage(false)
    }
  }

  const handleEdit = async (id: string) => {
    setLoading(true)
    const { data: promo, error } = await supabase.from('crm_promotions').select(`
      *,
      crm_promo_giveaways (*),
      crm_promo_buyer_discounts (*),
      crm_promo_subscription_discounts (*)
    `).eq('id', id).single()
    
    if (promo && !error) {
      const gw = Array.isArray(promo.crm_promo_giveaways) ? promo.crm_promo_giveaways[0] : promo.crm_promo_giveaways
      const cred = Array.isArray(promo.crm_promo_buyer_discounts) ? promo.crm_promo_buyer_discounts[0] : promo.crm_promo_buyer_discounts
      const discountsArr = Array.isArray(promo.crm_promo_subscription_discounts)
        ? promo.crm_promo_subscription_discounts
        : (promo.crm_promo_subscription_discounts ? [promo.crm_promo_subscription_discounts] : [])

      const discountsMap: Record<string, any> = {}
      tiers.forEach(t => {
        discountsMap[t.tier_name] = {
          included: false,
          discount_pct: '25',
          duration_months: '',
          platform_fee_reduction_pct: '0',
          stripe_fee_handling_override: 'keep_tier'
        }
      })
      discountsArr.forEach((d: any) => {
        discountsMap[d.plan] = {
          included: true,
          discount_pct: d.discount_pct?.toString() || '0',
          duration_months: d.duration_months?.toString() || '',
          platform_fee_reduction_pct: d.platform_fee_reduction_pct?.toString() || '0',
          stripe_fee_handling_override: d.stripe_fee_handling_override || 'keep_tier'
        }
      })
      
      const deadline = new Date(promo.enrollment_deadline)
      const now = new Date()
      const diffTime = Math.max(0, deadline.getTime() - now.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      let existingShortLink = ''
      if (promo.landing_page_id) {
        const matchingLp = landingPages.find(lp => lp.id === promo.landing_page_id)
        if (matchingLp) {
           const destUrlSuffix = `/p/${matchingLp.slug}?promo=${id}`
           const { data: slData } = await supabase.from('crm_short_links')
             .select('token')
             .ilike('destination_url', `%${destUrlSuffix}`)
             .is('campaign_id', null)
             .maybeSingle()
           if (slData) existingShortLink = slData.token
        }
      }

      setForm({
        name: promo.name,
        description_html: promo.description_html || '',
        days_until_deadline: diffDays.toString(),
        max_enrollees: promo.max_enrollees.toString(),
        
        landing_page_id: promo.landing_page_id || '',
        new_slug: '',
        new_title: '',
        audience_id: promo.audience_id || '',
        allow_existing_users: promo.allow_existing_users ?? true,
        short_link: existingShortLink,
        
        include_giveaway: !!gw,
        giveaway_title: gw?.title || 'Limited Edition Tote Bag',
        giveaway_desc: gw?.description || 'Heavy-duty canvas grocery tote',
        giveaway_image_url: gw?.photos?.[0] || '/tote-bag-hero.png',
        
        include_credits: !!cred,
        credit_amount: cred?.discount_amount_usd?.toString() || '15.00',
        credit_type: cred?.discount_type || 'universal',
        cap_type: cred?.discount_cap_type || 'percentage',
        cap_value: cred?.discount_cap_value?.toString() || '100',
        credit_frequency: cred?.frequency || 'weekly',
        credit_occurrences: cred?.occurrences?.toString() || '4',
        credit_start_date: cred?.start_date ? new Date(cred.start_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        credit_image_url: cred?.image_url || '',
        
        discounts: discountsMap
      })
      
      setPromoLinks([])  // reset tracked links list for this promotion
      setEditingId(id)
      setCreating(true)
    } else {
      toast('Could not load promotion details for editing.')
    }
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!form.name) {
      toast('Please provide a Promotion Name.')
      return
    }
    if (form.landing_page_id === 'NEW_SLUG' && (!form.new_slug || !form.new_title)) {
      toast('Please provide a Slug and Title for the new landing page.')
      return
    } else if (!form.landing_page_id) {
      toast('Please select a Landing Page.')
      return
    }

    setSaving(true)
    
    try {
      const deadline = new Date()
      deadline.setDate(deadline.getDate() + parseInt(form.days_until_deadline || '30'))

      let promoId = editingId
      let finalLandingPageId = form.landing_page_id
      
      if (form.landing_page_id === 'NEW_SLUG') {
        const lpRes = await fetch('/api/crm/landing-pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.new_title,
            slug: form.new_slug,
            is_active: true
          }),
        })
        const lpData = await lpRes.json()
        if (!lpRes.ok || !lpData.id) throw new Error(lpData.error || 'Failed to register new landing page')
        finalLandingPageId = lpData.id
      }
      
      if (editingId) {
        // Update Promotion via API
        const updateRes = await fetch('/api/crm/promotions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert_promotion',
            id: editingId,
            name: form.name,
            description_html: form.description_html,
            enrollment_deadline: deadline.toISOString(),
            max_enrollees: parseInt(form.max_enrollees || '1000'),
            landing_page_id: finalLandingPageId,
            audience_id: form.audience_id || null,
            allow_existing_users: form.allow_existing_users
          }),
        })
        const updateData = await updateRes.json()
        if (!updateRes.ok) throw new Error("Promotion update failed: " + updateData.error)
      } else {
        // Insert Promotion via API
        const insertRes = await fetch('/api/crm/promotions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert_promotion',
            name: form.name,
            description_html: form.description_html,
            enrollment_deadline: deadline.toISOString(),
            max_enrollees: parseInt(form.max_enrollees || '1000'),
            landing_page_id: finalLandingPageId,
            audience_id: form.audience_id || null,
            allow_existing_users: form.allow_existing_users
          }),
        })
        const insertData = await insertRes.json()
        if (!insertRes.ok || !insertData.id) throw new Error(insertData.error || 'Failed to create promotion')
        promoId = insertData.id
      }

      // Generate Short Link via API
      if (finalLandingPageId) {
        const slug = form.landing_page_id === 'NEW_SLUG' ? form.new_slug : landingPages.find(lp => lp.id === finalLandingPageId)?.slug
        if (slug) {
          const destUrl = `${marketUrl}/p/${slug}?promo=${promoId}`
          const destUrlSuffix = `/p/${slug}?promo=${promoId}`
          await fetch('/api/crm/promotions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'ensure_short_link',
              destination_url: destUrl,
              suffix_match: destUrlSuffix,
            }),
          })
        }
      }

      // Giveaway UPSERT or DELETE via API
      if (form.include_giveaway) {
        await fetch('/api/crm/promotions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert_giveaway',
            promotion_id: promoId,
            title: form.giveaway_title,
            description: form.giveaway_desc,
            photos: [form.giveaway_image_url || '/tote-bag-hero.png'],
            start_date: new Date().toISOString(),
            end_date: deadline.toISOString()
          }),
        })
      } else if (editingId) {
        await fetch('/api/crm/promotions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete_giveaway', promotion_id: promoId }),
        })
      }

      // Credits UPSERT or DELETE via API
      if (form.include_credits) {
        await fetch('/api/crm/promotions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert_credits',
            promotion_id: promoId,
            discount_amount_usd: parseFloat(form.credit_amount),
            discount_type: form.credit_type,
            discount_cap_type: form.cap_type,
            discount_cap_value: parseFloat(form.cap_value),
            frequency: form.credit_frequency,
            occurrences: parseInt(form.credit_occurrences),
            start_date: new Date(form.credit_start_date).toISOString(),
            image_url: form.credit_image_url || null
          }),
        })
      } else if (editingId) {
        await fetch('/api/crm/promotions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete_credits', promotion_id: promoId }),
        })
      }

      // Dynamically handle discounts for all active tiers
      const discountPromises = tiers.map(async (t) => {
        const disc = form.discounts?.[t.tier_name]
        if (disc && disc.included) {
          return fetch('/api/crm/promotions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'upsert_sub_discount',
              promotion_id: promoId,
              plan: t.tier_name,
              discount_pct: parseInt(disc.discount_pct) || 0,
              duration_months: disc.duration_months ? parseInt(disc.duration_months) : null,
              platform_fee_reduction_pct: parseInt(disc.platform_fee_reduction_pct) || 0,
              stripe_fee_handling_override: disc.stripe_fee_handling_override || 'keep_tier'
            }),
          })
        } else if (editingId) {
          return fetch('/api/crm/promotions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'delete_sub_discount',
              promotion_id: promoId,
              plan: t.tier_name
            }),
          })
        }
      })
      await Promise.all(discountPromises)

      // Removed legacy auto-generation of crm_campaigns and crm_landing_pages
      // Users now register Canonical Landing Pages in the Landing Pages section,
      // and create Campaigns in the Campaigns section linked to specific URLs.

      // Success
      toast(`Promotion Bundle successfully ${editingId ? 'updated' : 'launched'}!`)
      
      // Instead of collapsing the form, we reload the data so the newly generated URLs appear!
      await fetchPromotions()
      await handleEdit(promoId)
      
    } catch (e: any) {
      toast(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const fetchEnrollees = useCallback(async (promoId: string, promoName: string) => {
    setLoadingEnrollees(true)
    setEnrolleesPromoName(promoName)
    setShowEnrollees(true)
    const { data, error } = await supabase
      .from('crm_promo_enrollments')
      .select('user_id, enrolled_at, profiles!inner(full_name, email, phone_number, street_address, city, state_code, zip_code)')
      .eq('promotion_id', promoId)
      .order('enrolled_at', { ascending: false })
    if (!error && data) {
      setEnrollees(data.map((row: any) => ({
        user_id: row.user_id,
        enrolled_at: row.enrolled_at,
        full_name: row.profiles?.full_name || '',
        email: row.profiles?.email || '',
        phone_number: row.profiles?.phone_number || null,
        street_address: row.profiles?.street_address || null,
        city: row.profiles?.city || null,
        state_code: row.profiles?.state_code || null,
        zip_code: row.profiles?.zip_code || null,
      })))
    } else {
      setEnrollees([])
      toast(`Error loading enrollees: ${error?.message || 'unknown'}`)
    }
    setLoadingEnrollees(false)
  }, [])

  const exportEnrolleesCSV = () => {
    const headers = ['Name', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'Enrolled At']
    const rows = enrollees.map(e => [
      e.full_name,
      e.email,
      e.phone_number || '',
      e.street_address || '',
      e.city || '',
      e.state_code || '',
      e.zip_code || '',
      new Date(e.enrolled_at).toLocaleString()
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `enrollees-${enrolleesPromoName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast('CSV downloaded!')
  }

  const deletePromo = async (id: string) => {
    if (!confirm('WARNING: Deleting this promotion will instantly cancel any ongoing recurring buying discounts for enrolled users, and permanently delete the physical giveaway offer! \n\n(The Canonical Landing Page will NOT be deleted). \n\nThis action cannot be undone. Are you absolutely sure?')) return
    await supabase.from('crm_promotions').delete().eq('id', id)
    fetchPromotions()
    toast('Promotion permanently deleted.')
  }

  return (
    <div className="crm-page">
      <div className="crm-header">
        <div>
          <h1 className="crm-title">Promotions Builder</h1>
          <p className="crm-subtitle">
            Instantly spin up complex Marketing Campaigns mapped to a live Landing Page with automated physical giveaways and recurring USD buying discounts.
          </p>
        </div>
        {!creating && (
          <button className="crm-btn-primary" onClick={() => { setEditingId(null); setForm(emptyForm); setCreating(true) }}>
            + Launch New Promo
          </button>
        )}
      </div>

      {message && (
        <div className={`crm-toast ${message.startsWith('Error') ? 'error' : 'success'}`}>
          <span style={{ flex: 1 }}>{message}</span>
          <button onClick={() => setMessage('')} className="toast-close">✕</button>
        </div>
      )}

      {creating && (
        <div className="crm-form-card">
          <h2 className="crm-form-title">{editingId ? 'Edit Promotion Bundle' : 'Launch Promotion Bundle'}</h2>

          {/* Section 1: Core Promotion */}
          <div className="section-title">1. Campaign & Landing Page Details</div>
          <div className="crm-form-grid">
            <div className="crm-field">
              <label>Promotion Name (Internal) *</label>
              <input placeholder="e.g. Summer Kickoff" value={form.name} onChange={e => handleNameChange(e.target.value)} />
            </div>
            <div className="crm-field">
              <label>Canonical Landing Page *</label>
              <select 
                value={form.landing_page_id} 
                onChange={e => setForm(f => ({...f, landing_page_id: e.target.value}))}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.95rem' }}
              >
                <option value="">-- Select a registered Landing Page --</option>
                <option value="NEW_SLUG" style={{ fontWeight: 'bold' }}>+ Register a New Landing Page...</option>
                {landingPages.map(lp => (
                  <option key={lp.id} value={lp.id}>{lp.title} (/p/{lp.slug})</option>
                ))}
              </select>
            </div>

            {form.landing_page_id === 'NEW_SLUG' && (
              <div className="crm-field full-width" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px dashed #cbd5e1' }}>
                <div className="crm-field">
                  <label>New Landing Page Title *</label>
                  <input 
                    placeholder="e.g. Spring Growers Campaign" 
                    value={form.new_title} 
                    onChange={e => setForm(f => ({...f, new_title: e.target.value, new_slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}))} 
                  />
                </div>
                <div className="crm-field">
                  <label>New URL Slug * <span className="crm-hint">casagrown.com/p/...</span></label>
                  <input 
                    value={form.new_slug} 
                    onChange={e => setForm(f => ({...f, new_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')}))} 
                  />
                </div>
              </div>
            )}

            <div className="crm-field">
              <label>Specific Promotion URL</label>
              <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.85rem', color: '#166534', wordBreak: 'break-all' }}>
                {form.landing_page_id === 'NEW_SLUG'
                  ? `${marketUrl}/p/${form.new_slug || '...' }?promo=${editingId || '{generated-on-save}'}`
                  : form.landing_page_id
                  ? `${marketUrl}/p/${landingPages.find(lp => lp.id === form.landing_page_id)?.slug}?promo=${editingId || '{generated-on-save}'}`
                  : 'Select a landing page to generate URL'}
              </div>
            </div>

            {form.short_link && (
              <div className="crm-field full-width">
                <label>Shortened Tracking Link</label>
                <div style={{ padding: '12px', background: '#dcfce7', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 600, color: '#166534', display: 'flex', justifyContent: 'space-between', border: '1px solid #bbf7d0' }}>
                  <span>{marketUrl}/r/{form.short_link}</span>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(`${marketUrl}/r/${form.short_link}`); toast('Short link copied!') }} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 'bold' }}>Copy</button>
                </div>
              </div>
            )}

            <div className="crm-field full-width">
              <label>Promotion Description <span className="crm-hint">— this is the main text shown on the landing page</span></label>
              <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden' }}>
                <ReactQuill 
                  theme="snow" 
                  modules={quillModules}
                  value={form.description_html} 
                  onChange={val => setForm(f => ({...f, description_html: val}))} 
                  style={{ minHeight: '150px' }}
                />
              </div>
            </div>
            <div className="crm-field">
              <label>Audience Permission</label>
              <button
                type="button"
                className={`crm-toggle ${form.allow_existing_users ? 'active' : ''}`}
                onClick={() => setForm(f => ({ ...f, allow_existing_users: !f.allow_existing_users }))}
              >
                <span className="toggle-dot" />
                <span>{form.allow_existing_users ? 'New & Existing Users can claim' : 'Strictly New Signups Only'}</span>
              </button>
            </div>
            <div className="crm-field">
              <label>Limit to Audience (Optional)</label>
              <select 
                value={form.audience_id} 
                onChange={e => setForm({...form, audience_id: e.target.value})} 
                className="crm-select"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
              >
                <option value="">No limit (Open to everyone with the link)</option>
                {audiences.map(a => (
                  <option key={a.id} value={a.id}>{a.name} (~{a.estimated_count} users)</option>
                ))}
              </select>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '4px' }}>If selected, only emails matching this audience can enroll.</p>
            </div>
            <div className="crm-field">
              <label>Max Total Claims / Enrollees</label>
              <input type="number" value={form.max_enrollees} onChange={e => setForm(f => ({...f, max_enrollees: e.target.value}))} />
            </div>
            <div className="crm-field">
              <label>Days Until Expiration</label>
              <input type="number" value={form.days_until_deadline} onChange={e => setForm(f => ({...f, days_until_deadline: e.target.value}))} />
            </div>
          </div>

          <hr className="divider" />

          {/* Section 2: Giveaway */}
          <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>2. Physical Giveaway Configuration</span>
            <button
                type="button"
                className={`crm-toggle ${form.include_giveaway ? 'active' : ''}`}
                onClick={() => setForm(f => ({ ...f, include_giveaway: !f.include_giveaway }))}
                style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem' }}
              >
                <span className="toggle-dot" style={{ width: 14, height: 14 }} />
                <span>{form.include_giveaway ? 'Included' : 'Disabled'}</span>
            </button>
          </div>
          
          {form.include_giveaway && (
            <div className="crm-form-grid" style={{ background: '#f8fafc', padding: 16, borderRadius: 8 }}>
               <div className="crm-field full-width">
                <label>Giveaway Item Name</label>
                <input value={form.giveaway_title} onChange={e => setForm(f => ({...f, giveaway_title: e.target.value}))} />
              </div>
              <div className="crm-field full-width">
                <label>Giveaway Description</label>
                <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden' }}>
                  <ReactQuill 
                    theme="snow" 
                    modules={quillModules}
                    value={form.giveaway_desc} 
                    onChange={val => setForm(f => ({...f, giveaway_desc: val}))} 
                    style={{ minHeight: '100px' }}
                  />
                </div>
              </div>
              <div className="crm-field full-width">
                <label>Image URL <span className="crm-hint">— you can paste an external URL or upload below</span></label>
                <input value={form.giveaway_image_url} onChange={e => setForm(f => ({...f, giveaway_image_url: e.target.value}))} />
              </div>
              <div className="crm-field full-width" style={{ marginTop: 8, borderTop: '1px dashed #d1d5db', paddingTop: 16 }}>
                <label>Upload New Image <span className="crm-hint">— automatically saves to your Assets tab</span></label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} style={{ flex: 1, padding: 8, background: 'white' }} />
                  {uploadingImage && <span className="crm-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Uploading...</span>}
                </div>
              </div>
            </div>
          )}

          {/* Section 3: USD Buying Discounts */}
          <hr className="divider" />
          <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>3. Recurring USD Buying Discounts Configuration</span>
            <button
                type="button"
                className={`crm-toggle ${form.include_credits ? 'active' : ''}`}
                onClick={() => setForm(f => ({ ...f, include_credits: !f.include_credits }))}
                style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem' }}
              >
                <span className="toggle-dot" style={{ width: 14, height: 14 }} />
                <span>{form.include_credits ? 'Included' : 'Disabled'}</span>
            </button>
          </div>

          {form.include_credits && (
            <div className="crm-form-grid" style={{ background: '#f8fafc', padding: 16, borderRadius: 8 }}>
              <div className="crm-field">
                <label>Discount Amount (USD)</label>
                <input type="number" step="0.01" value={form.credit_amount} onChange={e => setForm(f => ({...f, credit_amount: e.target.value}))} />
              </div>
              <div className="crm-field">
                <label>Discount Type</label>
                <select value={form.credit_type} onChange={e => setForm(f => ({...f, credit_type: e.target.value}))}>
                  <option value="universal">Universal (All products)</option>
                  <option value="category">Category-specific</option>
                </select>
              </div>
              <div className="crm-field">
                <label>Cap Type</label>
                <select value={form.cap_type} onChange={e => setForm(f => ({...f, cap_type: e.target.value}))}>
                  <option value="percentage">Percentage discount (e.g. 100%)</option>
                  <option value="fixed">Fixed discount amount</option>
                </select>
              </div>
              <div className="crm-field">
                <label>Cap Value</label>
                <input type="number" value={form.cap_value} onChange={e => setForm(f => ({...f, cap_value: e.target.value}))} />
              </div>
              <div className="crm-field">
                <label>Discount Frequency</label>
                <select value={form.credit_frequency} onChange={e => setForm(f => ({...f, credit_frequency: e.target.value as any}))}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="onetime">One-time</option>
                </select>
              </div>
              <div className="crm-field">
                <label>Occurrences (Cycles)</label>
                <input type="number" value={form.credit_occurrences} onChange={e => setForm(f => ({...f, credit_occurrences: e.target.value}))} />
              </div>
              <div className="crm-field">
                <label>Start Date</label>
                <input type="date" value={form.credit_start_date} onChange={e => setForm(f => ({...f, credit_start_date: e.target.value}))} />
              </div>
              <div className="crm-field">
                <label>Discount Promo Image URL</label>
                <input value={form.credit_image_url} onChange={e => setForm(f => ({...f, credit_image_url: e.target.value}))} />
              </div>
              <div className="crm-field full-width" style={{ marginTop: 8, borderTop: '1px dashed #d1d5db', paddingTop: 16 }}>
                <label>Upload Discount Image</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <input type="file" accept="image/*" onChange={handleCreditImageUpload} disabled={uploadingCreditImage} style={{ flex: 1, padding: 8, background: 'white' }} />
                  {uploadingCreditImage && <span className="crm-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Uploading...</span>}
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Tier Subscription Discounts & Sales Fee Overrides */}
          <hr className="divider" />
          
          <div className="section-title">4. Subscription Tier Discounts & Sales Fee Overrides</div>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '16px', lineHeight: '1.5' }}>
            Configure active promotional discounts, duration limits, transaction fee reductions, and Stripe fee handling overrides for each subscription tier.
          </p>

          <div className="crm-comparison-table-wrap" style={{ marginBottom: '24px', overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '12px', background: '#f9fafb' }}>
            <table className="crm-comparison-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151', width: '180px' }}>Subscription Tier</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151', width: '100px', textAlign: 'center' }}>Offer Promo?</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151', width: '120px' }}>Discount %</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151', width: '150px' }}>Duration (Months)</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151', width: '150px' }}>Sales Fee Reduction %</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151', width: '220px' }}>Stripe CC Override</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151' }}>Live Terms & Impact</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier, idx) => {
                  const rawDisc = form.discounts?.[tier.tier_name]
                  const disc = {
                    included: rawDisc?.included ?? false,
                    discount_pct: rawDisc?.discount_pct ?? '25',
                    duration_months: rawDisc?.duration_months ?? '',
                    platform_fee_reduction_pct: rawDisc?.platform_fee_reduction_pct ?? '0',
                    stripe_fee_handling_override: rawDisc?.stripe_fee_handling_override ?? 'keep_tier'
                  }

                  const basePrice = tier.subscription_price || 0
                  const pct = parseInt(disc.discount_pct) || 0
                  const finalPrice = basePrice * (1 - pct / 100)
                  const savings = basePrice * pct / 100

                  const baseFee = (tier.platform_fee_pct !== null && tier.platform_fee_pct !== undefined)
                    ? tier.platform_fee_pct
                    : (standardFeeRate * 100)
                  const reduction = parseInt(disc.platform_fee_reduction_pct) || 0
                  const finalFee = Math.max(0, baseFee - reduction)

                  return (
                    <tr key={tier.tier_name} style={{ borderBottom: '1px solid #e5e7eb', background: disc.included ? (idx % 2 === 0 ? '#faf5ff' : '#fdf4ff') : 'white', transition: 'background-color 0.2s' }}>
                      {/* Tier Name & Regular Price */}
                      <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                        <span style={{ fontWeight: 700, color: '#1a2e1a', display: 'block' }}>{tier.display_name || tier.tier_name}</span>
                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Regular: ${basePrice.toFixed(2)}/mo</span>
                      </td>

                      {/* Offer Toggle (Included) */}
                      <td style={{ padding: '16px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <button
                          type="button"
                          className={`crm-toggle ${disc.included ? 'active' : ''}`}
                          onClick={() => setForm(f => {
                            const newD = { ...f.discounts }
                            const existing = newD[tier.tier_name] || {
                              included: false,
                              discount_pct: '25',
                              duration_months: '',
                              platform_fee_reduction_pct: '0',
                              stripe_fee_handling_override: 'keep_tier'
                            }
                            newD[tier.tier_name] = { ...existing, included: !existing.included }
                            return { ...f, discounts: newD }
                          })}
                          style={{ margin: '0 auto', padding: '4px 8px', fontSize: '0.78rem' }}
                        >
                          <span className="toggle-dot" style={{ width: 12, height: 12 }} />
                          <span>{disc.included ? 'Yes' : 'No'}</span>
                        </button>
                      </td>

                      {/* Discount Pct */}
                      <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            disabled={!disc.included}
                            value={disc.discount_pct ?? ''}
                            onChange={e => setForm(f => {
                              const newD = { ...f.discounts }
                              const existing = newD[tier.tier_name] || {
                                included: false,
                                discount_pct: '25',
                                duration_months: '',
                                platform_fee_reduction_pct: '0',
                                stripe_fee_handling_override: 'keep_tier'
                              }
                              newD[tier.tier_name] = { ...existing, discount_pct: e.target.value }
                              return { ...f, discounts: newD }
                            })}
                            style={{ width: '65px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.88rem', background: !disc.included ? '#f3f4f6' : 'white' }}
                          />
                          <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600 }}>%</span>
                        </div>
                      </td>

                      {/* Duration */}
                      <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                        <input
                          type="number"
                          min="1"
                          placeholder="Perpetual"
                          disabled={!disc.included}
                          value={disc.duration_months ?? ''}
                          onChange={e => setForm(f => {
                            const newD = { ...f.discounts }
                            const existing = newD[tier.tier_name] || {
                              included: false,
                              discount_pct: '25',
                              duration_months: '',
                              platform_fee_reduction_pct: '0',
                              stripe_fee_handling_override: 'keep_tier'
                            }
                            newD[tier.tier_name] = { ...existing, duration_months: e.target.value }
                            return { ...f, discounts: newD }
                          })}
                          style={{ width: '110px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.88rem', background: !disc.included ? '#f3f4f6' : 'white' }}
                        />
                      </td>

                      {/* Platform Sales Fee Reduction Pct */}
                      <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            disabled={!disc.included}
                            value={disc.platform_fee_reduction_pct ?? ''}
                            onChange={e => setForm(f => {
                              const newD = { ...f.discounts }
                              const existing = newD[tier.tier_name] || {
                                included: false,
                                discount_pct: '25',
                                duration_months: '',
                                platform_fee_reduction_pct: '0',
                                stripe_fee_handling_override: 'keep_tier'
                              }
                              newD[tier.tier_name] = { ...existing, platform_fee_reduction_pct: e.target.value }
                              return { ...f, discounts: newD }
                            })}
                            style={{ width: '65px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.88rem', background: !disc.included ? '#f3f4f6' : 'white' }}
                          />
                          <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600 }}>%</span>
                        </div>
                      </td>

                      {/* Stripe Override */}
                      <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                        <select
                          disabled={!disc.included}
                          value={disc.stripe_fee_handling_override ?? 'keep_tier'}
                          onChange={e => setForm(f => {
                            const newD = { ...f.discounts }
                            const existing = newD[tier.tier_name] || {
                              included: false,
                              discount_pct: '25',
                              duration_months: '',
                              platform_fee_reduction_pct: '0',
                              stripe_fee_handling_override: 'keep_tier'
                            }
                            newD[tier.tier_name] = { ...existing, stripe_fee_handling_override: e.target.value }
                            return { ...f, discounts: newD }
                          })}
                          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem', background: !disc.included ? '#f3f4f6' : 'white', width: '100%', outline: 'none' }}
                        >
                          <option value="keep_tier">Default ({tier.stripe_fee_handling === 'absorb' ? 'Absorbed' : 'Pass-through'})</option>
                          <option value="pass_through">Pass-through</option>
                          <option value="absorb">Absorbed</option>
                        </select>
                      </td>

                      {/* Expected Impact Summary */}
                      <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                        {!disc.included ? (
                          <span style={{ fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic' }}>Promo disabled</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#166534' }}>
                              💰 {pct > 0 ? `${pct}% off ➔ $${finalPrice.toFixed(2)}/mo` : 'Full Price'} 
                              {pct > 0 && <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.8rem', marginLeft: '4px' }}>(saves ${savings.toFixed(2)}/mo)</span>}
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0369a1' }}>
                              📉 Sales fee: {baseFee}% ➔ {finalFee}% 
                              {reduction > 0 && <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.8rem', marginLeft: '4px' }}>(reduced by {reduction}%)</span>}
                            </span>
                            {disc.duration_months && (
                              <span style={{ fontSize: '0.78rem', color: '#7c3aed', fontWeight: 500 }}>
                                ⏱ Active for {disc.duration_months} month{parseInt(disc.duration_months) !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="crm-form-actions" style={{ marginTop: 24 }}>
            <button className="crm-btn-primary" onClick={handleCreate} disabled={saving || !form.name || !form.landing_page_id}>
              {saving ? 'Saving...' : (editingId ? 'Save Changes' : 'Launch Promotion Bundle')}
            </button>
            <button className="crm-btn-secondary" onClick={() => { setCreating(false); setEditingId(null); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Promotion Name</th>
              <th>Enrollees</th>
              <th>Expiration</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="crm-empty">Loading…</td></tr>
            ) : promotions.length === 0 ? (
              <tr><td colSpan={5} className="crm-empty">No active promotions found. Launch one above!</td></tr>
            ) : promotions.map(p => (
              <tr key={p.id}>
                <td>
                  <div className="crm-name">{p.name}</div>
                  <div className="crm-muted">{p.id.split('-')[0]}...</div>
                </td>
                <td>
                  <span className="crm-badge stat-badge" style={{ background: p.current_enrollees >= p.max_enrollees ? '#fee2e2' : '#dcfce7', color: p.current_enrollees >= p.max_enrollees ? '#991b1b' : '#166534' }}>
                    {p.current_enrollees} / {p.max_enrollees}
                  </span>
                </td>
                <td>
                  {new Date(p.enrollment_deadline) < new Date() ? (
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>Expired</span>
                  ) : (
                    <span className="crm-muted">{new Date(p.enrollment_deadline).toLocaleDateString()}</span>
                  )}
                </td>
                <td className="crm-muted">{new Date(p.created_at).toLocaleDateString()}</td>
                <td>
                  <button className="crm-btn-edit-icon" onClick={() => fetchEnrollees(p.id, p.name)} title="View Enrolled Users" style={{ fontSize: '1rem' }}>👥</button>
                  <button className="crm-btn-edit-icon" onClick={() => handleEdit(p.id)} title="Edit Promotion Bundle">✏️</button>
                  <button className="crm-btn-danger-icon" onClick={() => deletePromo(p.id)} title="Delete Promotion Bundle">🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Enrollees Modal */}
      {showEnrollees && (
        <div className="enrollees-overlay" onClick={() => setShowEnrollees(false)}>
          <div className="enrollees-modal" onClick={e => e.stopPropagation()}>
            <div className="enrollees-header">
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#1a2e1a' }}>Enrolled Users — {enrolleesPromoName}</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#6b7280' }}>{enrollees.length} user{enrollees.length !== 1 ? 's' : ''} enrolled</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {enrollees.length > 0 && (
                  <button className="crm-btn-primary" onClick={exportEnrolleesCSV} style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
                    📥 Export CSV
                  </button>
                )}
                <button className="crm-btn-secondary" onClick={() => setShowEnrollees(false)} style={{ fontSize: '0.85rem', padding: '8px 16px' }}>Close</button>
              </div>
            </div>
            {loadingEnrollees ? (
              <div className="crm-empty">Loading enrollees…</div>
            ) : enrollees.length === 0 ? (
              <div className="crm-empty">No users have enrolled in this promotion yet.</div>
            ) : (
              <div className="enrollees-table-wrap">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Address</th>
                      <th>Enrolled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollees.map((e, i) => (
                      <tr key={e.user_id}>
                        <td className="crm-muted">{i + 1}</td>
                        <td><span className="crm-name">{e.full_name || '—'}</span></td>
                        <td style={{ fontSize: '0.85rem' }}>{e.email}</td>
                        <td style={{ fontSize: '0.85rem' }}>{e.phone_number || '—'}</td>
                        <td style={{ fontSize: '0.82rem', color: '#6b7280', maxWidth: 220 }}>
                          {[e.street_address, e.city, e.state_code, e.zip_code].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="crm-muted">{new Date(e.enrolled_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .crm-page { }
        .crm-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; }
        .crm-title { font-size: 1.6rem; font-weight: 700; color: #1a2e1a; }
        .crm-subtitle { color: #6b7280; font-size: 0.9rem; margin-top: 4px; max-width: 560px; line-height: 1.5; }
        .crm-toast { display: flex; align-items: center; justify-content: space-between; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; font-weight: 500; font-size: 0.9rem; }
        .crm-toast.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
        .crm-toast.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
        .toast-close { background: none; border: none; font-size: 1.1rem; cursor: pointer; opacity: 0.6; padding: 0 0 0 12px; }
        .toast-close:hover { opacity: 1; }
        .crm-form-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .crm-form-title { font-size: 1.3rem; font-weight: 700; margin-bottom: 24px; color: #1a2e1a; }
        .section-title { font-size: 0.95rem; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
        .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
        .crm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .crm-field { display: flex; flex-direction: column; gap: 6px; }
        .crm-field.full-width { grid-column: 1/-1; }
        .crm-field label { font-size: 0.85rem; font-weight: 600; color: #374151; }
        .crm-hint { font-weight: 400; color: #9ca3af; font-size: 0.78rem; }
        .crm-field input, .crm-field textarea, .crm-field select { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 0.95rem; outline: none; font-family: inherit; width: 100%; background: white; color: #1f2937; box-sizing: border-box; }
        .crm-field input:focus, .crm-field textarea:focus, .crm-field select:focus { border-color: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,0.15); }
        .crm-field textarea { resize: vertical; min-height: 100px; }
        .crm-toggle { display: flex; align-items: center; gap: 10px; border: 2px solid #d1d5db; border-radius: 24px; padding: 8px 16px 8px 8px; background: #f9fafb; cursor: pointer; font-size: 0.9rem; color: #374151; font-weight: 500; transition: all 0.2s; width: fit-content; }
        .crm-toggle.active { border-color: #22c55e; background: #dcfce7; color: #166534; }
        .toggle-dot { width: 20px; height: 20px; border-radius: 50%; background: #d1d5db; transition: background 0.2s; flex-shrink: 0; }
        .crm-toggle.active .toggle-dot { background: #22c55e; }
        .crm-form-actions { display: flex; gap: 12px; }
        .crm-btn-primary { background: #22c55e; color: white; border: none; border-radius: 10px; padding: 10px 20px; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
        .crm-btn-primary:hover:not(:disabled) { background: #16a34a; }
        .crm-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .crm-btn-secondary { background: white; color: #6b7280; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 20px; cursor: pointer; font-weight: 500; }
        .crm-table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 12px; }
        .crm-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .crm-table th { background: #f9fafb; padding: 12px 14px; text-align: left; font-weight: 600; color: #6b7280; font-size: 0.8rem; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
        .crm-table td { padding: 14px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
        .crm-table tr:last-child td { border-bottom: none; }
        .crm-name { font-weight: 600; color: #1a2e1a; font-size: 0.95rem; }
        .crm-muted { color: #9ca3af; font-size: 0.85rem; margin-top: 2px; }
        .crm-badge { border-radius: 12px; padding: 4px 10px; font-size: 0.82rem; font-weight: 600; display: inline-block; }
        .crm-btn-danger-icon, .crm-btn-edit-icon { background: none; border: none; cursor: pointer; font-size: 1.1rem; opacity: 0.6; transition: opacity 0.15s; padding: 4px; margin-right: 4px; }
        .crm-btn-danger-icon:hover { opacity: 1; color: #dc2626; }
        .crm-btn-edit-icon:hover { opacity: 1; color: #2563eb; }
        .crm-empty { text-align: center; color: #9ca3af; padding: 48px; line-height: 2; }

        .enrollees-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; backdrop-filter: blur(4px); }
        .enrollees-modal { background: white; border-radius: 16px; width: 100%; max-width: 900px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
        .enrollees-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
        .enrollees-table-wrap { overflow-y: auto; flex: 1; }
        
        :global(.ql-container) { resize: vertical; overflow-y: auto; min-height: 150px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; }
        :global(.ql-toolbar) { border-top-left-radius: 8px; border-top-right-radius: 8px; }
      `}</style>
    </div>
  )
}
