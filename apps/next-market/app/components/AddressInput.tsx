import React, { useState, useEffect } from 'react'
import styles from './AddressInput.module.css'

export default function AddressInput({ 
  value, 
  onChange, 
  placeholderStreet 
}: { 
  value: string; 
  onChange: (val: string) => void;
  placeholderStreet?: string;
}) {
  // Parse value into 4 parts
  const parts = (value || '').split(',').map(s => s.trim())
  const sz = (parts[parts.length - 1] || '').split(' ')
  
  let initStreet = parts.length >= 3 ? parts.slice(0, -2).join(', ') : (value || '')
  let initCity = parts.length >= 3 ? parts[parts.length - 2] : ''
  let initState = parts.length >= 3 ? sz[0] : ''
  let initZip = parts.length >= 3 ? sz.slice(1).join(' ') : ''

  const [street, setStreet] = useState(initStreet)
  const [city, setCity] = useState(initCity)
  const [stateCode, setStateCode] = useState(initState)
  const [zip, setZip] = useState(initZip)

  // Sync from props if they change externally (e.g. geolocation)
  useEffect(() => {
    const p = (value || '').split(',').map(s => s.trim())
    if (p.length >= 3) {
      setStreet(p.slice(0, -2).join(', '))
      setCity(p[p.length - 2])
      const szp = p[p.length - 1].split(' ')
      setStateCode(szp[0] || '')
      setZip(szp.slice(1).join(' '))
    } else {
      setStreet(value || '')
      setCity('')
      setStateCode('')
      setZip('')
    }
  }, [value])

  const triggerChange = (newStreet: string, newCity: string, newState: string, newZip: string) => {
    if (!newStreet && !newCity && !newState && !newZip) {
      onChange('')
      return
    }
    onChange([newStreet, newCity, `${newState} ${newZip}`.trim()].filter(Boolean).join(', '))
  }

  return (
    <div className={styles.addressInputContainer}>
      <input 
        className={styles.input} 
        value={street} 
        onChange={(e) => { setStreet(e.target.value); triggerChange(e.target.value, city, stateCode, zip) }}
        placeholder={placeholderStreet || "Street Address"}
      />
      <div className={styles.row}>
        <input 
          className={styles.input} 
          style={{ flex: 2 }}
          value={city} 
          onChange={(e) => { setCity(e.target.value); triggerChange(street, e.target.value, stateCode, zip) }}
          placeholder="City"
        />
        <input 
          className={styles.input} 
          style={{ flex: 1 }}
          value={stateCode} 
          onChange={(e) => { setStateCode(e.target.value.slice(0, 2).toUpperCase()); triggerChange(street, e.target.value.slice(0, 2).toUpperCase(), stateCode, zip) }}
          placeholder="ST"
          maxLength={2}
        />
        <input 
          className={styles.input} 
          style={{ flex: 1 }}
          value={zip} 
          onChange={(e) => { setZip(e.target.value); triggerChange(street, city, stateCode, e.target.value) }}
          placeholder="ZIP"
        />
      </div>
    </div>
  )
}
