import 'server-only';

import type { KeystoneResponse } from '@/features/dashboard/lib/keystoneClient';
import { safeActionMessage, safeGraphQLError } from '@/features/platform/lib/safeGraphQLError';
import type { ActionResult } from './actionOutcome';

export const HOTEL_PROPERTY_KEY = 'the-alder-house';

/** The shared Openfront client appends paths and codes for developers; staff see only the business rule. */
export function requireActionData<T>(response: KeystoneResponse<T>): T {
  if (!response.success) {
    const errors = Array.isArray(response.errors) ? response.errors : [];
    throw new Error(errors.length ? safeGraphQLError({ response: { errors } }).message : 'The request could not be completed.');
  }
  return response.data;
}

const ACTION_FALLBACK = 'The request could not be completed. Refresh and review the record before trying again.';

/** Run a mutation and return its failure as a value so staff see the actual reason. */
export async function toActionResult<T>(operation: () => Promise<T>, fallback = ACTION_FALLBACK): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return { ok: false, message: safeActionMessage(error, fallback) };
  }
}

export function boundedId(value: unknown, label = 'ID'): string {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

export function boundedText(value: unknown, label: string, max: number, required = false): string {
  const normalized = String(value || '').trim();
  if ((required && !normalized) || normalized.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

export function boundedEnum<T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
  const normalized = String(value || '') as T;
  if (!allowed.includes(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

export function boundedInteger(
  value: unknown,
  label: string,
  { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < min || normalized > max) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

export function boundedIsoDate(value: unknown, label: string): string {
  const normalized = String(value || '');
  const date = new Date(normalized);
  if (!normalized || normalized.length > 40 || Number.isNaN(date.getTime())) {
    throw new Error(`${label} is invalid.`);
  }
  return date.toISOString();
}

export function boundedDateRange(start: unknown, end: unknown, maxDays: number) {
  const normalizedStart = boundedIsoDate(start, 'Start date');
  const normalizedEnd = boundedIsoDate(end, 'End date');
  const duration = new Date(normalizedEnd).getTime() - new Date(normalizedStart).getTime();
  if (duration <= 0 || duration > maxDays * 86_400_000) throw new Error('Date range is invalid.');
  return { start: normalizedStart, end: normalizedEnd };
}
