'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMarket, type Booth } from '../../../../lib/store'
import { PersonPlusIcon } from '../../../components/icons'
import styles from './page.module.css'

// =============================================================================
// Theme Data
// =============================================================================

const THEMES_MAP: Record<string, {
  label: string; emoji: string; color: string; border: string;
}> = {
  'rustic': { label: 'Rustic', emoji: '🪵', color: '#fef3c7', border: '#d97706' },
  'tropical': { label: 'Tropical', emoji: '🌴', color: '#d1fae5', border: '#16a34a' },
  'cottage': { label: 'Cottage', emoji: '🏡', color: '#e0f2fe', border: '#0ea5e9' },
  'floral': { label: 'Floral', emoji: '🌸', color: '#fce7f3', border: '#ec4899' },
  'minimal': { label: 'Minimal', emoji: '✨', color: '#f3f4f6', border: '#6b7280' },
  'harvest': { label: 'Harvest', emoji: '🌾', color: '#fef3c7', border: '#f59e0b' },
}

const THEMES_LIST = Object.entries(THEMES_MAP).map(([id, t]) => ({ id: id as Booth['decorativeTheme'], ...t }))

// =============================================================================
// GlobalGiving Charity List (comprehensive, searchable)
// =============================================================================
const CHARITIES = [
  { id: 'gg-1', name: 'Feeding America', category: 'Hunger Relief', emoji: '🍎' },
  { id: 'gg-2', name: 'No Kid Hungry', category: 'Children & Youth', emoji: '👶' },
  { id: 'gg-3', name: 'World Food Programme', category: 'Global Food Security', emoji: '🌍' },
  { id: 'gg-4', name: 'Local Food Bank Network', category: 'Local Food Banks', emoji: '🏪' },
  { id: 'gg-5', name: 'Trees for the Future', category: 'Environment', emoji: '🌳' },
  { id: 'gg-6', name: 'Clean Water Fund', category: 'Clean Water', emoji: '💧' },
  { id: 'gg-7', name: 'Meals on Wheels', category: 'Senior Nutrition', emoji: '🚗' },
  { id: 'gg-8', name: 'Save the Children', category: 'Children & Youth', emoji: '🧒' },
  { id: 'gg-9', name: 'Habitat for Humanity', category: 'Housing', emoji: '🏠' },
  { id: 'gg-10', name: 'American Red Cross', category: 'Disaster Relief', emoji: '❤️' },
  { id: 'gg-11', name: 'St. Jude Children\'s Hospital', category: 'Healthcare', emoji: '🏥' },
  { id: 'gg-12', name: 'Nature Conservancy', category: 'Conservation', emoji: '🦎' },
  { id: 'gg-13', name: 'UNICEF', category: 'Global Children', emoji: '🌐' },
  { id: 'gg-14', name: 'Doctors Without Borders', category: 'Global Health', emoji: '🩺' },
  { id: 'gg-15', name: 'World Wildlife Fund', category: 'Wildlife', emoji: '🐼' },
  { id: 'gg-16', name: 'Planned Parenthood', category: 'Healthcare', emoji: '💗' },
  { id: 'gg-17', name: 'ASPCA', category: 'Animal Welfare', emoji: '🐾' },
  { id: 'gg-18', name: 'Oxfam International', category: 'Poverty Relief', emoji: '🤝' },
  { id: 'gg-19', name: 'Sierra Club Foundation', category: 'Environment', emoji: '⛰️' },
  { id: 'gg-20', name: 'Direct Relief', category: 'Healthcare', emoji: '💊' },
  { id: 'gg-21', name: 'Heifer International', category: 'Agriculture', emoji: '🐄' },
  { id: 'gg-22', name: 'Kiva', category: 'Microfinance', emoji: '💵' },
  { id: 'gg-23', name: 'Room to Read', category: 'Education', emoji: '📚' },
  { id: 'gg-24', name: 'Charity: Water', category: 'Clean Water', emoji: '🚰' },
  { id: 'gg-25', name: 'Action Against Hunger', category: 'Hunger Relief', emoji: '🥣' },
  { id: 'gg-26', name: 'Girls Who Code', category: 'Education', emoji: '👩‍💻' },
  { id: 'gg-27', name: 'Khan Academy', category: 'Education', emoji: '🎓' },
  { id: 'gg-28', name: 'Best Friends Animal Society', category: 'Animal Welfare', emoji: '🐶' },
  { id: 'gg-29', name: 'Wounded Warrior Project', category: 'Veterans', emoji: '🎖️' },
  { id: 'gg-30', name: 'Mental Health America', category: 'Mental Health', emoji: '🧠' },
]

