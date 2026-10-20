'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, Briefcase, CalendarClock, ChevronRight, FileText, Heart, Mail, MapPin, MessageSquare, Phone, Plus, Shield, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StatStrip } from '@/features/platform/components/Stats';
import { StatusPill, Tag } from '@/features/platform/components/StatusPill';
import { DetailList, InitialsAvatar, Panel, PanelBody, PanelHeader, SectionLabel } from '@/features/platform/components/Surface';
import { WorkspaceTabs, WorkspaceTabsContent, WorkspaceTabsList, WorkspaceTabsTrigger } from '@/features/platform/components/Tabs';
import { WorkspaceEmpty } from '@/features/platform/components/WorkspaceControls';
import { formatMoney, formatStay, formatStayRange, humanize, nightsBetween, pluralize } from '@/features/platform/lib/format';

export interface GuestPreferences {
  pillowType?: string;
  floorPreference?: string;
  smokingPreference?: string;
  bedType?: string;
  earlyCheckIn?: boolean;
  lateCheckOut?: boolean;
  specialDiet?: string;
  accessibility?: string[];
}

export interface GuestBooking {
  id: string;
  confirmationNumber: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  totalAmount: number;
  roomType?: string;
  specialRequests?: string;
}

export interface GuestDocument {
  id: string;
  type: string;
  documentNumber: string;
  expiryDate?: string;
  isVerified: boolean;
}

export interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  loyaltyNumber?: string;
  loyaltyTier?: string;
  loyaltyPoints?: string;
  preferences?: GuestPreferences;
  idType?: string;
  idNumber?: string;
  nationality?: string;
  isVip?: boolean;
  isBlacklisted?: boolean;
  specialNotes?: string;
  lastStayAt?: string;
  totalStays?: string;
  totalSpent?: string;
  bookings?: GuestBooking[];
  documents?: GuestDocument[];
  createdAt?: string;
}

interface GuestProfileProps {
  guest: Guest;
  onEdit?: () => void;
  onSendEmail?: () => void;
  onNewReservation?: () => void;
  onAddNote?: () => void;
}

const ID_LABELS: Record<string, string> = { passport: 'Passport', drivers_license: "Driver's license", national_id: 'National ID' };

const NOT_RECORDED = 'Not recorded';
/** A stored preference, or "Not recorded" when the guest has not told us. */
const recorded = (value: unknown) => (typeof value === 'string' && value.trim() ? value : NOT_RECORDED);
const recordedYesNo = (value: unknown) => (value === true ? 'Yes' : value === false ? 'No' : NOT_RECORDED);

