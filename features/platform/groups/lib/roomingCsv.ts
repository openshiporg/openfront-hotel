/** Quoted CSV import with explicit row/column errors, no spreadsheet execution. */
export function parseRoomingCsv(source: string) {
  if (source.length > 100000) throw new Error('Rooming-list file exceeds 100 KB.');
  const records: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && source[i + 1] === '\n') i++; row.push(cell); if (row.some(value => value.trim())) records.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) throw new Error('Rooming list has an unclosed quoted field.');
  row.push(cell); if (row.some(value => value.trim())) records.push(row);
  const headers = records.shift()?.map(value => value.trim()) || [];
  const required = ['rowId', 'guestName', 'guestEmail', 'numberOfGuests'];
  if (required.some(field => !headers.includes(field)) || new Set(headers).size !== headers.length) throw new Error('CSV needs unique rowId, guestName, guestEmail and numberOfGuests columns. Optional guestPhone and specialRequests columns are supported.');
  if (records.length < 1 || records.length > 50) throw new Error('Import 1–50 guest rooms at a time.');
  return records.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${cells.length} fields; expected ${headers.length}.`);
    const record = Object.fromEntries(headers.map((header, i) => [header, cells[i].trim()]));
    return { rowId: record.rowId, guestName: record.guestName, guestEmail: record.guestEmail, numberOfGuests: Number(record.numberOfGuests), guestPhone: record.guestPhone || '', specialRequests: record.specialRequests || '' };
  });
}
