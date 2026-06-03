'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { useAuth } from '../../../../lib/useAuth'
import { useSubscription } from '../../../../lib/useSubscription'
import { checkTextForViolations } from '../../../../lib/moderation'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import styles from './page.module.css'

interface CatalogItem {
  id: string
  name: string
  description: string | null
  category: string
  photos: string[]
  default_price_usd: number | null
  default_unit: string | null
  total_inventory: number
  certifications: string[]
  variety: string | null
  growing_method: string | null
  shelf_life_days: number | null
  storage_instructions: string | null
  harvest_date: string | null
  created_at: string
  // From allocation view
  allocated_inventory?: number
  stand_count?: number
}

const CERTIFICATIONS = [
  { id: 'organic', label: '🌿 Organic' },
  { id: 'non_gmo', label: '🧬 Non-GMO' },
  { id: 'pesticide_free', label: '🚫 Pesticide Free' },
  { id: 'naturally_grown', label: '🌱 Naturally Grown' },
]

const UNITS = ['each', 'bunch', 'dozen', 'lb', 'oz', 'bag', 'basket', 'box', 'pint', 'quart', 'jar', 'loaf']

const GROWING_METHODS = [
  { value: '', label: 'Select method...' },
  { value: 'soil', label: 'Soil / Ground' },
  { value: 'raised_bed', label: 'Raised Bed' },
  { value: 'container', label: 'Container' },
  { value: 'hydroponic', label: 'Hydroponic' },
  { value: 'aquaponic', label: 'Aquaponic' },
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'vertical', label: 'Vertical Farm' },
]

