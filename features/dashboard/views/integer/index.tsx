/**
 * Integer field view - Keystone implementation with Shadcn UI
 */

'use client'

import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FieldContainer } from '@/components/ui/field-container'
import { FieldLabel } from '@/components/ui/field-label'
import { FieldDescription } from '@/components/ui/field-description'
import { Info } from 'lucide-react'
import { entriesTyped } from '../../lib/entriesTyped'
import { dollarsToMinor, formatMoneyMinor } from '@/features/platform/lib/format'

// Hotel money is stored as whole cents in fields named *Minor. Staff always type and read dollars.
// Cent fields that predate the *Minor naming.
const CENT_PATHS = new Set(['amount', 'priceAdjustment', 'totalAmount', 'commission', 'unitPrice', 'totalPrice', 'averageDailyRate', 'revenuePerAvailableRoom', 'totalRevenue'])
const money2 = (minor: number | null | undefined) => (minor === null || minor === undefined ? "" : (minor / 100).toFixed(2))
const isMoney = (field: { path: string; label?: string }) => /Minor$/.test(field.path) || CENT_PATHS.has(field.path)
const moneyLabel = (label: string) => label

function MoneyField({ field, value, onChange, autoFocus, forceValidation, isRequired = false }: IntegerFieldProps) {
  const [text, setText] = useState(() => money2(value.value))
  const [isDirty, setDirty] = useState(false)
  const min = field.validation?.min
  const signed = min === undefined || min < 0
  const parsed = text.trim() === '' ? null : dollarsToMinor(text, { allowZero: true, signed })
  const invalid = text.trim() !== '' && parsed === null
  const error = (forceValidation || isDirty) && (invalid ? `Enter an amount in dollars, like 125 or 125.50` : isRequired && parsed === null ? `${field.label} is required` : undefined)
  return (
    <FieldContainer>
      <FieldLabel htmlFor={`field-${field.path}`}>{moneyLabel(field.label)}</FieldLabel>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          id={`field-${field.path}`}
          inputMode="decimal"
          autoFocus={autoFocus}
          readOnly={!onChange}
          required={isRequired}
          placeholder="0.00"
          value={text}
          onBlur={() => { setDirty(true); if (parsed !== null) setText(money2(parsed)) }}
          onChange={(e) => { setText(e.target.value); const next = e.target.value.trim() === '' ? null : dollarsToMinor(e.target.value, { allowZero: true, signed }); if (onChange && (next !== null || e.target.value.trim() === '')) onChange({ ...value, value: next }) }}
          className={error ? 'border-red-500 pl-7 shadow-xs' : 'pl-7 shadow-xs'}
        />
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </FieldContainer>
  )
}
import type {
  FieldController,
  FieldControllerConfig,
  FieldProps,
} from '../../types'

// Types matching Keystone exactly
type Value =
  | { kind: 'create'; value: number | null }
  | { kind: 'update'; initial: number | null; value: number | null }

type Validation = {
  min: number
  max: number
}

interface IntegerFieldProps {
  field: {
    path: string
    label: string
    description?: string
    validation: Validation
    hasAutoIncrementDefault: boolean
  }
  value: Value
  onChange?: (value: Value) => void
  autoFocus?: boolean
  forceValidation?: boolean
  isRequired?: boolean
}

interface CellProps {
  item: Record<string, any>
  field: any
}

// Validation function - exact copy from Keystone
function validate_(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  const { value: input, kind } = value
  if (kind === 'create' && hasAutoIncrementDefault && input === null) return
  if (kind === 'update' && (value as any).initial === null && input === null) return
  if (isRequired && input === null) return `${label} is required`
  if (typeof input !== 'number') return
  const v = input
  if (!Number.isInteger(v)) return `${label} is not a valid integer`
  if (validation.min !== undefined && v < validation.min)
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && v > validation.max)
    return `${label} must be less than or equal to ${validation.max}`
}

export function Field({
  field,
  value,
  onChange,
  autoFocus,
  forceValidation,
  isRequired = false,
}: IntegerFieldProps) {
  if (isMoney(field)) return <MoneyField field={field} value={value} onChange={onChange} autoFocus={autoFocus} forceValidation={forceValidation} isRequired={isRequired} />
  return <IntegerField field={field} value={value} onChange={onChange} autoFocus={autoFocus} forceValidation={forceValidation} isRequired={isRequired} />
}

function IntegerField({
  field,
  value,
  onChange,
  autoFocus,
  forceValidation,
  isRequired = false,
}: IntegerFieldProps) {
  const [isDirty, setDirty] = useState(false)
  const isReadOnly = !onChange || field.hasAutoIncrementDefault

  if (field.hasAutoIncrementDefault && value.kind === 'create') {
    return (
      <FieldContainer>
        <FieldLabel htmlFor={`field-${field.path}`}>{field.label}</FieldLabel>
        {field.description && (
          <FieldDescription>{field.description}</FieldDescription>
        )}
        <Input
          id={`field-${field.path}`}
          readOnly
          value="Auto increment"
          className="bg-muted shadow-xs"
        />
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This field is set to auto increment. It will default to the next available number.
          </AlertDescription>
        </Alert>
      </FieldContainer>
    )
  }

  const validate = (value: Value) => {
    return validate_(
      value,
      field.validation,
      isRequired,
      field.label,
      field.hasAutoIncrementDefault
    )
  }

  const errorMessage = (forceValidation || isDirty) && validate(value)

  return (
    <FieldContainer>
      <FieldLabel htmlFor={`field-${field.path}`}>{field.label}</FieldLabel>
      {field.description && (
        <FieldDescription>{field.description}</FieldDescription>
      )}
      <Input
        id={`field-${field.path}`}
        type="number"
        step="1"
        autoFocus={autoFocus}
        readOnly={isReadOnly}
        required={isRequired}
        onBlur={() => setDirty(true)}
        onChange={(e) => {
          if (!onChange) return
          const numValue = e.target.value === '' ? null : Number(e.target.value)
          onChange({ ...value, value: !Number.isFinite(numValue) ? null : numValue })
        }}
        value={value.value ?? ''}
        className={errorMessage ? 'border-red-500 shadow-xs' : 'shadow-xs'}
      />
      {errorMessage && (
        <p className="text-sm text-red-600" role="alert">{errorMessage}</p>
      )}
    </FieldContainer>
  )
}

