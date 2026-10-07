'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getFolioReceipt } from '../actions';
import { folioReceiptCsv } from '../receiptCsv';
export function FolioReceiptPanel({ folioId }: { folioId: string }) {
  const [receipt, setReceipt] = useState<any>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const money = (minor: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: receipt.currencyCode }).format(minor / 100);
  const load = async () => { setBusy(true); setError(''); try { setReceipt(await getFolioReceipt(folioId)); } catch { setError('Itemized folio could not be loaded.'); } finally { setBusy(false); } };
  const download = () => { const url = URL.createObjectURL(new Blob([folioReceiptCsv(receipt)], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${receipt.folioNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`; anchor.click(); URL.revokeObjectURL(url); };
  return <section><Button variant="outline" disabled={busy} onClick={() => void load()}>Itemized receipt / statement</Button>{error && <p role="alert">{error}</p>}
    {receipt && <div className="mt-4 border p-4 print:border-0"><h2 className="text-xl font-semibold">{receipt.kind} {receipt.folioNumber}</h2><p>{receipt.property.name} — {receipt.property.address}</p><p>{receipt.guestName} — {receipt.confirmationNumber}</p>
      <table className="w-full text-left"><thead><tr><th>Service date</th><th>Description</th><th>Charge</th><th>Credit</th></tr></thead><tbody>{receipt.entries.map((entry: any) => <tr key={entry.id}><td>{entry.serviceDate}</td><td>{entry.description}</td><td>{entry.direction === 'debit' ? money(entry.amountMinor) : ''}</td><td>{entry.direction === 'credit' ? money(entry.amountMinor) : ''}</td></tr>)}</tbody></table>
      <p className="font-semibold">Balance: {money(receipt.balanceMinor)}</p><div className="flex gap-2 print:hidden"><Button onClick={() => window.print()}>Print</Button><Button variant="outline" onClick={download}>Export accounting CSV</Button></div>
    </div>}
  </section>;
}
