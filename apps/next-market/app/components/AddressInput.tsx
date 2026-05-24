import React from 'react'
import styles from './AddressInput.module.css'
import type { AddressFields } from '../../lib/address'

interface AddressInputProps {
  /** Structured address fields — string values are no longer accepted */
  value: AddressFields
  /** Always emits structured AddressFields */
  onChange: (val: AddressFields) => void
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
  const update = (field: keyof AddressFields, val: string) => {
    onChange({ ...value, [field]: val })
  }

  return (
    <div className={styles.addressInputContainer}>
      <input
        className={styles.input}
        value={value.street}
        onChange={e => update('street', e.target.value)}
        placeholder={placeholderStreet || 'Street Address'}
      />
      <div className={styles.row}>
        <input
          className={styles.input}
          style={{ flex: 2 }}
          value={value.city}
          onChange={e => update('city', e.target.value)}
          placeholder="City"
        />
        <input
          className={styles.input}
          style={{ flex: 1 }}
          value={value.state}
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
          value={value.zip}
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
