'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import { useSubscription } from '../../../lib/useSubscription'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { useErrorToast } from '../../components/ErrorToast'
import { ProCarousel } from '../../components/ProCarousel'
import { GrowBotAlertPreferences } from '../../components/GrowBotAlertPreferences'
import { useProEnabled } from '../../../lib/useProEnabled'

/* ───────────────────────────────────────────────────────
   Types
   ─────────────────────────────────────────────────────── */
interface ChannelConfig { enabled: boolean; delayMinutes: number }
type ChannelKey = 'messenger' | 'dm' | 'instagram' | 'comments'

/* ───────────────────────────────────────────────────────
   Inner page component
   ─────────────────────────────────────────────────────── */
function ProManagePageInner() {
  const router = useRouter()
  const { user, loading: authLoading, isAuthenticated } = useAuth()
  const { isPro, plan, status, loading: subLoading } = useSubscription()
  const { showSuccess } = useErrorToast()
  const supabase = createClient()

  /* ── Local state ── */
  const [proInterestSending, setProInterestSending] = useState(false)
  const [proInterestSent, setProInterestSent] = useState(false)

  // Seller connections
  const [fbConn, setFbConn] = useState<any>(null)
  const [googleConn, setGoogleConn] = useState<any>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [savingField, setSavingField] = useState<string | null>(null)

  // FB / Google connect flow
  const [connecting, setConnecting] = useState('')
  const [connectError, setConnectError] = useState('')
  const [disconnecting, setDisconnecting] = useState('')
  const [disconnectTarget, setDisconnectTarget] = useState<'fb' | 'google' | 'instagram' | null>(null)

  // Catalog sync
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null)



  // FB Catalog selector
  const [fbCatalogs, setFbCatalogs] = useState<Array<{ id: string; name: string; product_count?: number }>>([])
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null)
  const [catalogsLoading, setCatalogsLoading] = useState(false)
  const [catalogSaving, setCatalogSaving] = useState(false)

  // GrowBot channels
  const [botChannels, setBotChannels] = useState<Record<ChannelKey, ChannelConfig>>({
    messenger: { enabled: true, delayMinutes: 0 },
    instagram: { enabled: true, delayMinutes: 0 },
    comments: { enabled: true, delayMinutes: 0 },
    dm: { enabled: true, delayMinutes: 5 },
  })
  const [botInstructions, setBotInstructions] = useState('')
  const [botSaving, setBotSaving] = useState(false)
  const [botSaved, setBotSaved] = useState(false)

  /* ── Load all data ── */
  useEffect(() => {
    if (!user) return
    const load = async () => {
      const [fbRes, googleRes, profileRes] = await Promise.all([
        supabase.from('seller_fb_connections').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('seller_google_connections').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('profiles').select('bot_instructions, bot_channels, zip_code').eq('id', user.id).single(),
      ])
      setFbConn(fbRes.data)
      setGoogleConn(googleRes.data)
      if (profileRes.data) {
        setBotInstructions(profileRes.data.bot_instructions || '')
        if (profileRes.data.bot_channels) {
          const bc = profileRes.data.bot_channels as Record<string, any>
          setBotChannels(prev => ({
            messenger: { ...prev.messenger, ...bc.messenger },
            instagram: { ...prev.instagram, ...bc.instagram },
            comments: { ...prev.comments, ...bc.comments },
            dm: { ...prev.dm, ...bc.dm },
          }))
        }
      }
      // Load selected catalog ID from booth_fb_catalogs
      if (fbRes.data?.id) {
        const { data: boothCatalog } = await supabase
          .from('booth_fb_catalogs')
          .select('fb_catalog_id')
          .eq('connection_id', fbRes.data.id)
          .maybeSingle()
        if (boothCatalog?.fb_catalog_id) setSelectedCatalogId(boothCatalog.fb_catalog_id)
      }
      setDataLoading(false)
    }
    load()
  }, [user])

  // Fetch FB catalogs when connected
  useEffect(() => {
    if (!fbConn?.fb_page_id || !fbConn?.fb_page_access_token || fbConn?.status === 'disconnected') return
    const fetchCatalogs = async () => {
      setCatalogsLoading(true)
      try {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${fbConn.fb_page_id}/product_catalogs?fields=id,name,product_count&access_token=${fbConn.fb_page_access_token}`
        )
        const data = await res.json()
        if (data?.data) setFbCatalogs(data.data)
      } catch (e) { console.error('Failed to fetch catalogs', e) }
      setCatalogsLoading(false)
    }
    fetchCatalogs()
  }, [fbConn?.fb_page_id])

  /* ── Helpers ── */
  const isElite = plan === 'elite'

  const toggleFbField = async (field: string, currentValue: boolean) => {
    const newVal = !currentValue
    setSavingField(field)
    setFbConn((prev: any) => ({ ...prev, [field]: newVal }))
    await supabase.from('seller_fb_connections').update({ [field]: newVal }).eq('user_id', user!.id)
    setSavingField(null)
  }

  const toggleGoogleField = async (field: string, currentValue: boolean) => {
    const newVal = !currentValue
    setSavingField(field)
    setGoogleConn((prev: any) => ({ ...prev, [field]: newVal }))
    await supabase.from('seller_google_connections').update({ [field]: newVal }).eq('user_id', user!.id)
    setSavingField(null)
  }

  const updateBotChannel = (key: ChannelKey, patch: Partial<ChannelConfig>) => {
    setBotChannels(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  const handleBotSave = async () => {
    setBotSaving(true)
    await supabase.from('profiles').update({ bot_instructions: botInstructions || null, bot_channels: botChannels }).eq('id', user!.id)
    setBotSaving(false)
    setBotSaved(true)
    setTimeout(() => setBotSaved(false), 2000)
  }

  const handleFbConnect = async () => {
    setConnecting('fb')
    setConnectError('')
    try {
      const { data, error } = await supabase.functions.invoke('connect-facebook', { body: { return_path: '/pro-manage' } })
      if (error || !data?.url) { setConnectError('Failed to start Facebook connection.'); setConnecting(''); return }
      window.location.href = data.url
    } catch { setConnectError('Something went wrong.'); setConnecting('') }
  }

  const handleFbDisconnect = async () => {
    setDisconnecting('fb')
    await supabase.from('seller_fb_connections').update({
      status: 'disconnected',
      auto_sync_enabled: false,
      ig_business_account_id: null,
      ig_username: null,
      ig_access_token: null,
      ig_messenger_enabled: false,
      ig_auto_post_enabled: false,
    }).eq('user_id', user!.id)
    setFbConn(null)
    setDisconnecting('')
    setDisconnectTarget(null)
  }

  const handleGoogleConnect = async () => {
    setConnecting('google')
    setConnectError('')
    try {
      const { data, error } = await supabase.functions.invoke('connect-google', { body: { return_path: '/pro-manage' } })
      if (error || !data?.url) { setConnectError('Failed to start Google connection.'); setConnecting(''); return }
      window.location.href = data.url
    } catch { setConnectError('Something went wrong.'); setConnecting('') }
  }

  const handleGoogleDisconnect = async () => {
    setDisconnecting('google')
    await supabase.from('seller_google_connections').delete().eq('user_id', user!.id)
    setGoogleConn(null)
    setDisconnecting('')
    setDisconnectTarget(null)
  }

  const handleIgConnect = async () => {
    if (!fbConn?.fb_page_id) {
      setConnectError('Connect Facebook first to link your Instagram.')
      return
    }
    setConnecting('instagram')
    setConnectError('')
    try {
      // Trigger Facebook OAuth with Instagram scopes (incremental auth)
      const { data, error } = await supabase.functions.invoke('connect-facebook', {
        body: { return_path: '/pro-manage', include_instagram: true }
      })
      if (error || !data?.url) { setConnectError('Failed to start Instagram connection.'); setConnecting(''); return }
      window.location.href = data.url
    } catch { setConnectError('Something went wrong.'); setConnecting('') }
  }

  const handleIgDisconnect = async () => {
    setDisconnecting('instagram')
    await supabase.from('seller_fb_connections').update({
      ig_business_account_id: null,
      ig_username: null,
      ig_access_token: null,
      ig_messenger_enabled: false,
      ig_auto_post_enabled: false,
    }).eq('user_id', user!.id)
    setFbConn((prev: any) => prev ? { ...prev, ig_business_account_id: null, ig_username: null, ig_messenger_enabled: false, ig_auto_post_enabled: false } : prev)
    setDisconnecting('')
    setDisconnectTarget(null)
  }



  /* ── Auth guard ── */
  const proEnabled = useProEnabled()
  if (authLoading || subLoading) return <LoadingSpinner message="Loading…" />
  if (!proEnabled || !isPro) { router.replace('/'); return <LoadingSpinner message="Redirecting…" /> }
  if (!isAuthenticated || !user) { router.replace('/login?redirect=/pro-manage'); return <LoadingSpinner message="Redirecting…" /> }

  /* ── Lite view ── */
  if (!isPro) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', color: '#111827' }}>Manage Features</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Unlock powerful growth tools to scale your produce sales</p>
        </div>
        <div style={{ marginBottom: 28 }}><ProCarousel compact /></div>
        <div style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', borderRadius: 20, padding: 24, border: '1px solid #a7f3d0' }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#065f46', margin: '0 0 16px', textAlign: 'center' }}>⚡ Learn About Pro or Elite Features</h3>
          <button onClick={async () => { setProInterestSending(true); try { await supabase.functions.invoke('send-pro-interest-email', { body: {} }); showSuccess('📧 Details sent!'); setProInterestSent(true) } catch {} finally { setProInterestSending(false) } }} disabled={proInterestSent || proInterestSending} style={{ padding: '14px 28px', borderRadius: 14, background: proInterestSent ? '#ecfdf5' : 'linear-gradient(135deg, #059669, #047857)', color: proInterestSent ? '#047857' : 'white', fontWeight: 800, fontSize: 15, cursor: proInterestSent ? 'not-allowed' : 'pointer', width: '100%', border: proInterestSent ? '1px solid #a7f3d0' : 'none' }}>
            {proInterestSending ? 'Sending…' : proInterestSent ? 'Guide sent — check your inbox! 📧' : 'Email me about Pro & Elite capabilities →'}
          </button>
        </div>
      </div>
    )
  }

  /* ── Pro/Elite view ── */
  if (dataLoading) return <LoadingSpinner message="Loading features…" />

  const fbConnected = fbConn && fbConn.status === 'connected'
  const igConnected = !!fbConn?.ig_business_account_id
  const googleConnected = !!googleConn?.google_location_id

  return (
    <>
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>Manage Features</h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Your features and settings</p>
      </div>

      {/* Status card */}
      <div style={{ background: isElite ? 'linear-gradient(135deg, #1e3a8a, #3b82f6)' : 'linear-gradient(135deg, #065f46, #059669)', borderRadius: 16, padding: 20, color: 'white', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{isElite ? '🚜 CasaGrown Elite' : '🚜 CasaGrown Pro'}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.2)' }}>{status === 'trialing' ? '🎉 Trial' : '✓ Active'}</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          SECTION 1: CasaGrown (Pro + Elite)
         ═══════════════════════════════════════════ */}
      <SectionHeader emoji="🌱" title="CasaGrown" />
      <SectionCard>
        <BotChannelToggle
          icon="✉️" label="GrowBot Auto-Reply — CasaGrown DMs"
          desc="Auto-reply to direct messages on CasaGrown"
          config={botChannels.dm}
          onToggle={(enabled) => updateBotChannel('dm', { enabled })}
          onDelay={(d) => updateBotChannel('dm', { delayMinutes: d })}
          hasDelay
        />
      </SectionCard>

      {/* ═══════════════════════════════════════════
          SECTION 2: Facebook (Pro + Elite)
         ═══════════════════════════════════════════ */}
      <SectionHeader emoji="📘" title="Facebook" />
      <SectionCard>
        {/* Connect */}
        {!fbConnected ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: '#6b7280' }}>Connect your Facebook Page to get started.</p>
            <button onClick={handleFbConnect} disabled={connecting === 'fb'} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1877f2', color: 'white', fontWeight: 600, fontSize: 14, cursor: connecting === 'fb' ? 'wait' : 'pointer', opacity: connecting === 'fb' ? 0.7 : 1 }}>
              {connecting === 'fb' ? '🔗 Connecting…' : '🔗 Connect Facebook'}
            </button>
            {connectError && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>⚠️ {connectError}</p>}
          </div>
        ) : (
          <>
            {/* Connection status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{fbConn.fb_page_name || 'Facebook Page'}</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <StatusBadge connected />
                <button onClick={() => setDisconnectTarget('fb')} disabled={disconnecting === 'fb'} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Disconnect</button>
              </div>
            </div>

            <Divider />


            <ToggleRow label="📣 Post daily listings" desc="GrowBot posts your available products to your Facebook Page — never to your personal profile." value={!!fbConn.auto_post_enabled} saving={savingField === 'auto_post_enabled'} onToggle={() => toggleFbField('auto_post_enabled', !!fbConn.auto_post_enabled)} />
            {fbConn.auto_post_enabled && (
              <div style={{ marginLeft: 54 }}>
                <ToggleRow label="🎬 Include video posts" desc="Generate AI video content from your product photos." value={!!fbConn.video_posts_enabled} saving={savingField === 'video_posts_enabled'} onToggle={() => toggleFbField('video_posts_enabled', !!fbConn.video_posts_enabled)} />
              </div>
            )}

            <Divider />

            {/* GrowBot — Messenger */}
            <BotChannelToggle
              icon="💬" label="GrowBot Auto-Reply — Messenger"
              desc="Auto-reply to buyers messaging your Facebook Page"
              config={botChannels.messenger}
              onToggle={(enabled) => updateBotChannel('messenger', { enabled })}
              onDelay={(d) => updateBotChannel('messenger', { delayMinutes: d })}
              hasDelay
            />
            {/* Scan comments */}
            <BotChannelToggle
              icon="🔍" label="Scan Comments & Respond"
              desc="Auto-reply to Facebook comments and send checkout DMs on buying intent"
              config={botChannels.comments}
              onToggle={(enabled) => updateBotChannel('comments', { enabled })}
              onDelay={() => {}}
              hasDelay={false}
            />
          </>
        )}
      </SectionCard>

      {/* ═══════════════════════════════════════════
          SECTION 3: Instagram (Elite only)
         ═══════════════════════════════════════════ */}
      {isElite && (
        <>
          <SectionHeader emoji="📸" title="Instagram" />
          <SectionCard>
            {!igConnected ? (
              <div style={{ padding: '8px 0', textAlign: 'center' }}>
                <p style={{ margin: '0 0 8px', fontSize: 14, color: '#6b7280' }}>{fbConnected ? 'Link your Instagram Business account to sync products and enable auto-replies.' : 'Connect Facebook first, then link Instagram.'}</p>
                <button
                  onClick={handleIgConnect}
                  disabled={!fbConnected || connecting === 'instagram'}
                  style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: !fbConnected ? '#d1d5db' : 'linear-gradient(135deg, #E1306C, #C13584)', color: 'white', fontSize: 14, fontWeight: 600, cursor: !fbConnected ? 'not-allowed' : 'pointer' }}
                >
                  {connecting === 'instagram' ? '⏳ Connecting…' : '📸 Connect Instagram'}
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>@{fbConn.ig_username || 'Instagram'}</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <StatusBadge connected />
                    <button onClick={() => setDisconnectTarget('instagram')} disabled={disconnecting === 'instagram'} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Disconnect</button>
                  </div>
                </div>
                <Divider />

                <ToggleRow label="📣 Post daily listings" desc="GrowBot posts daily to your Instagram Business or Creator account — never to your personal feed." value={!!fbConn.ig_auto_post_enabled} saving={savingField === 'ig_auto_post_enabled'} onToggle={() => toggleFbField('ig_auto_post_enabled', !!fbConn.ig_auto_post_enabled)} />
                {fbConn.ig_auto_post_enabled && (
                  <div style={{ marginLeft: 54 }}>
                    <ToggleRow label="🎬 Include video posts" desc="Generate AI Reels from your product photos." value={!!fbConn.ig_video_posts_enabled} saving={savingField === 'ig_video_posts_enabled'} onToggle={() => toggleFbField('ig_video_posts_enabled', !!fbConn.ig_video_posts_enabled)} />
                  </div>
                )}
                <Divider />
                <BotChannelToggle
                  icon="📸" label="GrowBot Auto-Reply — Instagram DMs"
                  desc="Auto-reply to buyers messaging your Instagram"
                  config={botChannels.instagram}
                  onToggle={(enabled) => updateBotChannel('instagram', { enabled })}
                  onDelay={(d) => updateBotChannel('instagram', { delayMinutes: d })}
                  hasDelay
                />
                <BotChannelToggle
                  icon="🔍" label="Scan Comments & Respond"
                  desc="Auto-reply to Instagram comments and send checkout DMs"
                  config={botChannels.comments}
                  onToggle={(enabled) => updateBotChannel('comments', { enabled })}
                  onDelay={() => {}}
                  hasDelay={false}
                />
              </>
            )}
          </SectionCard>
        </>
      )}



      {/* ═══════════════════════════════════════════
          SECTION 5: Google Places (Elite only)
         ═══════════════════════════════════════════ */}
      {isElite && (
        <>
          <SectionHeader emoji="📍" title="Google Business Profile" />
          <SectionCard>
            {!googleConnected ? (
              <div>
                {/* Setup guide */}
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #d1fae5', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#065f46', marginBottom: 8 }}>📖 How Google Business Profile works with CasaGrown</div>
                  <div style={{ fontSize: 12, color: '#065f46', lineHeight: 1.7 }}>
                    <div style={{ marginBottom: 4 }}>When connected, your CasaGrown product catalog automatically syncs to your Google Business Profile so customers searching for local produce on Google Maps and Search can find you.</div>
                  </div>
                </div>

                {/* Step-by-step: create profile if needed */}
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e40af', marginBottom: 8 }}>🆕 Don&apos;t have a Google Business Profile?</div>
                  <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.8 }}>
                    <div style={{ marginBottom: 4, paddingLeft: 4 }}><strong>1.</strong> Go to <a href="https://business.google.com/create" target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af', fontWeight: 600, textDecoration: 'underline' }}>business.google.com/create</a></div>
                    <div style={{ marginBottom: 4, paddingLeft: 4 }}><strong>2.</strong> Enter your farm or business name</div>
                    <div style={{ marginBottom: 4, paddingLeft: 4 }}><strong>3.</strong> Choose category: <strong>&quot;Farm&quot;</strong>, <strong>&quot;Farmers Market&quot;</strong>, or <strong>&quot;Produce Market&quot;</strong></div>
                    <div style={{ marginBottom: 4, paddingLeft: 4 }}><strong>4.</strong> Add your address or service area (delivery zone)</div>
                    <div style={{ marginBottom: 4, paddingLeft: 4 }}><strong>5.</strong> Google will send a verification postcard or call — this takes 3–5 days</div>
                    <div style={{ paddingLeft: 4 }}><strong>6.</strong> Once verified, come back here and click <strong>&quot;Connect&quot;</strong></div>
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8, fontStyle: 'italic' }}>
                    💡 Setting up takes about 5 minutes. Google verification takes 3–5 business days. Need help? Contact us and we&apos;ll walk you through it.
                  </div>
                </div>

                {/* Connect button for users who already have a profile */}
                <div style={{ textAlign: 'center' }}>
                  <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Already have a Google Business Profile?</p>
                  <button onClick={handleGoogleConnect} disabled={connecting === 'google'} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#4285f4', color: 'white', fontWeight: 600, fontSize: 14, cursor: connecting === 'google' ? 'wait' : 'pointer', opacity: connecting === 'google' ? 0.7 : 1 }}>
                    {connecting === 'google' ? '🔗 Connecting…' : '🔗 Connect My Google Business'}
                  </button>
                  {connectError && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>⚠️ {connectError}</p>}
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{googleConn.google_location_name || 'Google Business'}</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <StatusBadge connected />
                    <button onClick={() => setDisconnectTarget('google')} disabled={disconnecting === 'google'} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Disconnect</button>
                  </div>
                </div>
                <Divider />
                <ToggleRow label="📦 Sync products to Google catalog" desc="Keep your Google Business product catalog in sync." value={!!googleConn.auto_sync_catalog} saving={savingField === 'auto_sync_catalog'} onToggle={() => toggleGoogleField('auto_sync_catalog', !!googleConn.auto_sync_catalog)} />
              </>
            )}
          </SectionCard>
        </>
      )}

      {/* ═══════════════════════════════════════════
          SECTION 6: Notification Preferences (Pro + Elite)
         ═══════════════════════════════════════════ */}
      <SectionHeader emoji="🔔" title="Notification Preferences" />
      <GrowBotAlertPreferences />

      {/* ═══════════════════════════════════════════
          GrowBot Custom Instructions + Save
         ═══════════════════════════════════════════ */}
      <SectionHeader emoji="🤖" title="GrowBot Custom Instructions" />
      <SectionCard>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
          Write any special instructions in <strong>plain English</strong> for GrowBot to follow when replying to customers. These rules apply across all channels (Facebook, Instagram, WhatsApp, CasaGrown).
        </p>
        <textarea value={botInstructions} onChange={(e) => setBotInstructions(e.target.value)}
          placeholder={"Examples of instructions you can write:\n\n• We only do pickups on Saturdays at the Riverside Farmers Market, 8am–1pm.\n• We don't deliver on Sundays.\n• If someone asks about organic certification, tell them we are USDA Certified Organic.\n• Always greet customers by name if available.\n• For wholesale orders over $100, ask them to call me directly at (555) 123-4567."}
          style={{ width: '100%', minHeight: 100, padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', background: '#f9fafb' }} />
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>Leave blank if you have no special instructions — GrowBot will use your product info and booth details automatically.</p>
        <button onClick={handleBotSave} disabled={botSaving} style={{ marginTop: 12, padding: '12px', borderRadius: 10, border: 'none', background: botSaved ? '#059669' : 'linear-gradient(135deg, #065f46, #059669)', color: 'white', fontSize: 14, fontWeight: 700, cursor: botSaving ? 'wait' : 'pointer', width: '100%' }}>
          {botSaving ? 'Saving…' : botSaved ? '✓ Saved!' : 'Save GrowBot Settings'}
        </button>
      </SectionCard>

      {/* Plan management */}
      <button onClick={() => router.push('/manage-plan')} style={{ marginTop: 24, padding: '12px 20px', borderRadius: 12, background: isElite ? 'linear-gradient(135deg, #1e3a8a, #3b82f6)' : 'linear-gradient(135deg, #065f46, #059669)', border: 'none', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%' }}>
        Manage My Plan →
      </button>
    </div>

      {/* Disconnect Confirmation Modal */}
      {disconnectTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setDisconnectTarget(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '90%', maxWidth: 400, background: '#fff', borderRadius: 24,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
          }}>
            <div style={{ padding: '28px 24px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>
                {disconnectTarget === 'fb' ? '📘' : disconnectTarget === 'instagram' ? '📸' : '🔍'}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
                Disconnect {disconnectTarget === 'fb' ? 'Facebook' : disconnectTarget === 'instagram' ? 'Instagram' : 'Google Business'}?
              </h3>
              <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>
                {disconnectTarget === 'fb' && 'Catalog sync, auto-posting, and Messenger auto-replies will stop. You can reconnect anytime.'}
                {disconnectTarget === 'instagram' && 'Instagram catalog sync, auto-posting, and DM auto-replies will be disabled. You can reconnect anytime.'}
                {disconnectTarget === 'google' && 'Google Business syncing and auto-posting will stop. You can reconnect anytime.'}
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setDisconnectTarget(null)}
                  disabled={!!disconnecting}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >Cancel</button>
                <button
                  onClick={() => {
                    if (disconnectTarget === 'fb') handleFbDisconnect()
                    else if (disconnectTarget === 'instagram') handleIgDisconnect()
                    else if (disconnectTarget === 'google') handleGoogleDisconnect()
                  }}
                  disabled={!!disconnecting}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 600, cursor: disconnecting ? 'not-allowed' : 'pointer', opacity: disconnecting ? 0.7 : 1 }}
                >{disconnecting ? 'Disconnecting…' : 'Disconnect'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ───────────────────────────────────────────────────────
   Reusable sub-components
   ─────────────────────────────────────────────────────── */

function SectionHeader({ emoji, title, badge }: { emoji: string; title: string; badge?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 10 }}>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>{title}</h2>
      {badge && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#eff6ff', color: '#2563eb', fontWeight: 600 }}>{badge}</span>}
    </div>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>{children}</div>
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: connected ? '#dcfce7' : '#f3f4f6', color: connected ? '#15803d' : '#9ca3af' }}>
      {connected ? '✓ Connected' : 'Not connected'}
    </span>
  )
}

function Divider() {
  return <div style={{ borderTop: '1px solid #f3f4f6', margin: '12px 0' }} />
}

function ToggleRow({ label, desc, value, saving, onToggle }: { label: string; desc: string; value: boolean; saving?: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
      <button type="button" role="switch" aria-checked={value} onClick={onToggle} style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', background: value ? '#22c55e' : '#d1d5db', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s', padding: 0, marginTop: 1 }}>
        <span style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
          {label}
          {saving && <span style={{ marginLeft: 6, fontSize: 11, color: '#9ca3af' }}>Saving…</span>}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  )
}

function BotChannelToggle({ icon, label, desc, config, onToggle, onDelay, hasDelay }: {
  icon: string; label: string; desc: string;
  config: ChannelConfig; onToggle: (enabled: boolean) => void; onDelay: (d: number) => void; hasDelay: boolean
}) {
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: config.enabled ? '2px solid #059669' : '1px solid #e5e7eb', background: config.enabled ? '#f0fdf4' : '#fafafa', transition: 'all 0.2s', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: config.enabled ? '#065f46' : '#6b7280' }}>{label}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{desc}</div>
        </div>
        <div onClick={() => onToggle(!config.enabled)} style={{ width: 40, height: 22, borderRadius: 11, cursor: 'pointer', background: config.enabled ? '#059669' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: config.enabled ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </div>
      </div>
      {config.enabled && hasDelay && (
        <div style={{ padding: '0 12px 10px', borderTop: '1px solid rgba(5,150,105,0.15)' }}>
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
              Wait before auto-reply: <strong style={{ color: '#059669' }}>{config.delayMinutes === 0 ? 'Instant' : `${config.delayMinutes} min`}</strong>
            </label>
            <input type="range" min={0} max={15} step={1} value={config.delayMinutes} onChange={(e) => onDelay(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#059669', marginTop: 4 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af' }}>
              <span>Instant</span><span>15 min</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────────────────────────────────
   Export with Suspense
   ─────────────────────────────────────────────────────── */
export default function ProManagePage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <ProManagePageInner />
    </Suspense>
  )
}