export default function CatalogPage() {
  const { user, loading: authLoading } = useAuth()
  const { isPro, loading: subLoading } = useSubscription()
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<CatalogItem[]>([])
  const [categories, setCategories] = useState<{ name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Form fields
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formPhotos, setFormPhotos] = useState<string[]>([])
  const [formPrice, setFormPrice] = useState('')
  const [formUnit, setFormUnit] = useState('each')
  const [formInventory, setFormInventory] = useState('')
  const [formCertifications, setFormCertifications] = useState<string[]>([])
  const [formVariety, setFormVariety] = useState('')
  const [formGrowingMethod, setFormGrowingMethod] = useState('')
  const [formShelfLife, setFormShelfLife] = useState('')
  const [formStorageInstructions, setFormStorageInstructions] = useState('')
  const [formHarvestDate, setFormHarvestDate] = useState('')

  // AI description generation
  const [generatingDesc, setGeneratingDesc] = useState(false)

  // Price suggestion
  const [suggestedPrice, setSuggestedPrice] = useState<{ price_usd: number; unit: string; source: string } | null>(null)
  const [suggestingPrice, setSuggestingPrice] = useState(false)
  const lastPriceCheck = useRef('')
  
  // Allocation modal state
  const [showAllocModal, setShowAllocModal] = useState(false)
  const [allocItem, setAllocItem] = useState<CatalogItem | null>(null)
  const [booths, setBooths] = useState<{id: string, name: string, hasWindows: boolean}[]>([])
  const [allocSelections, setAllocSelections] = useState<Record<string, string>>({}) // boothId -> qty
  const [allocatingBooth, setAllocatingBooth] = useState<string | null>(null)

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Price suggestion: two-tier (local average → AI fallback)
  useEffect(() => {
    if (!formName || formName.trim().length < 3) {
      setSuggestedPrice(null)
      return
    }
    const timer = setTimeout(async () => {
      const trimmed = formName.trim()
      const words = trimmed.split(/\s+/)
      const baseNoun = words[words.length - 1]
      if (baseNoun === lastPriceCheck.current) return
      lastPriceCheck.current = baseNoun
      if (!user) return
      setSuggestingPrice(true)
      try {
        // Tier 1: query local products
        const { data: profile } = await supabase
          .from('profiles').select('home_community_h3_index, city, state_code')
          .eq('id', user.id).single()
        const h3 = profile?.home_community_h3_index
        if (h3) {
          const { data: localProducts } = await supabase
            .from('market_products')
            .select('price_usd, unit, seller_id, name')
            .ilike('name', `%${baseNoun}%`)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(50)
          if (localProducts && localProducts.length > 0) {
            const sellerIds = Array.from(new Set(localProducts.map((p: any) => p.seller_id)))
            const { data: neighborSellers } = await supabase
              .from('profiles').select('id').eq('home_community_h3_index', h3).in('id', sellerIds)
            if (neighborSellers && neighborSellers.length > 0) {
              const neighborIds = new Set(neighborSellers.map((s: any) => s.id))
              const matches = localProducts.filter((p: any) => neighborIds.has(p.seller_id))
              if (matches.length >= 3) {
                const avg = matches.reduce((sum: number, p: any) => sum + Number(p.price_usd), 0) / matches.length
                const unitCounts: Record<string, number> = {}
                matches.forEach((p: any) => { unitCounts[p.unit] = (unitCounts[p.unit] || 0) + 1 })
                const topUnit = Object.entries(unitCounts).sort((a, b) => b[1] - a[1])[0][0]
                setSuggestedPrice({ price_usd: Math.round(avg * 100) / 100, unit: topUnit, source: 'neighborhood_average' })
                setSuggestingPrice(false)
                return
              }
            }
          }
        }
        // Tier 2: AI fallback
        const res = await supabase.functions.invoke('suggest-product-price', {
          body: { name: trimmed, state: profile?.state_code, city: profile?.city }
        })
        if (res.data && typeof res.data.price_usd === 'number' && res.data.price_usd > 0 && !res.data.error) {
          setSuggestedPrice(res.data)
        } else {
          setSuggestedPrice(null)
        }
      } catch {
        setSuggestedPrice(null)
      } finally {
        setSuggestingPrice(false)
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [formName, user, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  // AI description generation
  const handleGenerateDescription = async () => {
    if (!formName.trim()) return
    setGeneratingDesc(true)
    try {
      const prompt = [
        formName.trim(),
        formCategory ? `Category: ${formCategory}` : '',
        formVariety ? `Variety: ${formVariety}` : '',
        formGrowingMethod ? `Growing method: ${formGrowingMethod}` : '',
        formCertifications.length > 0 ? `Certifications: ${formCertifications.join(', ')}` : '',
      ].filter(Boolean).join('. ')

      // Try photo analysis first if we have photos
      if (formPhotos.length > 0) {
        const res = await supabase.functions.invoke('analyze-product-photo', {
          body: { image: formPhotos[0] }
        })
        if (res.data?.description) {
          setFormDescription(res.data.description)
          setGeneratingDesc(false)
          return
        }
      }

      // Fallback: generate from price suggestion endpoint context
      // Build a simple description from the product attributes
      const parts = []
      if (formVariety) parts.push(`${formVariety} variety`)
      parts.push(formName.trim())
      if (formGrowingMethod) {
        const method = GROWING_METHODS.find(m => m.value === formGrowingMethod)
        if (method && method.value) parts.push(`grown using ${method.label.toLowerCase()} method`)
      }
      if (formCertifications.length > 0) {
        const certLabels = formCertifications.map(c => CERTIFICATIONS.find(x => x.id === c)?.label?.replace(/^[^\s]+\s/, '') || c)
        parts.push(certLabels.join(', '))
      }
      const desc = `Fresh, locally grown ${parts.join('. ')}. Harvested with care from our backyard garden.`
      setFormDescription(desc)
    } catch {
      // Silent fail
    } finally {
      setGeneratingDesc(false)
    }
  }

  // Fetch booths on mount
  useEffect(() => {
    if (!user) return
    supabase.from('market_booths')
      .select('id, name, delivery_windows, pickup_windows, weekly_delivery_windows, weekly_pickup_windows')
      .eq('owner_id', user.id).order('created_at')
      .then(({ data }: { data: any }) => {
        if (data) setBooths(data.map((b: any) => {
          const hasDw = Array.isArray(b.delivery_windows) && b.delivery_windows.length > 0
          const hasPw = Array.isArray(b.pickup_windows) && b.pickup_windows.length > 0
          const hasWeeklyDw = b.weekly_delivery_windows && typeof b.weekly_delivery_windows === 'object' && Object.keys(b.weekly_delivery_windows).length > 0
          const hasWeeklyPw = b.weekly_pickup_windows && typeof b.weekly_pickup_windows === 'object' && Object.keys(b.weekly_pickup_windows).length > 0
          return { id: b.id, name: b.name || 'Unnamed Booth', hasWindows: hasDw || hasPw || hasWeeklyDw || hasWeeklyPw }
        }))
      })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAllocate = (item: CatalogItem) => {
    setAllocItem(item)
    setAllocSelections({})
    setShowAllocModal(true)
  }

  const handleAllocateToBooth = async (boothId: string) => {
    if (!allocItem || !user) return
    const qty = parseInt(allocSelections[boothId] || '0')
    if (qty < 1) return
    setAllocatingBooth(boothId)
    const { data: productId, error: allocErr } = await supabase.rpc('allocate_from_catalog', {
      p_catalog_item_id: allocItem.id,
      p_booth_id: boothId,
      p_quantity: qty,
      p_price_override: null,
    })
    setAllocatingBooth(null)
    if (allocErr) {
      setToastMsg('Failed: ' + allocErr.message)
      setTimeout(() => setToastMsg(null), 4000)
      return
    }

    // Trigger AI content moderation on the newly created listing (non-blocking)
    if (productId) {
      supabase.functions.invoke('moderate-listing', {
        body: {
          product_id: productId,
          seller_id: user.id,
          name: allocItem.name,
          description: allocItem.description || null,
          price_usd: allocItem.default_price_usd ?? 0,
          category: allocItem.category,
          photo_url: allocItem.photos?.[0] || null,
        },
      }).then((modRes: any) => {
        const modData = modRes.data as any
        if (modData?.status === 'flagged' && modData?.flags) {
          const messages = Object.values(modData.flags.issue_messages || {}) as string[]
          const reason = messages[0] || modData.flags.reason || 'Listing was flagged for review.'
          setToastMsg(`⚠️ ${reason} — The listing has been hidden until the issue is resolved.`)
          setTimeout(() => setToastMsg(null), 6000)
        }
      }).catch((err: any) => {
        console.warn('Moderation check failed (non-blocking):', err)
      })
    }

    // Update local state
    setItems(prev => prev.map(it =>
      it.id === allocItem.id
        ? {
            ...it,
            allocated_inventory: (it.allocated_inventory || 0) + qty,
            stand_count: (it.stand_count || 0) + 1,
          }
        : it
    ))
    setAllocSelections(prev => { const n = { ...prev }; delete n[boothId]; return n })
  }

  const handleDeleteItem = async (item: CatalogItem) => {
    setDeleteTarget(item)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('catalog_items').delete().eq('id', deleteTarget.id)
    if (error) {
      setDeleteTarget(null)
      setDeleting(false)
      setToastMsg('Delete failed: ' + error.message)
      setTimeout(() => setToastMsg(null), 4000)
      return
    }
    setItems(prev => prev.filter(it => it.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleting(false)
  }

  // Load categories + catalog items
  useEffect(() => {
    if (authLoading || !user) return
    const load = async () => {
      const [catRes, itemsRes] = await Promise.all([
        supabase.from('sales_categories').select('name').order('display_order'),
        supabase
          .from('catalog_items')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false }),
      ])
      if (catRes.data) setCategories(catRes.data)

      if (itemsRes.data) {
        // Try to get allocation info
        const { data: allocations } = await supabase
          .from('catalog_item_allocations')
          .select('catalog_item_id, allocated_inventory, stand_count')
          .in('catalog_item_id', itemsRes.data.map((i: any) => i.id))

        const allocMap = new Map<string, any>(
          (allocations || []).map((a: any) => [a.catalog_item_id, a])
        )

        setItems(
          itemsRes.data.map((item: any) => {
            const alloc = allocMap.get(item.id)
            return {
              ...item,
              photos: item.photos || [],
              certifications: item.certifications || [],
              allocated_inventory: alloc?.allocated_inventory ?? 0,
              stand_count: alloc?.stand_count ?? 0,
            }
          })
        )
      }
      setLoading(false)
    }
    load()
  }, [user?.id, authLoading, subLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !subLoading && !user) {
      router.replace('/login?redirect=/my-stands/catalog')
    }
  }, [authLoading, subLoading, user, router])

  // Catalog is Pro-only — redirect free users
  useEffect(() => {
    if (!authLoading && !subLoading && user && !isPro) {
      router.replace('/my-stands')
    }
  }, [authLoading, subLoading, user, isPro, router])

  if (authLoading || subLoading || !user) return <LoadingSpinner />
  if (!isPro) return <LoadingSpinner />

  // Filter items
  const filteredItems = items.filter(item => {
    const matchesSearch = !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  // Unique categories from items (for pills)
  const usedCategories = Array.from(new Set(items.map(i => i.category).filter(Boolean)))

  // Open modal for new item
  const handleAddItem = () => {
    setEditingItem(null)
    resetForm()
    setShowModal(true)
  }

  // Open modal for editing
  const handleEditItem = (item: CatalogItem) => {
    setEditingItem(item)
    setFormName(item.name)
    setFormDescription(item.description || '')
    setFormCategory(item.category)
    setFormPhotos(item.photos || [])
    setFormPrice(item.default_price_usd != null ? String(item.default_price_usd) : '')
    setFormUnit(item.default_unit || 'each')
    setFormInventory(String(item.total_inventory || 0))
    setFormCertifications(item.certifications || [])
    setFormVariety(item.variety || '')
    setFormGrowingMethod(item.growing_method || '')
    setFormShelfLife(item.shelf_life_days != null ? String(item.shelf_life_days) : '')
    setFormStorageInstructions(item.storage_instructions || '')
    setFormHarvestDate(item.harvest_date || '')
    setFormError(null)
    setSuggestedPrice(null)
    lastPriceCheck.current = ''
    setShowModal(true)
  }

  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormCategory('')
    setFormPhotos([])
    setFormPrice('')
    setFormUnit('each')
    setFormInventory('')
    setFormCertifications([])
    setFormVariety('')
    setFormGrowingMethod('')
    setFormShelfLife('')
    setFormStorageInstructions('')
    setFormHarvestDate('')
    setFormError(null)
    setSuggestedPrice(null)
    setSuggestingPrice(false)
    lastPriceCheck.current = ''
  }

  const toggleCertification = (certId: string) => {
    setFormCertifications(prev =>
      prev.includes(certId)
        ? prev.filter(c => c !== certId)
        : [...prev, certId]
    )
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setFormPhotos(prev => [...prev, dataUrl])
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const removePhoto = (index: number) => {
    setFormPhotos(prev => { const n = [...prev]; n.splice(index, 1); return n })
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      setFormError('Name is required')
      return
    }
    if (!formCategory) {
      setFormError('Category is required')
      return
    }

    // Content moderation — block banned/offensive content
    const nameCheck = checkTextForViolations(formName)
    if (!nameCheck.isClean) {
      setFormError(nameCheck.error || 'Product name contains prohibited content.')
      return
    }
    if (formDescription.trim()) {
      const descCheck = checkTextForViolations(formDescription)
      if (!descCheck.isClean) {
        setFormError(descCheck.error || 'Description contains prohibited content.')
        return
      }
    }

    setSaving(true)
    setFormError(null)

    try {
      // Upload photos to storage
      const uploadedPhotoUrls: string[] = []
      for (let i = 0; i < formPhotos.length; i++) {
        const photoData = formPhotos[i]
        // Skip if already a URL (existing photo)
        if (photoData.startsWith('http')) {
          uploadedPhotoUrls.push(photoData)
          continue
        }
        try {
          const res = await fetch(photoData)
          const blob = await res.blob()
          const ext = blob.type.includes('png') ? 'png' : 'jpg'
          const path = `${user.id}/catalog/${Date.now()}_${i}.${ext}`
          const { error: uploadErr } = await supabase.storage.from('product-photos').upload(path, blob, { upsert: true })
          if (uploadErr) throw uploadErr
          const { data: urlData } = supabase.storage.from('product-photos').getPublicUrl(path)
          if (urlData?.publicUrl) uploadedPhotoUrls.push(urlData.publicUrl)
        } catch (err: any) {
          setFormError('Photo upload failed: ' + err.message)
          setSaving(false)
          return
        }
      }

      const row: Record<string, any> = {
        owner_id: user.id,
        name: formName.trim(),
        description: formDescription.trim() || null,
        category: formCategory,
        photos: uploadedPhotoUrls,
        default_price_usd: formPrice ? parseFloat(formPrice) : null,
        default_unit: formUnit,
        total_inventory: parseInt(formInventory) || 0,
        certifications: formCertifications,
        variety: formVariety.trim() || null,
        growing_method: formGrowingMethod || null,
        shelf_life_days: formShelfLife ? parseInt(formShelfLife) : null,
        storage_instructions: formStorageInstructions.trim() || null,
        harvest_date: formHarvestDate || null,
      }

      if (editingItem) {
        const { error } = await supabase
          .from('catalog_items')
          .update(row)
          .eq('id', editingItem.id)
        if (error) throw error
        setItems(prev => prev.map(it => it.id === editingItem.id ? { ...it, ...row, photos: uploadedPhotoUrls } : it))
      } else {
        const { data, error } = await supabase
          .from('catalog_items')
          .insert(row)
          .select()
          .single()
        if (error) throw error
        setItems(prev => [{ ...data, photos: uploadedPhotoUrls, certifications: formCertifications, allocated_inventory: 0, stand_count: 0 }, ...prev])
      }

      setShowModal(false)
      resetForm()
    } catch (err: any) {
      setFormError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const getInventoryBarClass = (item: CatalogItem) => {
    const available = item.total_inventory - (item.allocated_inventory || 0)
    const pct = item.total_inventory > 0 ? available / item.total_inventory : 1
    if (pct <= 0.1) return styles.inventoryBarFillDanger
    if (pct <= 0.3) return styles.inventoryBarFillWarning
    return ''
  }

  return (
    <div className={styles.catalogPage}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>📦 Product Catalog</h1>
        {items.length > 0 && (
          <button className={styles.addBtn} onClick={handleAddItem}>
            + Add Item
          </button>
        )}
      </div>

      {/* Filters — Only render if catalog has items */}
      {items.length > 0 && (
        <div className={styles.filterBar}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              className={styles.searchInput}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search catalog items..."
            />
          </div>
          <div className={styles.categoryPills}>
            <button
              className={`${styles.categoryPill} ${selectedCategory === 'all' ? styles.categoryPillActive : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All
            </button>
            {(usedCategories.length > 0 ? usedCategories : categories.map(c => c.name)).map(cat => (
              <button
                key={cat}
                className={`${styles.categoryPill} ${selectedCategory === cat ? styles.categoryPillActive : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Item Grid */}
      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className={styles.itemGrid}>
          {filteredItems.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📦</div>
              <div className={styles.emptyTitle}>
                {searchQuery || selectedCategory !== 'all'
                  ? 'No items match your filters'
                  : 'Your catalog is empty'}
              </div>
              <div className={styles.emptySubtitle}>
                {searchQuery || selectedCategory !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Add items to your catalog to list them across multiple stands'}
              </div>
              {!searchQuery && selectedCategory === 'all' && (
                <button className={styles.addBtn} onClick={handleAddItem}>
                  + Add Your First Item
                </button>
              )}
            </div>
          ) : (
            filteredItems.map(item => {
              const available = item.total_inventory - (item.allocated_inventory || 0)
              const pct = item.total_inventory > 0
                ? Math.round(((item.allocated_inventory || 0) / item.total_inventory) * 100)
                : 0

              return (
                <div key={item.id} className={styles.itemCard}>
                  <div className={styles.itemImageWrap}>
                    {item.photos.length > 0 ? (
                      <img src={item.photos[0]} alt={item.name} />
                    ) : (
                      <span className={styles.itemEmoji}>🌱</span>
                    )}
                    {item.category && (
                      <span className={styles.itemCategoryBadge}>{item.category}</span>
                    )}
                  </div>
                  <div className={styles.itemInfo}>
                    <div className={styles.itemName}>{item.name}</div>
                    {item.default_price_usd != null && (
                      <div className={styles.itemPrice}>
                        ${item.default_price_usd.toFixed(2)} / {item.default_unit || 'each'}
                      </div>
                    )}
                    <div className={styles.inventoryBar}>
                      <div className={styles.inventoryBarTrack}>
                        <div
                          className={`${styles.inventoryBarFill} ${getInventoryBarClass(item)}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <div className={styles.inventoryLabel}>
                        <span>{item.allocated_inventory || 0} allocated</span>
                        <span>{available} available</span>
                      </div>
                    </div>
                    {(item.stand_count || 0) > 0 && (
                      <span className={styles.standsBadge}>
                        🏪 {item.stand_count} stand{item.stand_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className={styles.itemActions}>
                    <button className={styles.actionBtn} onClick={() => handleEditItem(item)}>
                      ✏️ Edit
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleAllocate(item)}
                      disabled={available <= 0}
                      style={{ opacity: available <= 0 ? 0.5 : 1 }}
                    >
                      🏪 Add to Booth
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleDeleteItem(item)}
                      style={{ color: '#dc2626' }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modalPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {editingItem ? 'Edit Catalog Item' : 'Add Catalog Item'}
              </h2>
              <button className={styles.modalCloseBtn} onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              {/* Photos */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Photos</label>
                {formPhotos.length > 0 ? (
                  <div className={styles.photoPreviewRow}>
                    {formPhotos.map((photo, i) => (
                      <div key={i} className={styles.photoPreview}>
                        <img src={photo} alt="" />
                        <button className={styles.photoRemoveBtn} onClick={() => removePhoto(i)}>✕</button>
                      </div>
                    ))}
                    {formPhotos.length < 5 && (
                      <button
                        className={styles.photoUploadArea}
                        style={{ width: 72, height: 72, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <span style={{ fontSize: 24 }}>+</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className={styles.photoUploadArea} onClick={() => fileInputRef.current?.click()}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                    <div style={{ fontSize: 14, color: '#94a3b8' }}>Tap to upload photos</div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file" accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handlePhotoUpload}
                />
              </div>

              {/* Name */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Name *</label>
                <input
                  className={styles.input}
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Organic Heirloom Tomatoes"
                />
              </div>

              {/* Category */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Category *</label>
                <select
                  className={styles.select}
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                >
                  <option value="">Select Category</option>
                  {categories.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className={styles.formGroup}>
                <label className={styles.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Description <span className={styles.optional}>(optional)</span></span>
                  <button
                    type="button"
                    disabled={generatingDesc || !formName.trim()}
                    onClick={handleGenerateDescription}
                    style={{
                      padding: '4px 12px', borderRadius: 9999, border: '1px solid var(--green-300)',
                      background: 'var(--green-50)', color: 'var(--green-700)', fontSize: 12, fontWeight: 600,
                      cursor: generatingDesc || !formName.trim() ? 'not-allowed' : 'pointer',
                      opacity: generatingDesc || !formName.trim() ? 0.5 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {generatingDesc ? '⏳ Generating...' : '✨ AI Write'}
                  </button>
                </label>
                <textarea
                  className={styles.textarea}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Tell buyers about this product — or tap ✨ AI Write"
                  rows={3}
                />
              </div>

              {/* Price & Unit */}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Default Price</label>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    min="0"
                    value={formPrice}
                    onChange={e => setFormPrice(e.target.value)}
                    placeholder="0.00"
                  />
                  {suggestingPrice && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12, color: 'var(--gray-500)' }}>
                      <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--green-300)', borderTopColor: 'var(--green-600)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                      Looking up prices…
                    </div>
                  )}
                  {suggestedPrice && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormPrice(suggestedPrice.price_usd.toString())
                        setFormUnit(suggestedPrice.unit)
                      }}
                      style={{
                        marginTop: 6, padding: '6px 12px', background: 'var(--green-50)',
                        border: '1px solid var(--green-200)', borderRadius: 6,
                        fontSize: 12, color: 'var(--green-800)', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      💡 {suggestedPrice.source === 'neighborhood_average' ? 'Avg nearby' : 'Suggested'}: ${suggestedPrice.price_usd.toFixed(2)}/{suggestedPrice.unit} — tap to use
                    </button>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Unit</label>
                  <select
                    className={styles.select}
                    value={formUnit}
                    onChange={e => setFormUnit(e.target.value)}
                  >
                    {UNITS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Total Inventory */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Total Inventory</label>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  value={formInventory}
                  onChange={e => setFormInventory(e.target.value)}
                  placeholder="e.g. 100"
                />
              </div>

              {/* Variety */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Variety <span className={styles.optional}>(optional)</span></label>
                <input
                  className={styles.input}
                  value={formVariety}
                  onChange={e => setFormVariety(e.target.value)}
                  placeholder="e.g. Cherokee Purple, Gala"
                />
              </div>

              {/* Growing Method */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Growing Method <span className={styles.optional}>(optional)</span></label>
                <select
                  className={styles.select}
                  value={formGrowingMethod}
                  onChange={e => setFormGrowingMethod(e.target.value)}
                >
                  {GROWING_METHODS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Certifications */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Certifications <span className={styles.optional}>(optional)</span></label>
                <div className={styles.certGrid}>
                  {CERTIFICATIONS.map(cert => (
                    <button
                      key={cert.id}
                      type="button"
                      className={`${styles.certChip} ${formCertifications.includes(cert.id) ? styles.certChipActive : ''}`}
                      onClick={() => toggleCertification(cert.id)}
                    >
                      {cert.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Harvest Date */}
              <div className={styles.formGroup}>
                <label className={styles.label}>🌾 Harvest Date <span className={styles.optional}>(optional)</span></label>
                <input
                  className={styles.input}
                  type="date"
                  value={formHarvestDate}
                  onChange={e => setFormHarvestDate(e.target.value)}
                />
              </div>

              {/* Shelf Life & Storage */}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Shelf Life <span className={styles.optional}>(days)</span></label>
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    value={formShelfLife}
                    onChange={e => setFormShelfLife(e.target.value)}
                    placeholder="e.g. 7"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Storage <span className={styles.optional}>(optional)</span></label>
                  <input
                    className={styles.input}
                    value={formStorageInstructions}
                    onChange={e => setFormStorageInstructions(e.target.value)}
                    placeholder="e.g. Refrigerate"
                  />
                </div>
              </div>

              {formError && <div className={styles.errorText}>{formError}</div>}

              <button
                className={styles.submitBtn}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : (editingItem ? 'Save Changes' : '🌱 Add to Catalog')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Allocation Modal */}
      {showAllocModal && allocItem && (
        <div className={styles.modalOverlay} onClick={() => setShowAllocModal(false)}>
          <div className={styles.modalPanel} onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>🏪 Add to Booth</h2>
              <button className={styles.modalCloseBtn} onClick={() => setShowAllocModal(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              {/* Item preview */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', marginBottom: 20,
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 10, overflow: 'hidden',
                  background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {allocItem.photos[0] ? (
                    <img src={allocItem.photos[0]} alt={allocItem.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 22 }}>📦</span>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#166534' }}>{allocItem.name}</div>
                  <div style={{ fontSize: 12, color: '#16a34a' }}>
                    {allocItem.total_inventory - (allocItem.allocated_inventory || 0)} available of {allocItem.total_inventory} total
                  </div>
                </div>
              </div>

              {/* Booth list */}
              {booths.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#6b7280' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🏪</div>
                  <div>No booths found. Create a booth first.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {booths.map(booth => {
                    const available = allocItem.total_inventory - (allocItem.allocated_inventory || 0)
                    const qty = allocSelections[booth.id] || ''
                    const disabled = !booth.hasWindows
                    return (
                      <div key={booth.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                        border: `1px solid ${disabled ? '#f3f4f6' : '#e5e7eb'}`, borderRadius: 12,
                        background: disabled ? '#f9fafb' : '#fff',
                        opacity: disabled ? 0.6 : 1,
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: disabled ? '#9ca3af' : '#1f2937' }}>🏪 {booth.name}</div>
                          {disabled && (
                            <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>⚠️ Set up fulfillment windows first</div>
                          )}
                        </div>
                        {!disabled && (
                          <>
                            <input
                              type="number"
                              min="1"
                              max={available}
                              value={qty}
                              onChange={e => setAllocSelections(prev => ({ ...prev, [booth.id]: e.target.value }))}
                              placeholder="Qty"
                              style={{
                                width: 70, padding: '8px 10px', fontSize: 14, borderRadius: 8,
                                border: '1px solid #d1d5db', textAlign: 'center',
                              }}
                              disabled={available <= 0}
                            />
                            <button
                              onClick={() => handleAllocateToBooth(booth.id)}
                              disabled={!qty || parseInt(qty) < 1 || allocatingBooth === booth.id || available <= 0}
                              style={{
                                padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                                border: 'none', cursor: 'pointer',
                                background: (!qty || parseInt(qty) < 1 || allocatingBooth === booth.id) ? '#e5e7eb' : 'var(--green-600, #16a34a)',
                                color: (!qty || parseInt(qty) < 1) ? '#9ca3af' : '#fff',
                              }}
                            >
                              {allocatingBooth === booth.id ? '...' : 'List'}
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <button
                style={{
                  marginTop: 20, width: '100%', padding: '12px', fontSize: 14,
                  color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb',
                  borderRadius: 10, cursor: 'pointer', fontWeight: 500,
                }}
                onClick={() => setShowAllocModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={() => !deleting && setDeleteTarget(null)}>
          <div className={styles.modalPanel} onClick={e => e.stopPropagation()} style={{ maxWidth: 420, borderRadius: 24 }}>
            <div style={{ padding: '28px 24px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🗑️</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 8 }}>
                Delete &ldquo;{deleteTarget.name}&rdquo;?
              </h3>
              <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 24, lineHeight: 1.5 }}>
                This will permanently remove it from your catalog and all booth allocations. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--gray-200)',
                    background: '#fff', color: 'var(--gray-700)', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12, border: 'none',
                    background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 600,
                    cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          background: '#1f2937', color: '#fff', padding: '12px 20px', borderRadius: 12,
          fontSize: 13, fontWeight: 500, maxWidth: '90vw', textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 200,
          animation: 'slideUp 0.3s ease',
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}
