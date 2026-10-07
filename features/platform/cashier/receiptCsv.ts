function cell(value: unknown) {
  const text = String(value ?? '');
  // Neutralize spreadsheet formulas in descriptions and source identifiers.
  return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
}
export function folioReceiptCsv(receipt: any) {
  const headings = ['Folio', 'Service date', 'Entry type', 'Description', 'Debit minor units', 'Credit minor units', 'Currency', 'Source type', 'Source ID'];
  const rows = receipt.entries.map((entry: any) => [receipt.folioNumber, entry.serviceDate, entry.entryType, entry.description,
    entry.direction === 'debit' ? entry.amountMinor : 0, entry.direction === 'credit' ? entry.amountMinor : 0, entry.currencyCode, entry.sourceType, entry.sourceId]);
  return [headings, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}