// =============================================================================
// Component
// =============================================================================

export default function BoothSetupPage() {
  const params = useParams()
  const router = useRouter()
  const { state, dispatch } = useMarket()
  const themeId = params.template as string
  const initialTheme = THEMES_MAP[themeId] ? themeId as Booth['decorativeTheme'] : 'rustic'
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Core fields ---
  const [boothName, setBoothName] = useState('')
  const [fullName, setFullName] = useState(state.user?.name || '')
  const [street, setStreet] = useState(state.user?.address?.street || '')
  const [city, setCity] = useState(state.user?.address?.city || '')
  const [stateAddr, setStateAddr] = useState(state.user?.address?.state || '')
  const [zip, setZip] = useState(state.user?.address?.zip || '')
  const [theme, setTheme] = useState<Booth['decorativeTheme']>(initialTheme)
  const [headerImage, setHeaderImage] = useState<string | null>(null)
  const [tagline, setTagline] = useState('')

  // Geolocation
  const [locating, setLocating] = useState(false)
  const [locationDenied, setLocationDenied] = useState(false)

  // --- Optional sections ---
  const [showPhone, setShowPhone] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showHelpers, setShowHelpers] = useState(false)

  // Phone
  const [phone, setPhone] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [showVerify, setShowVerify] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')

  // Payment
  const [paymentMode, setPaymentMode] = useState<'automatic' | 'manual'>('automatic')
  const [autoMethod, setAutoMethod] = useState<'venmo' | 'charity' | null>(null)
  const [venmoContact, setVenmoContact] = useState('')
  const [venmoType, setVenmoType] = useState<'email' | 'phone'>('email')
  const [selectedCharity, setSelectedCharity] = useState<string | null>(null)
  const [charitySearch, setCharitySearch] = useState('')

  // Helpers (link + passcode model)
  // fullInviteCode = prefix-random (in URL for lookup), passcode = random part only (what helper types)
  const [fullInviteCode, setFullInviteCode] = useState('')
  const [passcode, setPasscode] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteExpiresAt, setInviteExpiresAt] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({})

  const selectedTheme = THEMES_MAP[theme]

  // Generate invite code with owner prefix (zip or name) for uniqueness
  const ownerPrefix = (zip || state.user?.address?.zip || fullName.replace(/[^a-zA-Z]/g, '').slice(0, 5) || 'BOOTH').toUpperCase()
  const generateInvite = () => {
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
    const full = `${ownerPrefix}-${rand}`
    setFullInviteCode(full)
    setPasscode(rand)  // helper only types this short part
    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/join-booth/${encodeURIComponent(full)}`
    setInviteLink(link)
    // Expires in 1 week
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    setInviteExpiresAt(expires.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
  }

  // Generate on first expand
  useEffect(() => {
    if (showHelpers && !fullInviteCode) generateInvite()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHelpers])

  const copyInviteInfo = async () => {
    const text = `Join my booth on CasaGrown!\n\nLink: ${inviteLink}\nPasscode: ${passcode}\n\nThis passcode expires ${inviteExpiresAt}.`
    try {
      await navigator.clipboard.writeText(text)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    } catch { /* fallback handled by share */ }
  }

  const shareInvite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join my booth on CasaGrown`, text: `Join my booth as a helper!\n\nPasscode: ${passcode}\nExpires: ${inviteExpiresAt}`, url: inviteLink })
      } catch { /* cancelled */ }
    } else {
      copyInviteInfo()
    }
  }

  // --- Geolocation ---
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&addressdetails=1`)
          const data = await res.json()
          if (data.address) {
            const a = data.address
            setStreet(`${a.house_number || ''} ${a.road || ''}`.trim() || a.display_name?.split(',')[0] || '')
            setCity(a.city || a.town || a.village || a.hamlet || '')
            setStateAddr(a.state_code?.toUpperCase() || a.state?.slice(0, 2)?.toUpperCase() || '')
            setZip(a.postcode || '')
          }
        } catch { /* silent */ }
        setLocating(false)
      },
      () => { setLocating(false); setLocationDenied(true) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // --- Handlers ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setHeaderImage(URL.createObjectURL(file))
  }

  const handleVerifyPhone = () => {
    if (verifyCode.length >= 4) { setPhoneVerified(true); setShowVerify(false) }
  }

  // Filtered charities
  const filteredCharities = charitySearch.trim()
    ? CHARITIES.filter(c =>
        c.name.toLowerCase().includes(charitySearch.toLowerCase()) ||
        c.category.toLowerCase().includes(charitySearch.toLowerCase())
      )
    : CHARITIES.slice(0, 8)

  const handleCreate = () => {
    const newErrors: Record<string, string> = {}
    if (!boothName.trim()) newErrors.boothName = 'Booth name is required'
    if (!fullName.trim()) newErrors.fullName = 'Name is required'
    if (!street.trim()) newErrors.street = 'Address is required'
    if (!city.trim()) newErrors.city = 'City is required'
    if (!stateAddr.trim()) newErrors.stateAddr = 'State is required'
    if (!zip.trim()) newErrors.zip = 'ZIP is required'
    if (showPayment && paymentMode === 'automatic' && autoMethod === 'venmo' && !venmoContact.trim()) {
      newErrors.venmoContact = 'Email or phone is required for Venmo'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      document.querySelector(`.${styles.errorMsg}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    dispatch({
      type: 'UPDATE_PROFILE',
      payload: { name: fullName, phone: phone || undefined, address: { street, city, state: stateAddr, zip } },
    })

    dispatch({
      type: 'CREATE_BOOTH',
      payload: {
        ownerId: state.user?.id || 'user-1',
        ownerName: fullName,
        name: boothName,
        description: tagline,
        decorativeTheme: theme,
        aboutHtml: '',
        inviteCode: fullInviteCode || Math.random().toString(36).slice(2, 8).toUpperCase(),
        headerImageUrl: headerImage || undefined,
        isOpen: false,
        tagline,
        paymentMethod: showPayment ? (paymentMode === 'manual' ? 'manual' : autoMethod || 'automatic') : 'manual',
        venmoHandle: autoMethod === 'venmo' ? venmoContact : undefined,
        charityId: autoMethod === 'charity' ? selectedCharity || undefined : undefined,
        charityName: autoMethod === 'charity' ? CHARITIES.find(c => c.id === selectedCharity)?.name : undefined,
        helpers: [],
        catalogItems: [],
      },
    })

    router.push('/my-booth')
  }

  return (
    <div className={styles.page}>
      <div className={styles.wizard}>
        <h1 className={styles.pageTitle}>Set Up Your Booth</h1>
        <p className={styles.pageSubtitle}>
          Just a few details to get started. You can update everything later from My Booth.
        </p>

        {/* ============ Core Form ============ */}
        <section className={styles.section}>
          {/* Booth Name */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Booth Name <span className={styles.required}>*</span></label>
            <input className={`${styles.input} ${errors.boothName ? styles.inputError : ''}`} value={boothName} onChange={e => { setBoothName(e.target.value); setErrors(p => ({ ...p, boothName: '' })) }} placeholder="e.g. Sarah's Garden Stand" autoFocus />
            {errors.boothName && <span className={styles.errorMsg}>{errors.boothName}</span>}
          </div>

          {/* Tagline */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Tagline <span className={styles.optional}>(optional)</span></label>
            <input className={styles.input} value={tagline} onChange={e => setTagline(e.target.value)} placeholder="A short description visitors will see" />
          </div>

          {/* Theme */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Theme</label>
            <div className={styles.themeGrid}>
              {THEMES_LIST.map(t => (
                <button key={t.id} className={`${styles.themeBtn} ${theme === t.id ? styles.themeBtnActive : ''}`} onClick={() => setTheme(t.id)}>
                  <span className={styles.themeBtnEmoji}>{t.emoji}</span>
                  <span className={styles.themeBtnLabel}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Header Image */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Header Image <span className={styles.optional}>(optional)</span></label>
            <div className={styles.uploadZone} onClick={() => fileInputRef.current?.click()}>
              {headerImage ? (
                <img src={headerImage} alt="Preview" className={styles.uploadPreview} />
              ) : (
                <>
                  <span className={styles.uploadIcon}>📷</span>
                  <span className={styles.uploadText}>Click to upload</span>
                </>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className={styles.fileInput} onChange={handleImageUpload} />
            </div>
          </div>

          {/* Live Preview */}
          <div className={styles.preview} style={{ background: selectedTheme?.color || '#f3f4f6' }}>
            {headerImage && <img src={headerImage} alt="Header" className={styles.previewHeaderImg} />}
            <div className={styles.previewBody}>
              <div className={styles.previewThemeIcons}>{selectedTheme?.emoji} {selectedTheme?.emoji} {selectedTheme?.emoji}</div>
              <h3 className={styles.previewName}>{boothName || 'Your Booth Name'}</h3>
              <p className={styles.previewTagline}>{tagline || 'Your tagline here...'}</p>
            </div>
          </div>

          <div className={styles.divider} />

          {/* Your Info */}
          <div className={styles.infoHeader}>
            <h3 className={styles.subTitle}>Your Info</h3>
            <button type="button" className={styles.locationBtn} onClick={handleUseMyLocation} disabled={locating}>
              {locating ? '⏳ Locating...' : '📍 Use My Location'}
            </button>
          </div>
          {locationDenied && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#b45309', lineHeight: 1.4 }}>
              🔒 To enable: tap the <strong>lock icon</strong> in your address bar → <strong>Site settings</strong> → allow <strong>Location</strong>, then reload.
            </p>
          )}
          <div className={styles.formGroup}>
            <label className={styles.label}>Full Name <span className={styles.required}>*</span></label>
            <input className={`${styles.input} ${errors.fullName ? styles.inputError : ''}`} value={fullName} onChange={e => { setFullName(e.target.value); setErrors(p => ({ ...p, fullName: '' })) }} placeholder="Your full name" />
            {errors.fullName && <span className={styles.errorMsg}>{errors.fullName}</span>}
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Address <span className={styles.required}>*</span></label>
            <input className={`${styles.input} ${errors.street ? styles.inputError : ''}`} value={street} onChange={e => { setStreet(e.target.value); setErrors(p => ({ ...p, street: '' })) }} placeholder="123 Main St" />
            {errors.street && <span className={styles.errorMsg}>{errors.street}</span>}
          </div>
          <div className={styles.row3}>
            <div className={styles.formGroup}>
              <label className={styles.label}>City <span className={styles.required}>*</span></label>
              <input className={`${styles.input} ${errors.city ? styles.inputError : ''}`} value={city} onChange={e => { setCity(e.target.value); setErrors(p => ({ ...p, city: '' })) }} placeholder="City" />
              {errors.city && <span className={styles.errorMsg}>{errors.city}</span>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>State <span className={styles.required}>*</span></label>
              <input className={`${styles.input} ${errors.stateAddr ? styles.inputError : ''}`} value={stateAddr} onChange={e => { setStateAddr(e.target.value); setErrors(p => ({ ...p, stateAddr: '' })) }} placeholder="CA" maxLength={2} />
              {errors.stateAddr && <span className={styles.errorMsg}>{errors.stateAddr}</span>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>ZIP <span className={styles.required}>*</span></label>
              <input className={`${styles.input} ${errors.zip ? styles.inputError : ''}`} value={zip} onChange={e => { setZip(e.target.value); setErrors(p => ({ ...p, zip: '' })) }} placeholder="90210" maxLength={5} />
              {errors.zip && <span className={styles.errorMsg}>{errors.zip}</span>}
            </div>
          </div>
        </section>

        {/* ============ Optional Expandables ============ */}

        {/* Phone */}
        {!showPhone ? (
          <button className={styles.optionalToggle} onClick={() => setShowPhone(true)}>
            📱 Add phone number for SMS verification
          </button>
        ) : (
          <section className={styles.section}>
            <div className={styles.optionalHeader}>
              <h3 className={styles.subTitle}>📱 Phone Number</h3>
              <button className={styles.collapseBtn} onClick={() => setShowPhone(false)}>✕</button>
            </div>
            <div className={styles.phoneRow}>
              <input className={styles.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" />
              {phone && !phoneVerified && (
                <button className={styles.verifyBtn} onClick={() => setShowVerify(true)}>Verify</button>
              )}
              {phoneVerified && <span className={styles.verified}>✓ Verified</span>}
            </div>
            {showVerify && (
              <div className={styles.verifyBox}>
                <p className={styles.verifyText}>Enter the code sent to {phone}</p>
                <div className={styles.phoneRow}>
                  <input className={styles.input} value={verifyCode} onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" maxLength={6} />
                  <button className={styles.verifyBtn} onClick={handleVerifyPhone}>Confirm</button>
                </div>
                <p className={styles.verifyHint}>Enter any code for this prototype</p>
              </div>
            )}
          </section>
        )}

        {/* Payment */}
        {!showPayment ? (
          <button className={styles.optionalToggle} onClick={() => setShowPayment(true)}>
            💰 Set up payment settlement now
          </button>
        ) : (
          <section className={styles.section}>
            <div className={styles.optionalHeader}>
              <h3 className={styles.subTitle}>💰 Payment Settlement</h3>
              <button className={styles.collapseBtn} onClick={() => setShowPayment(false)}>✕</button>
            </div>
            <div className={styles.radioGroup}>
              <label className={`${styles.radioCard} ${paymentMode === 'automatic' ? styles.radioCardActive : ''}`}>
                <input type="radio" name="paymentMode" checked={paymentMode === 'automatic'} onChange={() => setPaymentMode('automatic')} className={styles.radioInput} />
                <span className={styles.radioIcon}>🤖</span>
                <div>
                  <strong className={styles.radioLabel}>Automatic</strong>
                  <span className={styles.radioDesc}>Auto-settle at end of each market day</span>
                </div>
              </label>
              <label className={`${styles.radioCard} ${paymentMode === 'manual' ? styles.radioCardActive : ''}`}>
                <input type="radio" name="paymentMode" checked={paymentMode === 'manual'} onChange={() => setPaymentMode('manual')} className={styles.radioInput} />
                <span className={styles.radioIcon}>✋</span>
                <div>
                  <strong className={styles.radioLabel}>Manual</strong>
                  <span className={styles.radioDesc}>Decide each time (Venmo, charity, gift cards)</span>
                </div>
              </label>
            </div>
            {paymentMode === 'automatic' && (
              <div className={styles.conditionalField}>
                <label className={styles.label}>Where should earnings go?</label>
                <div className={styles.radioGroup} style={{ marginTop: 8 }}>
                  <label className={`${styles.radioCard} ${autoMethod === 'venmo' ? styles.radioCardActive : ''}`}>
                    <input type="radio" name="autoMethod" checked={autoMethod === 'venmo'} onChange={() => setAutoMethod('venmo')} className={styles.radioInput} />
                    <span className={styles.radioIcon}>💵</span>
                    <div><strong className={styles.radioLabel}>Venmo</strong></div>
                  </label>
                  <label className={`${styles.radioCard} ${autoMethod === 'charity' ? styles.radioCardActive : ''}`}>
                    <input type="radio" name="autoMethod" checked={autoMethod === 'charity'} onChange={() => setAutoMethod('charity')} className={styles.radioInput} />
                    <span className={styles.radioIcon}>❤️</span>
                    <div><strong className={styles.radioLabel}>Donate to Charity</strong></div>
                  </label>
                </div>

                {/* Venmo — email or phone */}
                {autoMethod === 'venmo' && (
                  <div style={{ marginTop: 12 }}>
                    <div className={styles.venmoToggle}>
                      <button className={`${styles.venmoTab} ${venmoType === 'email' ? styles.venmoTabActive : ''}`} onClick={() => setVenmoType('email')}>📧 Email</button>
                      <button className={`${styles.venmoTab} ${venmoType === 'phone' ? styles.venmoTabActive : ''}`} onClick={() => setVenmoType('phone')}>📱 Phone</button>
                    </div>
                    <input
                      className={`${styles.input} ${errors.venmoContact ? styles.inputError : ''}`}
                      value={venmoContact}
                      onChange={e => { setVenmoContact(e.target.value); setErrors(p => ({ ...p, venmoContact: '' })) }}
                      placeholder={venmoType === 'email' ? 'your@email.com' : '(555) 000-0000'}
                      type={venmoType === 'email' ? 'email' : 'tel'}
                    />
                    {errors.venmoContact && <span className={styles.errorMsg}>{errors.venmoContact}</span>}
                    <p className={styles.venmoHint}>We&apos;ll use this to send your Venmo payments automatically.</p>
                  </div>
                )}

                {/* Charity — searchable */}
                {autoMethod === 'charity' && (
                  <div style={{ marginTop: 12 }}>
                    <input
                      className={styles.input}
                      value={charitySearch}
                      onChange={e => setCharitySearch(e.target.value)}
                      placeholder="🔍 Search 30,000+ charities..."
                    />
                    <div className={styles.charityGrid}>
                      {filteredCharities.map(c => (
                        <button key={c.id} className={`${styles.charityCard} ${selectedCharity === c.id ? styles.charityCardActive : ''}`} onClick={() => setSelectedCharity(c.id)}>
                          <span className={styles.charityEmoji}>{c.emoji}</span>
                          <div className={styles.charityInfo}>
                            <strong className={styles.charityName}>{c.name}</strong>
                            <span className={styles.charityCategory}>{c.category}</span>
                          </div>
                          {selectedCharity === c.id && <span className={styles.charityCheck}>✓</span>}
                        </button>
                      ))}
                      {filteredCharities.length === 0 && (
                        <p className={styles.noResults}>No charities matching &ldquo;{charitySearch}&rdquo;</p>
                      )}
                    </div>
                    {!charitySearch && <p className={styles.venmoHint}>Showing top charities. Type to search our full GlobalGiving catalog.</p>}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Helpers — link + passcode */}
        {!showHelpers ? (
          <button className={styles.optionalToggle} onClick={() => setShowHelpers(true)}>
            👥 Invite helpers to your booth
          </button>
        ) : (
          <section className={styles.section}>
            <div className={styles.optionalHeader}>
              <h3 className={styles.subTitle}>👥 Invite Helpers</h3>
              <button className={styles.collapseBtn} onClick={() => setShowHelpers(false)}>✕</button>
            </div>
            <p className={styles.helperDesc}>
              Share this link with people you&apos;d like to help manage your booth. They&apos;ll use the passcode to connect.
            </p>

            {/* Passcode display — only the short part the helper types */}
            <div className={styles.passcodeCard}>
              <div className={styles.passcodeLabel}>Passcode for helpers to enter</div>
              <div className={styles.passcodeDigits}>
                {passcode.split('').map((ch, i) => (
                  <span key={i} className={styles.passcodeDigit}>{ch}</span>
                ))}
              </div>
              <button className={styles.passcodeRefresh} onClick={generateInvite}>🔄 Generate new code</button>
            </div>

            {/* Share actions */}
            <div className={styles.shareActions}>
              <button className={styles.shareBtn} onClick={copyInviteInfo}>
                {inviteCopied ? '✅ Copied!' : '📋 Copy Link + Passcode'}
              </button>
              <button className={styles.shareBtn} onClick={shareInvite}>
                <PersonPlusIcon size={14} /> Share
              </button>
            </div>

            <div className={styles.inviteLinkDisplay}>
              <input className={styles.input} value={inviteLink} readOnly onClick={e => (e.target as HTMLInputElement).select()} />
            </div>

            <p className={styles.helperHint}>
              ⏳ Passcode expires <strong>{inviteExpiresAt || 'in 1 week'}</strong> and can only be used once. After your booth is created, manage helpers from <strong>My Booth → Helpers</strong>.
            </p>
          </section>
        )}

        {/* ============ Create Button ============ */}
        <section className={styles.section} style={{ textAlign: 'center' }}>
          <p className={styles.createNote}>
            Delivery and pickup details will be set when you add products for each market day.
          </p>
          <button className={styles.createBtn} onClick={handleCreate}>
            🚀 Create Your Booth
          </button>
        </section>
      </div>
    </div>
  )
}
