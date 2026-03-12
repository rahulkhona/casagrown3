import React, { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Input, TextArea, Label, Spinner, Checkbox } from 'tamagui'
import { Check } from '@tamagui/lucide-icons'
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
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
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

    switch (field.type) {
      case 'textarea':
        return (
          <TextArea
            value={value}
            onChangeText={(text) => handleChange(field.name, text)}
            placeholder={field.placeholder}
            disabled={field.disabled || isSubmitting}
            minHeight={100}
            borderColor={errors[field.name] ? colors.red[500] : colors.gray[300]}
            fontWeight="normal"
          />
        )
      case 'boolean':
        return (
          <XStack alignItems="center" gap="$3">
            <Checkbox 
              size="$5" 
              checked={!!value} 
              onCheckedChange={(checked) => handleChange(field.name, !!checked)}
              disabled={field.disabled || isSubmitting}
              borderColor={colors.gray[300]}
              backgroundColor={!!value ? colors.green[50] : 'white'}
            >
              <Checkbox.Indicator>
                <Check size={18} color={colors.green[700]} />
              </Checkbox.Indicator>
            </Checkbox>
            <Text color={colors.gray[600]}>{!!value ? 'Enabled' : 'Disabled'}</Text>
          </XStack>
        )
      case 'checkbox_group':
        // Expects `value` to be an array of selected option values
        const selectedValues = Array.isArray(value) ? value : []
        return (
          <XStack flexWrap="wrap" gap="$4">
            {(field.options || []).map((opt) => {
              const isChecked = selectedValues.includes(opt.value)
              return (
                <XStack key={String(opt.value)} alignItems="center" gap="$2">
                  <Checkbox
                    size="$3"
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        handleChange(field.name, [...selectedValues, opt.value])
                      } else {
                        handleChange(field.name, selectedValues.filter(v => v !== opt.value))
                      }
                    }}
                    disabled={field.disabled || isSubmitting}
                  >
                    <Checkbox.Indicator>
                      <Check />
                    </Checkbox.Indicator>
                  </Checkbox>
                  <Label size="$3" color={colors.gray[700]} onPress={() => { /* optional tap label logic */ }}>
                    {opt.label}
                  </Label>
                </XStack>
              )
            })}
          </XStack>
        )
      case 'select':
        return (
          <XStack flexWrap="wrap" gap="$2">
            {(field.options || []).map((opt) => {
              const isSelected = value === opt.value
              return (
                <Button
                  key={String(opt.value)}
                  size="$3"
                  backgroundColor={isSelected ? colors.green[600] : 'white'}
                  borderWidth={1}
                  borderColor={isSelected ? colors.green[600] : colors.gray[300]}
                  pressStyle={{ backgroundColor: colors.green[100] }}
                  hoverStyle={{ backgroundColor: isSelected ? colors.green[700] : colors.gray[50] }}
                  onPress={() => handleChange(field.name, opt.value)}
                  disabled={field.disabled || isSubmitting}
                  borderRadius="$6"
                >
                  <Text
                    color={isSelected ? 'white' : colors.gray[700]}
                    fontWeight={isSelected ? '700' : '400'}
                    fontSize="$3"
                  >
                    {opt.label}
                  </Text>
                </Button>
              )
            })}
          </XStack>
        )
      case 'number':
        return (
          <Input
            value={value.toString()}
            onChangeText={(text) => {
              const num = parseFloat(text)
              handleChange(field.name, isNaN(num) ? '' : num)
            }}
            keyboardType="numeric"
            placeholder={field.placeholder}
            disabled={field.disabled || isSubmitting}
            borderColor={errors[field.name] ? colors.red[500] : colors.gray[300]}
            fontWeight="normal"
          />
        )
      case 'date':
      case 'text':
      case 'email':
      default:
        return (
          <Input
            value={value}
            onChangeText={(text) => handleChange(field.name, text)}
            placeholder={field.placeholder}
            disabled={field.disabled || isSubmitting}
            keyboardType={field.type === 'email' ? 'email-address' : 'default'}
            autoCapitalize={field.type === 'email' ? 'none' : undefined}
            borderColor={errors[field.name] ? colors.red[500] : colors.gray[300]}
            fontWeight="normal"
          />
        )
    }
  }

  return (
    <YStack gap="$5" backgroundColor="white" padding="$6" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]}>
      
      {fields.map(field => (
        <YStack key={field.name} gap="$2">
          <Label htmlFor={field.name} color={colors.gray[800]}>
            {field.label} {field.required && <Text color={colors.red[500]}>*</Text>}
          </Label>
          
          {renderField(field)}
          
          {field.description && (
            <Text fontSize="$2" color={colors.gray[500]}>{field.description}</Text>
          )}
          {errors[field.name] && (
            <Text fontSize="$2" color={colors.red[500]}>{errors[field.name]}</Text>
          )}
        </YStack>
      ))}

      <XStack gap="$3" justifyContent="flex-end" paddingTop="$4" borderTopWidth={1} borderColor={colors.gray[200]}>
        {onCancel && (
          <Button 
            chromeless 
            onPress={onCancel} 
            disabled={isSubmitting}
          >
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
    </YStack>
  )
}
