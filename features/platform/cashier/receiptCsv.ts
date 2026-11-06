function cell(value: unknown) {
  const text = String(value ?? '');
  // Neutralize spreadsheet formulas in descriptions and source identifiers.
  return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
}
/** Cents as a plain spreadsheet number in dollars ("12.50"), exact, no float math. */
function dollars(minor: unknown) {
  const value = Math.trunc(Number(minor) || 0);
  const abs = Math.abs(value);
  return `${value < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
export function folioReceiptCsv(receipt: any) {
  const headings = ['Folio', 'Service date', 'Entry type', 'Description', 'Charge', 'Credit', 'Currency', 'Source type', 'Source ID'];
  const rows = receipt.entries.map((entry: any) => [receipt.folioNumber, entry.serviceDate, entry.entryType, entry.description,
    entry.direction === 'debit' ? dollars(entry.amountMinor) : '', entry.direction === 'credit' ? dollars(entry.amountMinor) : '', entry.currencyCode, entry.sourceType, entry.sourceId]);
  return [headings, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}
