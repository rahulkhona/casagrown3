import React, { useState, useRef, useEffect } from 'react'
import styles from './AddressInput.module.css'

function parseAddress(value: string) {
  const parts = (value || '').split(',').map(s => s.trim())
  if (parts.length >= 3) {
    const street = parts.slice(0, -2).join(', ')
    const city = parts[parts.length - 2]
    const sz = parts[parts.length - 1].split(' ')
    const state = sz[0] || ''
    const zip = sz.slice(1).join(' ')
    return { street, city, state, zip }
  }
  return { street: value || '', city: '', state: '', zip: '' }
}

export default function AddressInput({
  value,
  onChange,
  placeholderStreet
}: {
  value: string;
  onChange: (val: string) => void;
  placeholderStreet?: string;
}) {
  const init = parseAddress(value)
  const [street, setStreet] = useState(init.street)
  const [city, setCity] = useState(init.city)
  const [stateCode, setStateCode] = useState(init.state)
  const [zip, setZip] = useState(init.zip)

  // Track the last value we synced FROM props so we only re-parse when
  // the parent genuinely sets a new address (e.g. geolocation), not on
  // every keystroke that round-trips back through onChange → value.
  const lastSyncedValue = useRef(value)

  useEffect(() => {
    if (value === lastSyncedValue.current) return
    lastSyncedValue.current = value
    const p = parseAddress(value)
    setStreet(p.street)
    setCity(p.city)
    setStateCode(p.state)
    setZip(p.zip)
  }, [value])

  const emit = (s: string, c: string, st: string, z: string) => {
    const combined = [s, c, `${st} ${z}`.trim()].filter(Boolean).join(', ')
    lastSyncedValue.current = combined // prevent next useEffect from re-parsing what we just built
    onChange(combined || '')
  }

  return (
    <div className={styles.addressInputContainer}>
      <input
        className={styles.input}
        value={street}
        onChange={e => { setStreet(e.target.value); emit(e.target.value, city, stateCode, zip) }}
        placeholder={placeholderStreet || 'Street Address'}
      />
      <div className={styles.row}>
        <input
          className={styles.input}
          style={{ flex: 2 }}
          value={city}
          onChange={e => { setCity(e.target.value); emit(street, e.target.value, stateCode, zip) }}
          placeholder="City"
        />
        <input
          className={styles.input}
          style={{ flex: 1 }}
          value={stateCode}
          onChange={e => {
            const v = e.target.value.slice(0, 2).toUpperCase()
            setStateCode(v)
            emit(street, city, v, zip)
          }}
          placeholder="ST"
          maxLength={2}
        />
        <input
          className={styles.input}
          style={{ flex: 1 }}
          value={zip}
          onChange={e => { setZip(e.target.value); emit(street, city, stateCode, e.target.value) }}
          placeholder="ZIP"
        />
      </div>
    </div>
  )
}

