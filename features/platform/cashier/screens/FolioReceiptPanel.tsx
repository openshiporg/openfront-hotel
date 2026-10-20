'use client';
import { useState } from 'react';
import { Download, FileText, Loader2, Printer, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ActionMessage } from '@/features/platform/components/Form';
import { DataTable, TBody, Td, Th, THead, Tr } from '@/features/platform/components/DataTable';
import { Callout, Panel, PanelHeader } from '@/features/platform/components/Surface';
import { formatDateTime, formatStay } from '@/features/platform/lib/format';
import { getFolioReceipt } from '../actions';
import { folioReceiptCsv } from '../receiptCsv';

// While printing, only the statement is visible; the dashboard, other folios and controls are hidden.
const PRINT_CLASS = 'hotel-print-statement';
const PRINT_CSS = `@media print {
  html.${PRINT_CLASS} body * { visibility: hidden !important; }
  html.${PRINT_CLASS} [data-print-statement], html.${PRINT_CLASS} [data-print-statement] * { visibility: visible !important; }
  html.${PRINT_CLASS} [data-print-statement] { position: absolute; left: 0; top: 0; width: 100%; }
  html.${PRINT_CLASS} [data-print-statement] .overflow-auto { overflow: visible !important; }
}`;

/**
 * Itemized guest statement for one folio, printable and exportable as accounting CSV.
 * The statement is a live reading of the ledger: `ledgerRevision` changes whenever the
 * folio's postings change, and a statement read at an older revision must be refreshed
 * before it can be printed or exported.
 */
export function FolioReceiptPanel({ folioId, ledgerRevision }: { folioId: string; ledgerRevision: string }) {
  const [receipt, setReceipt] = useState<any>(null);
  const [readAt, setReadAt] = useState<{ revision: string; at: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const stale = Boolean(receipt && readAt && readAt.revision !== ledgerRevision);
  const money = (minor: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: receipt.currencyCode }).format(minor / 100);
  const load = async () => {
    const revision = ledgerRevision;
    setBusy(true); setError('');
    try { setReceipt(await getFolioReceipt(folioId)); setReadAt({ revision, at: new Date().toISOString() }); }
    catch { setError('Itemized folio could not be loaded.'); }
    finally { setBusy(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([folioReceiptCsv(receipt)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${receipt.folioNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const print = () => {
    const root = document.documentElement;
    const cleanup = () => root.classList.remove(PRINT_CLASS);
    root.classList.add(PRINT_CLASS);
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  };

  return (
    <Panel>
      <style>{PRINT_CSS}</style>
      <PanelHeader
        title="Itemized statement"
        description="Guest-facing receipt of every posting on this folio."
        icon={FileText}
        actions={receipt ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}Refresh statement</Button>
            <Button size="sm" variant="outline" disabled={busy || stale} onClick={print}><Printer aria-hidden="true" />Print</Button>
            <Button size="sm" variant="outline" disabled={busy || stale} onClick={download}><Download aria-hidden="true" />Accounting CSV</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileText aria-hidden="true" />}Generate statement</Button>
        )}
      />
      {error ? <div className="p-4"><ActionMessage feedback={{ tone: 'error', text: error }} /></div> : null}
      {stale ? <div className="p-4"><Callout tone="warning" title="This folio has changed">Refresh the statement before printing or exporting it.</Callout></div> : null}
      {receipt ? (
        <div data-print-statement>
          <div className="grid gap-4 border-b px-4 py-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-base font-semibold">{receipt.property.name}</p>
              <p className="text-muted-foreground">{receipt.property.address}</p>
            </div>
            <div className="sm:text-right">
              <p className="font-medium">{receipt.kind} <span className="font-mono">{receipt.folioNumber}</span></p>
              <p className="text-muted-foreground">{receipt.guestName} · <span className="font-mono">{receipt.confirmationNumber}</span></p>
              {readAt ? <p className="text-xs text-muted-foreground">As of {formatDateTime(readAt.at)}</p> : null}
            </div>
          </div>
          <DataTable minWidth="min-w-[560px]">
            <THead>
              <tr><Th>Service date</Th><Th>Description</Th><Th align="right">Charge</Th><Th align="right">Credit</Th></tr>
            </THead>
            <TBody>
              {receipt.entries.map((entry: any) => (
                <Tr key={entry.id}>
                  <Td className="whitespace-nowrap text-muted-foreground">{formatStay(entry.serviceDate)}</Td>
                  <Td>{entry.description}</Td>
                  <Td numeric align="right">{entry.direction === 'debit' ? money(entry.amountMinor) : ''}</Td>
                  <Td numeric align="right" className="text-emerald-700 dark:text-emerald-400">{entry.direction === 'credit' ? money(entry.amountMinor) : ''}</Td>
                </Tr>
              ))}
            </TBody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-semibold">
                <Td colSpan={3} align="right">Balance</Td>
                <Td numeric align="right">{money(receipt.balanceMinor)}</Td>
              </tr>
            </tfoot>
          </DataTable>
        </div>
      ) : null}
    </Panel>
  );
}
