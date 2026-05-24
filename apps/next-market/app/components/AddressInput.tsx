import React from 'react'
import styles from './AddressInput.module.css'
import type { AddressFields } from '../../lib/address'

/**
 * Parse a combined address string into AddressFields.
 * Handles formats like:
 *   "123 Main St, San Jose, CA 95125"
 *   "123 Main St"
 */
function parseAddressString(raw: string): AddressFields {
  if (!raw) return { street: '', city: '', state: '', zip: '' }
  const parts = raw.split(',').map(s => s.trim())
  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 1].split(/\s+/)
    return {
      street: parts.slice(0, -2).join(', '),
      city: parts[parts.length - 2],
      state: stateZip[0] || '',
      zip: stateZip.slice(1).join(' '),
    }
  }
  if (parts.length === 2) {
    return { street: parts[0], city: parts[1], state: '', zip: '' }
  }
  return { street: raw, city: '', state: '', zip: '' }
}

interface AddressInputProps {
  /** Accepts either a structured AddressFields object or a legacy combined string */
  value: AddressFields | string
  /** Emits AddressFields when structured, or string when legacy string was passed */
  onChange: (val: any) => void
  placeholderStreet?: string
  /** Show privacy note below the input */
  showPrivacyNote?: boolean
}

export default function AddressInput({
  value,
  onChange,
  placeholderStreet,
  showPrivacyNote = false,
}: AddressInputProps) {
  // Normalize: if value is a string, parse into AddressFields
  const isLegacy = typeof value === 'string'
  const fields: AddressFields = isLegacy ? parseAddressString(value) : value

  const update = (field: keyof AddressFields, val: string) => {
    const updated = { ...fields, [field]: val }
    if (isLegacy) {
      // Emit combined string for backward compatibility
      const combined = [
        updated.street,
        updated.city,
        `${updated.state} ${updated.zip}`.trim(),
      ].filter(Boolean).join(', ')
      onChange(combined)
    } else {
      onChange(updated)
    }
  }

  return (
    <div className={styles.addressInputContainer}>
      <input
        className={styles.input}
        value={fields.street}
        onChange={e => update('street', e.target.value)}
        placeholder={placeholderStreet || 'Street Address'}
      />
      <div className={styles.row}>
        <input
          className={styles.input}
          style={{ flex: 2 }}
          value={fields.city}
          onChange={e => update('city', e.target.value)}
          placeholder="City"
        />
        <input
          className={styles.input}
          style={{ flex: 1 }}
          value={fields.state}
          onChange={e => {
            const v = e.target.value.slice(0, 2).toUpperCase()
            update('state', v)
          }}
          placeholder="ST"
          maxLength={2}
        />
        <input
          className={styles.input}
          style={{ flex: 1 }}
          value={fields.zip}
          onChange={e => update('zip', e.target.value)}
          placeholder="ZIP"
        />
      </div>
      {showPrivacyNote && (
        <p style={{
          fontSize: 12,
          color: '#6b7280',
          margin: '6px 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          🔒 Your exact address is private. Buyers only see your general area (e.g. &quot;Near Lincoln Ave, San Jose&quot;) until they place an order.
        </p>
      )}
    </div>
  )
}
