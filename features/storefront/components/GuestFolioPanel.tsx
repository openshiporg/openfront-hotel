'use client';
import { useEffect, useState } from 'react';
import { graphqlClient } from '@/lib/graphql-client';
import { money } from '../lib/stay-context';
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
  return <section id="statement" className="border-t border-[var(--lodging-rule)] py-10 scroll-mt-28">
    <p className="lodging-eyebrow mb-3">Your account with the house</p>
    <h2 className="lodging-headline mb-6">{data?.documentKind || 'Stay statement'}</h2>
    {error ? <div className="hotel-notice">
      <p role="alert">{error}</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)} className="lodging-button-ghost mt-4">Retry statement</button>
    </div> : !data ? <p role="status">Loading your private statement…</p> : data.managedByProperty ? <p className="lodging-lead">{data.message || 'Contact the property for your statement.'}</p> : <>
      <p className="mb-6 text-sm">{data.folioNumber} · {data.status?.replaceAll('_', ' ')}</p>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable statement entries">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Recorded charges and credits in {data.currencyCode}</caption>
          <thead>
            <tr>
              <th scope="col" className="p-3 pl-0">Date</th>
              <th scope="col" className="p-3">Description</th>
              <th scope="col" className="p-3 text-right">Charge</th>
              <th scope="col" className="p-3 pr-0 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>{data.entries.map((entry, index) => <tr key={index} className="border-t border-[var(--lodging-rule)]">
            <td className="p-3 pl-0 whitespace-nowrap">{entry.date}</td>
            <th scope="row" className="p-3 font-normal">{entry.description}</th>
            <td className="p-3 text-right whitespace-nowrap">{entry.direction === 'debit' ? money(entry.amountMinor, data.currencyCode) : '—'}</td>
            <td className="p-3 pr-0 text-right whitespace-nowrap">{entry.direction === 'credit' ? money(entry.amountMinor, data.currencyCode) : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!data.entries.length && <p className="hotel-notice my-4">No statement entries have been posted yet.</p>}
      <dl className="lodging-surface mt-6 space-y-4 p-6">
        {data.unpostedContractMinor > 0 && <div className="flex flex-wrap justify-between gap-2">
          <dt>Reserved nights awaiting posting</dt>
          <dd>{money(data.unpostedContractMinor, data.currencyCode)}</dd>
        </div>}
        <div className="flex flex-wrap justify-between gap-2 font-medium">
          <dt>Remaining reservation balance</dt>
          <dd>{money(data.balanceDueMinor, data.currencyCode)}</dd>
        </div>
        {data.creditMinor > 0 && <div className="flex flex-wrap justify-between gap-2">
          <dt>Account credit</dt>
          <dd>{money(data.creditMinor, data.currencyCode)}</dd>
        </div>}
        {data.pendingRefundMinor > 0 && <div className="flex flex-wrap justify-between gap-2">
          <dt>Refund awaiting settlement</dt>
          <dd>{money(data.pendingRefundMinor, data.currencyCode)}</dd>
        </div>}
      </dl>
      <p className="mt-5 text-sm leading-6 text-[var(--lodging-ink-muted)]">Credits may be payments, adjustments or billing transfers. Pending refunds are not completed refunds. Ask the property about an entry or a final receipt.</p>
      <button type="button" className="lodging-button-ghost mt-6 print:hidden" onClick={() => window.print()}>Print reservation and statement</button>
    </>}
  </section>;
}
