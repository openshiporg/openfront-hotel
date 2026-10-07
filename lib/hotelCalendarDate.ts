/** Format a reservation calendar label without browser time-zone shifts. */
export function formatStayDate(value: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: '2-digit', year: 'numeric' }) {
  const label = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) throw new Error('Invalid reservation calendar date.');
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(`${label}T00:00:00Z`));
}
