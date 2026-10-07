/** Public shopping choices only. Never include booking proof, identity or payment data. */
export const STAY_KEYS = ['checkIn', 'checkOut', 'adults', 'children'] as const;
export function stayParameters(source: URLSearchParams | string) {
  const input = typeof source === 'string' ? new URLSearchParams(source) : source;
  const result = new URLSearchParams();
  for (const key of STAY_KEYS) {
    const value = input.get(key);
    if (value && (key === 'checkIn' || key === 'checkOut' ? /^\d{4}-\d{2}-\d{2}$/.test(value) : /^\d{1,2}$/.test(value))) result.set(key, value);
  }
  return result;
}
export function stayHref(path: string, stay: string) {
  const [base, hash] = path.split('#');
  const [pathname, query = ''] = base.split('?');
  const params = stayParameters(stay);
  new URLSearchParams(query).forEach((value, key) => params.set(key, value));
  return `${pathname}${params.size ? `?${params}` : ''}${hash ? `#${hash}` : ''}`;
}
export function calendarDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function stayNights(from: string, to: string) {
  return calendarDay(from) && calendarDay(to) ? Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) : 0;
}
export function money(minor: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}
export function cancellationTerms(policy?: string | null) {
  if (policy === 'flexible') return 'Full refund until 48 hours before arrival; the first night is retained after that.';
  if (policy === 'moderate') return 'Full refund until 7 days before arrival; 50% until 48 hours before arrival; non-refundable after that.';
  if (policy === 'strict') return '50% refund until 14 days before arrival; non-refundable after that.';
  if (policy === 'non_refundable') return 'Non-refundable after booking.';
  return 'Review the cancellation terms for your selected rate before booking.';
}
export function reservationPresentation(status?: string | null, refundPendingMinor = 0) {
  const states: Record<string, { title: string; label: string; copy: string }> = {
    pending: { title: 'Your reservation is pending.', label: 'Awaiting confirmation', copy: 'This stay is not confirmed yet. Check the latest payment and reservation status before starting another payment.' },
    confirmed: { title: 'We look forward to your stay.', label: 'Reservation confirmed', copy: 'Your reservation is confirmed. Review your statement for the payment received and any remaining balance.' },
    checked_in: { title: 'Make yourself at home.', label: 'Checked in', copy: 'Your stay is in progress. Your statement and the property team are here when you need them.' },
    checked_out: { title: 'Thank you for staying.', label: 'Checked out', copy: 'Review your stay statement below. A final receipt is available only when the property has closed and reconciled your account.' },
    cancelled: { title: 'Your reservation is cancelled.', label: 'Cancelled', copy: 'This reservation is no longer valid for arrival. Check the statement for any fee, balance or refund.' },
    cancellation_pending: { title: 'Your cancellation is processing.', label: 'Cancellation pending', copy: 'This reservation is no longer valid for arrival. Financial processing is still in progress; check your statement for the latest position.' },
    no_show: { title: 'Your arrival was not recorded.', label: 'No show', copy: 'Contact the property to discuss this reservation. The statement shows any charges and payments recorded.' },
  };
  const result = states[status || ''] || { title: 'Review your reservation.', label: 'Status unavailable', copy: 'Refresh the reservation or contact the property before making travel or payment decisions.' };
  return { ...result, copy: `${result.copy}${refundPendingMinor > 0 ? ' A refund is awaiting settlement; it has not yet been recorded as completed.' : ''}` };
}
export function bookingGroup(status?: string | null) {
  if (['cancelled', 'cancellation_pending', 'no_show'].includes(status || '')) return 'cancelled';
  if (status === 'checked_out') return 'past';
  return 'upcoming';
}
