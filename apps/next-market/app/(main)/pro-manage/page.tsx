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
type ChannelKey = 'messenger' | 'dm' | 'instagram' | 'whatsapp' | 'comments'

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
  const [disconnectTarget, setDisconnectTarget] = useState<'fb' | 'google' | 'instagram' | 'whatsapp' | null>(null)

  // Catalog sync
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null)

  // WhatsApp phone
  const [waPhoneInput, setWaPhoneInput] = useState('')
  const [waSaving, setWaSaving] = useState(false)
  const [waCopied, setWaCopied] = useState(false)
  const [waZipCode, setWaZipCode] = useState('')
  const [waProvisioning, setWaProvisioning] = useState(false)
  const [waProvisionError, setWaProvisionError] = useState('')

  // GrowBot channels
  const [botChannels, setBotChannels] = useState<Record<ChannelKey, ChannelConfig>>({
    messenger: { enabled: true, delayMinutes: 0 },
    instagram: { enabled: true, delayMinutes: 0 },
    whatsapp: { enabled: true, delayMinutes: 0 },
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
      if (fbRes.data?.wa_display_phone) setWaPhoneInput(fbRes.data.wa_display_phone)
      if (profileRes.data) {
        setBotInstructions(profileRes.data.bot_instructions || '')
        if (profileRes.data.zip_code) setWaZipCode(profileRes.data.zip_code)
        if (profileRes.data.bot_channels) {
          const bc = profileRes.data.bot_channels as Record<string, any>
          setBotChannels(prev => ({
            messenger: { ...prev.messenger, ...bc.messenger },
            instagram: { ...prev.instagram, ...bc.instagram },
            whatsapp: { ...prev.whatsapp, ...bc.whatsapp },
            comments: { ...prev.comments, ...bc.comments },
            dm: { ...prev.dm, ...bc.dm },
          }))
        }
      }
      setDataLoading(false)
    }
    load()
  }, [user])

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
    await supabase.from('seller_fb_connections').update({ status: 'disconnected', auto_sync_enabled: false }).eq('user_id', user!.id)
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
    if (!fbConn?.fb_page_id || !fbConn?.fb_page_access_token) {
      setConnectError('Connect Facebook first to link your Instagram.')
      return
    }
    setConnecting('instagram')
    setConnectError('')
    try {
      // Fetch IG Business Account linked to the FB Page
      const res = await fetch(`https://graph.facebook.com/v21.0/${fbConn.fb_page_id}?fields=instagram_business_account{id,username,profile_picture_url}&access_token=${fbConn.fb_page_access_token}`)
      const data = await res.json()
      if (data?.instagram_business_account?.id) {
        const igId = data.instagram_business_account.id
        const igUsername = data.instagram_business_account.username || ''
        await supabase.from('seller_fb_connections').update({
          ig_business_account_id: igId,
          ig_username: igUsername,
          ig_messenger_enabled: true,
          ig_auto_post_enabled: true,
        }).eq('user_id', user!.id)
        setFbConn((prev: any) => prev ? { ...prev, ig_business_account_id: igId, ig_username: igUsername, ig_messenger_enabled: true, ig_auto_post_enabled: true } : prev)
      } else {
        setConnectError('No Instagram Business account found on your Facebook Page. Make sure your Instagram is linked in Facebook Page Settings → Linked Accounts.')
      }
    } catch (err: any) {
      setConnectError('Failed to fetch Instagram account: ' + (err.message || 'Unknown error'))
    } finally {
      setConnecting('')
    }
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

  const handleWaDisconnect = async () => {
    setDisconnecting('whatsapp')
    // Only disable features — keep the number for reconnecting later
    // Number is only released on subscription downgrade/cancellation
    await supabase.from('seller_fb_connections').update({
      wa_auto_reply_enabled: false,
    }).eq('user_id', user!.id)
    setFbConn((prev: any) => prev ? { ...prev, wa_auto_reply_enabled: false } : prev)
    setDisconnecting('')
    setDisconnectTarget(null)
  }

  const handleWaSavePhone = async () => {
    if (!waPhoneInput.trim()) return
    setWaSaving(true)
    await supabase.from('seller_fb_connections').update({ wa_display_phone: waPhoneInput.trim(), wa_number_source: 'seller_provided' }).eq('user_id', user!.id)
    setFbConn((prev: any) => ({ ...prev, wa_display_phone: waPhoneInput.trim(), wa_number_source: 'seller_provided' }))
    setWaSaving(false)
  }

  const handleWaSourceChange = async (source: string) => {
    setFbConn((prev: any) => ({ ...prev, wa_number_source: source }))
    await supabase.from('seller_fb_connections').update({ wa_number_source: source }).eq('user_id', user!.id)
  }

  /* ── Auth guard ── */
  const proEnabled = useProEnabled()
  if (authLoading || subLoading) return <LoadingSpinner message="Loading…" />
  if (!proEnabled) { router.replace('/'); return <LoadingSpinner message="Redirecting…" /> }
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
  const waConnected = !!fbConn?.wa_phone_number_id || !!fbConn?.wa_display_phone
  const googleConnected = !!googleConn?.google_location_id
  const isWaSellerProvided = fbConn?.wa_number_source === 'seller_provided'

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

            {/* Toggles */}
            <ToggleRow label="📦 Sync product catalog" desc="Sync your CasaGrown inventory to your Facebook Page shop — never your personal profile." value={!!fbConn.auto_sync_enabled} saving={savingField === 'auto_sync_enabled'} onToggle={() => toggleFbField('auto_sync_enabled', !!fbConn.auto_sync_enabled)} />
            {fbConn.auto_sync_enabled && (
              <>
                <div style={{ marginLeft: 54, marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 11, color: '#1e40af', lineHeight: 1.5 }}>
                  Your products appear in your <strong>Facebook Shop</strong> tab and are <strong>updated daily</strong> so customers always see current availability and prices.
                  {fbConn.last_sync_at && (
                    <div style={{ marginTop: 4, fontSize: 10, color: '#6b7280' }}>
                      Last sync: {new Date(fbConn.last_sync_at).toLocaleString()} · {fbConn.last_sync_product_count || 0} products synced
                    </div>
                  )}
                </div>
                <div style={{ marginLeft: 54, marginBottom: 8 }}>
                  <button
                    onClick={async () => {
                      setSyncing(true)
                      setSyncResult(null)
                      try {
                        const { data, error } = await supabase.functions.invoke('sync-facebook-catalog', { body: {} })
                        if (error) throw error
                        console.log('[SYNC RESULT]', data)
                        setSyncResult({ ok: true, message: `Synced ${data?.synced ?? 0} products to Facebook` })
                        // Refresh connection data to show updated last_sync_at
                        const { data: updated } = await supabase.from('seller_fb_connections').select('*').eq('user_id', user!.id).maybeSingle()
                        if (updated) setFbConn(updated)
                      } catch (err: any) {
                        setSyncResult({ ok: false, message: err.message || 'Sync failed' })
                      } finally {
                        setSyncing(false)
                        setTimeout(() => setSyncResult(null), 5000)
                      }
                    }}
                    disabled={syncing}
                    style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid #bfdbfe', background: syncing ? '#f3f4f6' : 'white', color: syncing ? '#9ca3af' : '#1e40af', fontSize: 12, fontWeight: 600, cursor: syncing ? 'wait' : 'pointer' }}
                  >
                    {syncing ? '⏳ Syncing…' : '🔄 Sync Now'}
                  </button>
                  {syncResult && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: syncResult.ok ? '#059669' : '#dc2626' }}>
                      {syncResult.ok ? '✅' : '⚠️'} {syncResult.message}
                    </span>
                  )}
                </div>
              </>
            )}
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
                <ToggleRow label="📦 Sync product catalog" desc="Sync your catalog to your Instagram Business or Creator account — not your personal profile." value={!!fbConn.ig_messenger_enabled} saving={savingField === 'ig_messenger_enabled'} onToggle={() => toggleFbField('ig_messenger_enabled', !!fbConn.ig_messenger_enabled)} />
                {fbConn.ig_messenger_enabled && (
                  <div style={{ marginLeft: 54, marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 11, color: '#1e40af', lineHeight: 1.5 }}>
                    Your products appear in your <strong>Instagram Shop</strong> tab and are <strong>updated daily</strong> so customers always see current availability.
                  </div>
                )}
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
          SECTION 4: WhatsApp (Elite only)
         ═══════════════════════════════════════════ */}
      {isElite && (
        <>
          <SectionHeader emoji="📱" title="WhatsApp" />
          <SectionCard>
            {fbConn?.wa_display_phone ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{fbConn.wa_display_phone}</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <StatusBadge connected />
                    <button onClick={() => setDisconnectTarget('whatsapp')} disabled={disconnecting === 'whatsapp'} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Disconnect</button>
                  </div>
                </div>
                <Divider />
              </>
            ) : (
              <div style={{ padding: '8px 0 12px', textAlign: 'center' }}>
                <p style={{ margin: '0 0 8px', fontSize: 14, color: '#6b7280' }}>Set up WhatsApp Business for auto-replies and order notifications.</p>
              </div>
            )}
            {/* Phone number config */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>WhatsApp Number</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', border: !isWaSellerProvided ? '2px solid #059669' : '1px solid #e5e7eb', background: !isWaSellerProvided ? '#f0fdf4' : '#fff' }}>
                  <input type="radio" name="wa_src" checked={!isWaSellerProvided} onChange={() => handleWaSourceChange('twilio_provisioned')} style={{ accentColor: '#059669' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Use CasaGrown-provisioned number</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>We assign a dedicated WhatsApp number for your business</div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', border: isWaSellerProvided ? '2px solid #059669' : '1px solid #e5e7eb', background: isWaSellerProvided ? '#f0fdf4' : '#fff' }}>
                  <input type="radio" name="wa_src" checked={isWaSellerProvided} onChange={() => handleWaSourceChange('seller_provided')} style={{ accentColor: '#059669' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Use my own WhatsApp Business number</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Connect your existing WhatsApp Business number</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Provisioned number — request flow or display */}
            {!isWaSellerProvided && (
              fbConn?.wa_display_phone ? (
                /* Number already provisioned — show it */
                <div style={{ padding: '14px 16px', borderRadius: 12, marginBottom: 10, background: 'linear-gradient(135deg, #065f46, #059669)', color: 'white' }}>
                  <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>Your Local WhatsApp Business Number</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>{fbConn.wa_display_phone}</span>
                    <button onClick={() => { navigator.clipboard.writeText(fbConn.wa_display_phone); setWaCopied(true); setTimeout(() => setWaCopied(false), 2000) }} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 12, cursor: 'pointer' }}>
                      {waCopied ? '✓ Copied!' : '📋 Copy'}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>No separate login needed — this number was set up for you by CasaGrown.</div>
                </div>
              ) : (
                /* No number yet — request provisioning with zip code */
                <div style={{ padding: '14px 16px', borderRadius: 12, marginBottom: 10, border: '1px solid #d1fae5', background: '#f0fdf4' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#065f46', marginBottom: 6 }}>📞 Get a Local WhatsApp Number</div>
                  <div style={{ fontSize: 12, color: '#065f46', marginBottom: 10, lineHeight: 1.5 }}>
                    We&apos;ll provision a local phone number based on your area so customers see a familiar area code.
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <input type="text" value={waZipCode} onChange={(e) => setWaZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="Enter your zip code" maxLength={5} style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, background: 'white', textAlign: 'center', letterSpacing: 2, fontWeight: 600 }} />
                    <button onClick={async () => {
                      if (waZipCode.length < 5) return
                      setWaProvisioning(true)
                      setWaProvisionError('')
                      try {
                        const { data, error } = await supabase.functions.invoke('provision-wa-number', { body: { zipCode: waZipCode } })
                        if (error) throw error
                        if (data?.phoneNumber) {
                          setFbConn((prev: any) => ({ ...prev, wa_display_phone: data.phoneNumber, wa_phone_number_id: data.phoneNumberId || 'provisioned' }))
                        }
                      } catch (err: any) {
                        setWaProvisionError(err.message || 'Failed to provision number. Please try again.')
                      } finally {
                        setWaProvisioning(false)
                      }
                    }} disabled={waProvisioning || waZipCode.length < 5} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: waProvisioning || waZipCode.length < 5 ? '#9ca3af' : '#059669', color: 'white', fontSize: 13, fontWeight: 600, cursor: waProvisioning || waZipCode.length < 5 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                      {waProvisioning ? '⏳ Provisioning…' : 'Get My Number'}
                    </button>
                  </div>
                  {waProvisionError && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>⚠️ {waProvisionError}</div>}
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>We&apos;ll assign a number with your local area code. No separate login or verification needed.</div>
                </div>
              )
            )}

            {/* Own number — Embedded Signup */}
            {isWaSellerProvided && (
              fbConn?.wa_business_account_id && fbConn?.wa_phone_number_id ? (
                /* Already connected via Embedded Signup — show connected number */
                <div style={{ padding: '14px 16px', borderRadius: 12, marginBottom: 10, background: 'linear-gradient(135deg, #065f46, #059669)', color: 'white' }}>
                  <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>Your Connected WhatsApp Business Number</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>{fbConn.wa_display_phone}</span>
                    <button onClick={() => { navigator.clipboard.writeText(fbConn.wa_display_phone); setWaCopied(true); setTimeout(() => setWaCopied(false), 2000) }} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 12, cursor: 'pointer' }}>
                      {waCopied ? '✓ Copied!' : '📋 Copy'}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 6 }}>✅ GrowBot auto-reply is active on this number</div>
                </div>
              ) : (
                /* Not connected yet — show Embedded Signup button */
                <div style={{ marginBottom: 12, padding: '16px', borderRadius: 12, background: '#f9fafb', border: '1px dashed #d1d5db', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
                    Connect your WhatsApp Business account so GrowBot can auto-reply to your customers.
                  </div>
                  <button
                    onClick={() => {
                      const siteUrl = window.location.origin
                      const state = `wa:${user!.id}:${encodeURIComponent('/pro-manage')}`
                      const extras = JSON.stringify({ version: 'v4', sessionInfoVersion: '3', featureType: 'whatsapp_business_app_onboarding' })
                      window.location.href = `https://business.facebook.com/messaging/whatsapp/onboard/?app_id=1878838186137452&config_id=1015862774319265&extras=${encodeURIComponent(extras)}&redirect_uri=${encodeURIComponent(`${siteUrl}/api/facebook-callback`)}&state=${encodeURIComponent(state)}`
                    }}
                    style={{
                      padding: '10px 24px', borderRadius: 10, border: 'none',
                      background: '#25D366', color: 'white', fontSize: 14, fontWeight: 600,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    📱 Connect WhatsApp Business
                  </button>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
                    You&apos;ll be redirected to Meta to authorize access to your WhatsApp Business account
                  </div>
                </div>
              )
            )}

            {/* How to use WhatsApp Pro — always visible */}
            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #d1fae5', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#065f46', marginBottom: 8 }}>📖 How WhatsApp Pro works</div>
              <div style={{ fontSize: 12, color: '#065f46', lineHeight: 1.7 }}>
                <div style={{ marginBottom: 6 }}><strong>1. Share your number</strong> — Add it to your social media bios, business cards, signage, and email signature. Send it to your existing customers so they can reach you on WhatsApp too.</div>
                <div style={{ marginBottom: 6 }}><strong>2. Customers message you</strong> — When someone texts your number, they can browse your product catalog and ask about availability, pricing, or delivery.</div>
                <div style={{ marginBottom: 6 }}><strong>3. GrowBot handles it</strong> — GrowBot auto-replies with product info, prices, and checkout links. When something needs your attention, you get notified.</div>
                <div style={{ marginBottom: 6 }}><strong>4. You step in when needed</strong> — For custom orders, complaints, or complex questions, GrowBot pauses and you take over the conversation.</div>
              </div>
            </div>

            {/* Inventory visibility info */}
            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e40af', marginBottom: 6 }}>📦 Where your inventory appears</div>
              <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.7 }}>
                <div style={{ marginBottom: 4 }}>Your product catalog is visible to customers directly inside the WhatsApp chat when they message your number.</div>
                <div>Your inventory is <strong>updated daily</strong> — any changes you make to your products, prices, or availability on CasaGrown are automatically synced to WhatsApp so customers always see what&apos;s currently available.</div>
              </div>
            </div>

            <Divider />

            {/* Inventory note */}
            <ToggleRow label="📦 Share product catalog on WhatsApp" desc="Your product catalog is shared with customers when they message your WhatsApp number." value={true} onToggle={() => {}} />

            {/* GrowBot — WhatsApp */}
            <BotChannelToggle
              icon="🟢" label="GrowBot Auto-Reply — WhatsApp"
              desc="Auto-reply to buyers messaging your WhatsApp number"
              config={botChannels.whatsapp}
              onToggle={(enabled) => updateBotChannel('whatsapp', { enabled })}
              onDelay={(d) => updateBotChannel('whatsapp', { delayMinutes: d })}
              hasDelay
            />
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
                {disconnectTarget === 'fb' ? '📘' : disconnectTarget === 'instagram' ? '📸' : disconnectTarget === 'whatsapp' ? '📱' : '🔍'}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
                Disconnect {disconnectTarget === 'fb' ? 'Facebook' : disconnectTarget === 'instagram' ? 'Instagram' : disconnectTarget === 'whatsapp' ? 'WhatsApp' : 'Google Business'}?
              </h3>
              <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>
                {disconnectTarget === 'fb' && 'Catalog sync, auto-posting, and Messenger auto-replies will stop. You can reconnect anytime.'}
                {disconnectTarget === 'instagram' && 'Instagram catalog sync, auto-posting, and DM auto-replies will be disabled. You can reconnect anytime.'}
                {disconnectTarget === 'whatsapp' && 'Your WhatsApp number will be released and auto-replies will stop. You can provision a new number anytime.'}
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
                    else if (disconnectTarget === 'whatsapp') handleWaDisconnect()
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
