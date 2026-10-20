'use client';
import { useEffect, useState } from 'react';
import { Printer, ReceiptText, RefreshCw } from 'lucide-react';
import { graphqlClient } from '@/lib/graphql-client';
import { money } from '../lib/stay-context';
import { Notice, Skeleton } from './ui';
interface GuestStatement {
  managedByProperty?: boolean;
  message?: string;
  documentKind: string;
  folioNumber: string;
  status: string;
  currencyCode: string;
  entries: { date: string; description: string; direction: string; amountMinor: number; }[];
  unpostedContractMinor: number;
  balanceDueMinor: number;
  creditMinor: number;
  pendingRefundMinor: number;
}
export function GuestFolioPanel({ bookingId, refreshKey = 0 }: { bookingId: string; refreshKey?: number; }) {
  const [loaded, setLoaded] = useState<{ key: string; data: GuestStatement | null; error: string; } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${bookingId}:${refreshKey}:${attempt}`;
  const data = loaded?.key === key ? loaded.data : null;
  const error = loaded?.key === key ? loaded.error : '';
  useEffect(() => {
    let current = true;
    graphqlClient.request<{ guestFolio: GuestStatement; }>('query($bookingId:ID!){guestFolio(bookingId:$bookingId)}', { bookingId }).then(result => { if (current) setLoaded({ key, data: result.guestFolio || null, error: result.guestFolio ? '' : 'Your statement is unavailable.' }); }).catch(() => { if (current) setLoaded({ key, data: null, error: 'Your statement could not be loaded. Try again or contact the property.' }); });
    return () => { current = false; };
  }, [bookingId, key]);
  return <section id="statement" className="sf-block" aria-labelledby="statement-title">
    <div className="sf-block__head">
      <p className="sf-eyebrow">Your account with the house</p>
      <h2 id="statement-title" className="sf-h2">{data?.documentKind || 'Stay statement'}</h2>
    </div>
    {error ? <Notice tone="danger" role="alert">{error}<div className="sf-row"><button type="button" onClick={() => setAttempt(value => value + 1)} className="sf-btn sf-btn--ghost sf-btn--sm"><RefreshCw aria-hidden="true" />Retry statement</button></div></Notice>
      : !data ? <div role="status" aria-label="Loading your private statement" className="sf-stack"><Skeleton height={18} width="40%" /><Skeleton height={140} radius={16} /></div>
        : data.managedByProperty ? <Notice tone="info">{data.message || 'Contact the property for your statement.'}</Notice> : <>
          <p className="sf-row sf-small sf-muted" style={{ gap: 8, marginBottom: 14 }}><ReceiptText aria-hidden="true" style={{ width: 16 }} />{data.folioNumber} · <span className="sf-badge">{data.status?.replaceAll('_', ' ')}</span></p>
          <div className="sf-card" style={{ padding: '6px 20px', overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Scrollable statement entries">
            <table className="sf-table" style={{ minWidth: 520 }}>
              <caption className="sf-sr">Recorded charges and credits in {data.currencyCode}</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col" className="sf-r">Charge</th>
                  <th scope="col" className="sf-r">Credit</th>
                </tr>
              </thead>
              <tbody>{data.entries.map((entry, index) => <tr key={index}>
                <td style={{ whiteSpace: 'nowrap' }} className="sf-muted">{entry.date}</td>
                <th scope="row">{entry.description}</th>
                <td className="sf-r">{entry.direction === 'debit' ? money(entry.amountMinor, data.currencyCode) : '—'}</td>
                <td className="sf-r">{entry.direction === 'credit' ? money(entry.amountMinor, data.currencyCode) : '—'}</td>
              </tr>)}</tbody>
            </table>
            {!data.entries.length && <p className="sf-muted sf-small" style={{ padding: '14px 0' }}>No statement entries have been posted yet.</p>}
          </div>
          <dl className="sf-dl sf-panel" style={{ padding: '6px 20px', marginTop: 14 }}>
            {data.unpostedContractMinor > 0 && <div><dt>Reserved nights awaiting posting</dt><dd>{money(data.unpostedContractMinor, data.currencyCode)}</dd></div>}
            <div><dt style={{ color: 'var(--ink)', fontWeight: 600 }}>Remaining reservation balance</dt><dd className="sf-amount" style={{ fontSize: '1.5rem' }}>{money(data.balanceDueMinor, data.currencyCode)}</dd></div>
            {data.creditMinor > 0 && <div><dt>Account credit</dt><dd>{money(data.creditMinor, data.currencyCode)}</dd></div>}
            {data.pendingRefundMinor > 0 && <div><dt>Refund awaiting settlement</dt><dd>{money(data.pendingRefundMinor, data.currencyCode)}</dd></div>}
          </dl>
          <p className="sf-fine" style={{ marginTop: 14 }}>Credits may be payments, adjustments or billing transfers. Pending refunds are not completed refunds. Ask the property about an entry or a final receipt.</p>
          <button type="button" className="sf-btn sf-btn--ghost sf-btn--sm sf-noprint" style={{ marginTop: 16 }} onClick={() => window.print()}><Printer aria-hidden="true" />Print reservation and statement</button>
        </>}
  </section>;
}
