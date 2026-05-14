import React, { useState, useEffect } from 'react'
import { XStack, Text, Button, Spinner } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'

export type FormFieldType = 'text' | 'number' | 'email' | 'boolean' | 'textarea' | 'date' | 'checkbox_group' | 'select'

export interface FormFieldDef {
  name: string
  label: string
  type: FormFieldType
  required?: boolean
  disabled?: boolean
  description?: string
  placeholder?: string
  mono?: boolean  // render textarea in monospace (for JSON/code fields)
  options?: { label: string; value: string | boolean }[]
}

interface AdminDataFormProps {
  fields: FormFieldDef[]
  initialValues?: Record<string, any>
  onSubmit: (values: Record<string, any>) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
  isSubmitting?: boolean
}

const baseInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: `1px solid ${colors.gray[300]}`,
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  background: 'white',
  color: colors.gray[900],
  boxSizing: 'border-box',
}

const EMPTY_OBJ = {}

export function AdminDataForm({
  fields,
  initialValues = EMPTY_OBJ,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  isSubmitting = false
}: AdminDataFormProps) {
  const [values, setValues] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  const handleChange = (name: string, value: any) => {
    setValues(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    for (const field of fields) {
      if (field.required && (values[field.name] === undefined || values[field.name] === '' || values[field.name] === null)) {
        newErrors[field.name] = 'This field is required'
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    await onSubmit(values)
  }

  const renderField = (field: FormFieldDef) => {
    const value = values[field.name] ?? ''
    const borderColor = errors[field.name] ? colors.red[500] : colors.gray[300]
    const disabled = field.disabled || isSubmitting

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={e => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            rows={field.mono ? 8 : 4}
            style={{
              ...baseInput,
              borderColor,
              resize: 'vertical',
              lineHeight: 1.5,
              fontFamily: field.mono ? 'monospace' : 'inherit',
              minHeight: field.mono ? 160 : 100,
            }}
          />
        )

      case 'boolean':
        return (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!value}
              onChange={e => handleChange(field.name, e.target.checked)}
              disabled={disabled}
              style={{ width: 16, height: 16, accentColor: colors.green[600] }}
            />
            <span style={{ fontSize: 14, color: colors.gray[600] }}>{!!value ? 'Enabled' : 'Disabled'}</span>
          </label>
        )

      case 'checkbox_group': {
        const selectedValues = Array.isArray(value) ? value : []
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {(field.options || []).map(opt => {
              const isChecked = selectedValues.includes(opt.value)
              return (
                <label key={String(opt.value)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: colors.gray[700] }}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={e => {
                      if (e.target.checked) {
                        handleChange(field.name, [...selectedValues, opt.value])
                      } else {
                        handleChange(field.name, selectedValues.filter((v: any) => v !== opt.value))
                      }
                    }}
                    disabled={disabled}
                    style={{ width: 14, height: 14, accentColor: colors.green[600] }}
                  />
                  {opt.label}
                </label>
              )
            })}
          </div>
        )
      }

      case 'select':
        return (
          <select
            value={String(value)}
            onChange={e => handleChange(field.name, e.target.value)}
            disabled={disabled}
            style={{ ...baseInput, borderColor }}
          >
            {(field.options || []).map(opt => (
              <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
            ))}
          </select>
        )

      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={e => handleChange(field.name, e.target.value === '' ? '' : parseFloat(e.target.value))}
            placeholder={field.placeholder}
            disabled={disabled}
            style={{ ...baseInput, borderColor }}
          />
        )

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={e => handleChange(field.name, e.target.value)}
            disabled={disabled}
            style={{ ...baseInput, borderColor }}
          />
        )

      case 'email':
        return (
          <input
            type="email"
            value={value}
            onChange={e => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            autoComplete="off"
            style={{ ...baseInput, borderColor }}
          />
        )

      case 'text':
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={e => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            style={{ ...baseInput, borderColor }}
          />
        )
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, background: 'white', padding: 24, borderRadius: 8, border: `1px solid ${colors.gray[200]}` }}>
      {fields.map(field => (
        <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 600, color: colors.gray[800] }}>
            {field.label}
            {field.required && <span style={{ color: colors.red[500], marginLeft: 2 }}>*</span>}
          </label>

          {renderField(field)}

          {field.description && (
            <span style={{ fontSize: 12, color: colors.gray[500] }}>{field.description}</span>
          )}
          {errors[field.name] && (
            <span style={{ fontSize: 12, color: colors.red[500] }}>{errors[field.name]}</span>
          )}
        </div>
      ))}

      <XStack gap="$3" justifyContent="flex-end" paddingTop="$4" borderTopWidth={1} borderColor={colors.gray[200]}>
        {onCancel && (
          <Button chromeless onPress={onCancel} disabled={isSubmitting}>
            <Text color={colors.gray[600]}>Cancel</Text>
          </Button>
        )}
        <Button
          backgroundColor={colors.green[600]}
          disabled={isSubmitting}
          onPress={handleSubmit}
          icon={isSubmitting ? <Spinner color="white" /> : undefined}
        >
          {!isSubmitting && <Text color="white" fontWeight="600">{submitLabel}</Text>}
        </Button>
      </XStack>
    </div>
  )
}
