'use client'

import { useState } from 'react'
import { useMarket, type Booth } from '../../../../lib/store'

const THEMES: { id: Booth['decorativeTheme']; label: string; emoji: string }[] = [
  { id: 'rustic', label: 'Rustic', emoji: '🪵' },
  { id: 'tropical', label: 'Tropical', emoji: '🌴' },
  { id: 'minimal', label: 'Minimal', emoji: '✨' },
  { id: 'floral', label: 'Floral', emoji: '🌸' },
  { id: 'harvest', label: 'Harvest', emoji: '🌾' },
  { id: 'cottage', label: 'Cottage', emoji: '🏡' },
]

export default function CustomizePage() {
  const { state, dispatch } = useMarket()
  const myBooth = state.booths.find(b => b.ownerId === state.user?.id)
  const [name, setName] = useState(myBooth?.name || '')
  const [description, setDescription] = useState(myBooth?.description || '')
  const [theme, setTheme] = useState<Booth['decorativeTheme']>(myBooth?.decorativeTheme || 'floral')
  const [about, setAbout] = useState(myBooth?.aboutHtml?.replace(/<\/?p>/g, '') || '')

  if (!myBooth) return <div className="container" style={{ padding: 80, textAlign: 'center' }}><h2>Create a booth first</h2></div>

  const handleSave = () => {
    dispatch({
      type: 'UPDATE_BOOTH',
      payload: { id: myBooth.id, name, description, decorativeTheme: theme, aboutHtml: `<p>${about}</p>` },
    })
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Booth updated! ✨', type: 'success' } })
  }

  const tc = THEMES.find(t => t.id === theme)

  return (
    <div className="container-sm">
      <div className="page-header"><h1 className="page-title">Customize Booth</h1></div>

      {/* Preview */}
      <div style={{
        background: theme === 'rustic' ? '#fef3c7' : theme === 'tropical' ? '#d1fae5' : theme === 'floral' ? '#fce7f3' : theme === 'harvest' ? '#fef3c7' : theme === 'cottage' ? '#e0f2fe' : '#f3f4f6',
        borderRadius: 'var(--radius-xl)', padding: 32, textAlign: 'center', marginBottom: 24,
        border: '2px solid var(--border)',
      }}>
        <div style={{ fontSize: 24, letterSpacing: 12, opacity: 0.6, marginBottom: 8 }}>{tc?.emoji} {tc?.emoji} {tc?.emoji}</div>
        <h2 style={{ fontSize: 24, fontWeight: 800 }}>{name || 'Your Booth Name'}</h2>
        <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>by {state.user?.name}</p>
      </div>

      <div className="form-group">
        <label className="label">Booth Name</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="label">Description</label>
        <textarea className="input textarea" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
      </div>
      <div className="form-group">
        <label className="label">Theme</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {THEMES.map(t => (
            <button key={t.id} onClick={() => setTheme(t.id)}
              style={{
                padding: 14, borderRadius: 'var(--radius-lg)', border: `2px solid ${theme === t.id ? 'var(--green-500)' : 'var(--border)'}`,
                background: theme === t.id ? 'var(--green-50)' : '#fff', cursor: 'pointer', textAlign: 'center',
              }}>
              <span style={{ fontSize: 24 }}>{t.emoji}</span>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)' }}>{t.label}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label className="label">About Page Content</label>
        <textarea className="input textarea" value={about} onChange={e => setAbout(e.target.value)} rows={5} placeholder="Tell visitors about your garden, trees, growing methods..." />
      </div>
      <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleSave}>Save Changes</button>
      <div style={{ height: 40 }} />
    </div>
  )
}
