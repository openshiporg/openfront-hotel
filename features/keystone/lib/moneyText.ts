/** Integer cents as staff-readable dollars for error messages ("$12.00"). Never shows "minor units". */
export function moneyText(minor: number, currencyCode = 'USD') {
  const value = Number(minor);
  if (!Number.isFinite(value)) return String(minor);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode || 'USD' }).format(value / 100);
}
