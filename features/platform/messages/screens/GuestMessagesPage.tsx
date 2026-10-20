'use client';

import React from 'react';
import { Inbox, Mail, Phone, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { Callout, Panel } from '@/features/platform/components/Surface';
import { WorkspaceEmpty, WorkspaceError, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { formatDateTime, humanize } from '@/features/platform/lib/format';
import { getGuestMessages } from '../actions';

type GuestMessage = {
  id: string; reference: string; receivedAt: string; guestName: string; replyTo: string; phone: string;
  subject: string; message: string; deliveryStatus: string; deliveredAt?: string | null; attempts: number;
};
type Workspace = { deliveryConfigured: boolean; notifyAddress: string | null; messages: GuestMessage[] };

/** Contact inquiries from the storefront, readable by the front desk without the audit model view. */
export default function GuestMessagesPage() {
  const [data, setData] = React.useState<Workspace | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getGuestMessages() as Workspace); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Guest messages could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const refresh = <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw aria-hidden="true" />Refresh</Button>;
  return (
    <PlatformPage title="Guest Messages" description="Questions guests send from the contact page. Reply from your own email or phone." actions={refresh}>
      {loading && !data ? <WorkspaceLoading label="Loading guest messages" rows={4} />
        : error ? <WorkspaceError message={error} onRetry={() => void load()} title="Guest messages unavailable" />
        : data ? <div className="space-y-4">
          {!data.deliveryConfigured && <Callout tone="warning" title="Email notifications are off">
            New messages appear here, but no email is sent{data.notifyAddress ? ` to ${data.notifyAddress}` : ''} until email delivery is set up for the property.
          </Callout>}
          {data.messages.length === 0 ? <div className="rounded-lg border bg-card"><WorkspaceEmpty icon={Inbox} title="No guest messages yet" description="Messages sent from the storefront contact page will appear here." /></div>
            : data.messages.map(message => <Panel key={message.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold">{message.guestName || 'Guest'} <span className="font-normal text-muted-foreground">· {humanize(message.subject || 'general')}</span></p>
                  <p className="text-xs text-muted-foreground">Received {formatDateTime(message.receivedAt)} · Reference <span className="font-mono">{message.reference}</span></p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {message.replyTo ? <Button size="sm" variant="outline" asChild><a href={`mailto:${message.replyTo}?subject=${encodeURIComponent(`Re: your message to the property (${message.reference})`)}`}><Mail aria-hidden="true" />Reply by email</a></Button> : null}
                  {message.phone ? <Button size="sm" variant="ghost" asChild><a href={`tel:${message.phone.replace(/[^+\d]/g, '')}`}><Phone aria-hidden="true" />Call</a></Button> : null}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-sm leading-6">{message.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {message.replyTo ? <>From <span className="break-all">{message.replyTo}</span>{message.phone ? ` · ${message.phone}` : ''} · </> : null}
                {message.deliveryStatus === 'delivered' ? `Email notification sent${message.deliveredAt ? ` ${formatDateTime(message.deliveredAt)}` : ''}`
                  : data.deliveryConfigured ? `Email notification ${humanize(message.deliveryStatus)}${message.attempts ? ` after ${message.attempts} ${message.attempts === 1 ? 'attempt' : 'attempts'}` : ''}`
                  : 'Email notification not sent'}
              </p>
            </Panel>)}
        </div> : null}
    </PlatformPage>
  );
}