export function GuestProfile({ guest, onAddNote }: GuestProfileProps) {
  const name = `${guest.firstName || ''} ${guest.lastName || ''}`.trim();
  const upcomingBookings = guest.bookings?.filter((b) => ['pending', 'confirmed', 'checked_in', 'cancellation_pending'].includes(b.status)) || [];
  const pastBookings = guest.bookings?.filter((b) => b.status === 'checked_out') || [];
  const cancelledBookings = guest.bookings?.filter((b) => ['cancelled', 'no_show'].includes(b.status)) || [];
  const totalNights = pastBookings.reduce((acc, booking) => acc + nightsBetween(booking.checkInDate, booking.checkOutDate), 0);
  const preferences = guest.preferences || {};
  const address = [guest.address1, guest.address2, [guest.city, guest.state].filter(Boolean).join(', ') + (guest.postalCode ? ` ${guest.postalCode}` : ''), guest.country].map((line) => line?.trim()).filter(Boolean);

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
          <InitialsAvatar name={name || '?'} tone={guest.isBlacklisted ? 'restricted' : guest.isVip ? 'vip' : 'neutral'} className="size-16 text-lg" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold leading-7">{name || 'Unnamed guest'}</h2>
              {guest.isVip ? <StatusPill tone="warning" label={<span className="inline-flex items-center gap-1"><Star className="size-3" aria-hidden="true" />VIP</span>} /> : null}
              {guest.isBlacklisted ? <StatusPill tone="danger" label="Restricted" /> : null}
              {guest.loyaltyTier ? <Tag>{humanize(guest.loyaltyTier)} legacy tier{guest.loyaltyNumber ? ` · ${guest.loyaltyNumber}` : ''}</Tag> : null}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
              {guest.email ? <a href={`mailto:${guest.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground"><Mail className="size-3.5" aria-hidden="true" />{guest.email}</a> : null}
              {guest.phone ? <a href={`tel:${guest.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground"><Phone className="size-3.5" aria-hidden="true" />{guest.phone}</a> : null}
              {guest.company ? <span className="inline-flex items-center gap-1.5"><Briefcase className="size-3.5" aria-hidden="true" />{guest.company}</span> : null}
              {guest.createdAt ? <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5" aria-hidden="true" />Guest since {formatStay(guest.createdAt, { month: 'short', year: 'numeric' })}</span> : null}
            </div>
          </div>
        </div>
      </Panel>

      <StatStrip
        items={[
          { label: 'Completed stays shown', value: pastBookings.length, hint: `${upcomingBookings.length} current or upcoming` },
          { label: 'Nights stayed', value: totalNights, hint: 'Across completed stays shown' },
          { label: 'Stay value shown', value: formatMoney(pastBookings.reduce((acc, b) => acc + (b.totalAmount || 0), 0)), hint: 'Booked totals, not payments' },
          { label: 'Legacy points', value: guest.loyaltyPoints || '0', hint: 'Read-only' },
        ]}
      />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel>
          <WorkspaceTabs defaultValue="stays">
            <WorkspaceTabsList className="pt-1">
              <WorkspaceTabsTrigger value="stays" count={guest.bookings?.length || 0}>Stays</WorkspaceTabsTrigger>
              <WorkspaceTabsTrigger value="preferences">Preferences</WorkspaceTabsTrigger>
              <WorkspaceTabsTrigger value="identity">Identity</WorkspaceTabsTrigger>
              <WorkspaceTabsTrigger value="notes">Notes</WorkspaceTabsTrigger>
            </WorkspaceTabsList>

            <WorkspaceTabsContent value="stays">
              {guest.bookings?.length ? (
                <div className="divide-y">
                  <BookingGroup title="Current & upcoming" bookings={upcomingBookings} />
                  <BookingGroup title="Past stays" bookings={pastBookings} emptyLabel="No completed stays recorded." />
                  <BookingGroup title="Cancelled & no-shows" bookings={cancelledBookings} muted />
                </div>
              ) : (
                <WorkspaceEmpty icon={CalendarClock} title="No reservations yet" description="Stays booked for this guest will appear here." />
              )}
              <p className="border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">Latest 100 reservations. Use Analytics for totals over a period.</p>
            </WorkspaceTabsContent>

            <WorkspaceTabsContent value="preferences">
              <PanelBody className="grid gap-8 md:grid-cols-2">
                <div className="space-y-3">
                  <SectionLabel>Room</SectionLabel>
                  <PreferenceList items={[
                    ['Pillow type', recorded(preferences.pillowType)],
                    ['Floor', recorded(preferences.floorPreference)],
                    ['Bed type', recorded(preferences.bedType)],
                    ['Smoking', recorded(preferences.smokingPreference)],
                  ]} />
                </div>
                <div className="space-y-3">
                  <SectionLabel>Service</SectionLabel>
                  <PreferenceList items={[
                    ['Early check-in', recordedYesNo(preferences.earlyCheckIn)],
                    ['Late check-out', recordedYesNo(preferences.lateCheckOut)],
                    ['Special diet', recorded(preferences.specialDiet)],
                    ...(preferences.accessibility?.length ? [['Accessibility', preferences.accessibility.join(', ')] as [string, string]] : []),
                  ]} />
                </div>
              </PanelBody>
            </WorkspaceTabsContent>

            <WorkspaceTabsContent value="identity">
              {!guest.idType ? (
                <WorkspaceEmpty icon={FileText} title="No identity details on file" description="Verification evidence is recorded through Guest Governance." />
              ) : (
                <PanelBody>
                  <div className="flex items-start gap-4 rounded-lg border p-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Shield className="size-5" aria-hidden="true" /></span>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{ID_LABELS[guest.idType] || 'Other ID'}</p>
                        <StatusPill tone="neutral" label={<span className="inline-flex items-center gap-1"><AlertCircle className="size-3" aria-hidden="true" />Verification in Guest Governance</span>} />
                      </div>
                      <p className="font-mono text-sm text-muted-foreground">{guest.idNumber ? `•••• ${guest.idNumber.slice(-4)}` : 'On file'}</p>
                      {guest.nationality ? <p className="text-sm text-muted-foreground">Nationality: {guest.nationality}</p> : null}
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Identity verification is recorded in <Link href="/dashboard/platform/guest-governance" className="underline underline-offset-2">Guest Governance</Link>.</p>
                </PanelBody>
              )}
            </WorkspaceTabsContent>

            <WorkspaceTabsContent value="notes">
              {!guest.specialNotes ? (
                <WorkspaceEmpty
                  icon={MessageSquare}
                  title="No notes recorded"
                  description="Important service context for this guest belongs here."
                  action={onAddNote ? <Button variant="outline" size="sm" onClick={onAddNote}><Plus aria-hidden="true" />Add note</Button> : undefined}
                />
              ) : (
                <PanelBody>
                  <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-sm leading-6">{guest.specialNotes}</p>
                </PanelBody>
              )}
            </WorkspaceTabsContent>
          </WorkspaceTabs>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Contact" icon={MapPin} />
            <PanelBody>
              <DetailList
                columns={1}
                items={[
                  { label: 'Email', value: guest.email || '—' },
                  { label: 'Phone', value: guest.phone || '—' },
                  { label: 'Company', value: guest.company, hidden: !guest.company },
                  { label: 'Address', value: address.length ? <address className="not-italic">{address.map((line) => <span key={line} className="block">{line}</span>)}</address> : 'No address on file' },
                ]}
              />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Service flags" icon={Heart} />
            <PanelBody>
              <DetailList
                columns={1}
                items={[
                  { label: 'VIP', value: guest.isVip ? 'Yes' : 'No' },
                  { label: 'Restricted', value: guest.isBlacklisted ? <span className="text-rose-700 dark:text-rose-400">Yes — review before booking</span> : 'No' },
                  { label: 'Last stay', value: guest.lastStayAt ? formatStay(guest.lastStayAt) : 'Never' },
                ]}
              />
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function PreferenceList({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="divide-y rounded-lg border text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 px-3 py-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function BookingGroup({ title, bookings, emptyLabel, muted }: { title: string; bookings: GuestBooking[]; emptyLabel?: string; muted?: boolean }) {
  if (!bookings.length && !emptyLabel) return null;
  return (
    <section>
      <div className="flex items-center justify-between bg-muted/30 px-4 py-2 sm:px-5">
        <SectionLabel>{title}</SectionLabel>
        <span className="text-xs tabular-nums text-muted-foreground">{bookings.length}</span>
      </div>
      {bookings.length ? (
        <ul className="divide-y">
          {bookings.map((booking) => {
            const nights = nightsBetween(booking.checkInDate, booking.checkOutDate);
            return (
              <li key={booking.id}>
                <Link href={`/dashboard/bookings/${booking.id}`} className={cn('group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30 sm:px-5', muted && 'opacity-75')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{booking.confirmationNumber}</span>
                      <StatusPill kind="booking" value={booking.status} />
                    </div>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>{formatStayRange(booking.checkInDate, booking.checkOutDate)}</span>
                      <span>{pluralize(nights, 'night')}</span>
                      {booking.roomType ? <span>{booking.roomType}</span> : null}
                    </p>
                    {booking.specialRequests ? <p className="mt-1 truncate text-xs text-muted-foreground"><span className="font-medium text-foreground/80">Requests:</span> {booking.specialRequests}</p> : null}
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(booking.totalAmount || 0)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="px-4 py-4 text-sm text-muted-foreground sm:px-5">{emptyLabel}</p>}
    </section>
  );
}

export default GuestProfile;