export function Cell({ item, field }: CellProps) {
  const value = item[field.path]
  if (isMoney(field)) return <span className="text-sm tabular-nums">{value !== null && value !== undefined ? formatMoneyMinor(value) : <span className="text-muted-foreground">—</span>}</span>
  return (
    <span className="text-sm font-mono">
      {value !== null && value !== undefined ? value.toString() : <span className="text-muted-foreground">—</span>}
    </span>
  )
}

export function CardValue({ item, field }: CellProps) {
  const value = item[field.path]
  return (
    <div>
      <div className="text-sm font-medium">{isMoney(field) ? moneyLabel(field.label) : field.label}</div>
      <div className="text-sm text-muted-foreground font-mono">
        {value !== null && value !== undefined ? (isMoney(field) ? formatMoneyMinor(value) : value.toString()) : '—'}
      </div>
    </div>
  )
}

export function controller(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
): FieldController<Value> & {
  validation: Validation
  hasAutoIncrementDefault: boolean
} {
  const validate = (value: Value, opts: { isRequired: boolean }) => {
    return validate_(
      value,
      config.fieldMeta?.validation || { min: -Infinity, max: Infinity },
      opts.isRequired,
      config.label,
      config.fieldMeta?.defaultValue === 'autoincrement'
    )
  }

  return {
    path: config.path,
    label: config.label,
    description: isMoney(config) ? null : config.description,
    graphqlSelection: config.path,
    validation: config.fieldMeta?.validation || { min: -Infinity, max: Infinity },
    defaultValue: {
      kind: 'create',
      value:
        config.fieldMeta?.defaultValue === 'autoincrement' ? null : config.fieldMeta?.defaultValue ?? null,
    },
    deserialize: data => ({ kind: 'update', value: data[config.path], initial: data[config.path] }),
    serialize: value => ({ [config.path]: value.value }),
    hasAutoIncrementDefault: config.fieldMeta?.defaultValue === 'autoincrement',
    validate: (value, opts) => validate(value, opts) === undefined,
    filter: {
      Filter: ({ value, onChange, type, autoFocus }: any) => {
        const [isDirty, setDirty] = useState(false)
        if (type === 'empty' || type === 'not_empty') return null

        return (
          <Input
            type="number"
            step="1"
            autoFocus={autoFocus}
            value={value ?? ''}
            onBlur={() => setDirty(true)}
            onChange={(e) => {
              const numValue = e.target.value === '' ? null : Number(e.target.value)
              onChange(!Number.isFinite(numValue) ? null : numValue)
            }}
            placeholder="Enter number..."
          />
        )
      },
      graphql: ({ type, value }: { type: string; value: number }) => {
        if (type === 'empty') return { [config.path]: { equals: null } }
        if (type === 'not_empty') return { [config.path]: { not: { equals: null } } }
        if (type === 'not') return { [config.path]: { not: { equals: value } } }
        return { [config.path]: { [type]: value } }
      },
      parseGraphQL: (value: any) => {
        return entriesTyped(value).flatMap(([type, value]) => {
          if (type === 'equals' && value === null) {
            return [{ type: 'empty', value: null }]
          }
          if (!value) return []
          if (type === 'equals') return { type: 'equals', value }
          if (type === 'not') {
            if (value?.equals === null) return { type: 'not_empty', value: null }
            if (value?.equals === undefined) return []
            return { type: 'not', value: value.equals }
          }
          if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
            return { type, value }
          }
          return []
        })
      },
      Label: ({ label, type, value }: { label: string; type: string; value: number }) => {
        if (type === 'empty' || type === 'not_empty') return label.toLowerCase()
        const TYPE_OPERATOR_MAP = {
          equals: '=',
          not: '≠',
          gt: '>',
          lt: '<',
          gte: '≥',
          lte: '≤',
        } as const
        const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
        return `${operator} ${value}`
      },
      types: {
        equals: { label: 'Is exactly', initialValue: '' },
        not: { label: 'Is not exactly', initialValue: '' },
        gt: { label: 'Is greater than', initialValue: '' },
        lt: { label: 'Is less than', initialValue: '' },
        gte: { label: 'Is greater than or equal to', initialValue: '' },
        lte: { label: 'Is less than or equal to', initialValue: '' },
        empty: { label: 'Is empty', initialValue: '' },
        not_empty: { label: 'Is not empty', initialValue: '' },
      } as any,
    } as any,
  }
}

Cell.supportsLinkTo = false