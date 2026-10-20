'use client';

import * as React from 'react';
import { CalendarPlus, Loader2, ReceiptText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Field, FieldInput, FormNote, NativeSelect } from '@/features/platform/components/Form';
import { SectionLabel } from '@/features/platform/components/Surface';
import { humanize, pluralize } from '@/features/platform/lib/format';
import { createStaffReservationAction, getStaffReservationOptions, getStaffReservationQuote } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';

type RatePlan = {
  id: string;
  name: string;
  baseRate: number;
  currencyCode: string;
  cancellationPolicy: string;
  mealPlan: string;
  isPromotional: boolean;
};

type RoomType = { id: string; name: string; maxOccupancy: number; ratePlans: RatePlan[] };

type Quote = {
  ratePlanName: string;
  nights: number;
  roomSubtotalMinor: number;
  taxAmountMinor: number;
  feesAmountMinor: number;
  totalAmountMinor: number;
  currencyCode: string;
  cancellationPolicy: string;
  quoteToken: string;
};

function utcDateInput(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10);
}

function money(amountMinor: number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amountMinor / 100);
}

export function StaffReservationForm({
  onCreated,
  initialGuestId,
  defaultOpen = false,
}: {
  onCreated?: () => Promise<void> | void;
  initialGuestId?: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [optionsLoading, setOptionsLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [roomTypes, setRoomTypes] = React.useState<RoomType[]>([]);
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const createPendingRef = React.useRef(false);
  const idempotencyKeyRef = React.useRef<string | null>(null);
  const [form, setForm] = React.useState({
    guestName: '', guestEmail: '', guestPhone: '',
    checkInDate: utcDateInput(1),
    checkOutDate: utcDateInput(2),
    numberOfAdults: '1', numberOfChildren: '0', roomTypeId: '', ratePlanId: '', promoCode: '',
    source: 'phone', status: 'confirmed', specialRequests: '', internalNotes: '',
  });

  const update = (values: Partial<typeof form>) => {
    setForm(current => ({ ...current, ...values }));
    setQuote(null);
    idempotencyKeyRef.current = null;
  };

  React.useEffect(() => {
    if (!open || roomTypes.length) return;
    const load = async () => {
      setOptionsLoading(true);
      try {
        const data = await getStaffReservationOptions(initialGuestId) as {
          roomTypes: RoomType[];
          guest?: { firstName: string; lastName: string; email: string; phone?: string | null } | null;
        };
        const guest = data.guest;
        setRoomTypes(data.roomTypes || []);
        const room = data.roomTypes?.[0];
        const plan = room?.ratePlans?.find(item => !item.isPromotional) || room?.ratePlans?.[0];
        setForm(current => ({
          ...current,
          roomTypeId: room?.id || '',
          ratePlanId: plan?.id || '',
          ...(guest ? {
            guestName: `${guest.firstName} ${guest.lastName}`.trim(),
            guestEmail: guest.email,
            guestPhone: guest.phone || '',
          } : {}),
        }));
      } catch (error) {
        toast.error('Reservation options unavailable', { description: error instanceof Error ? error.message : 'Unable to load rates.' });
      } finally {
        setOptionsLoading(false);
      }
    };
    void load();
  }, [open, roomTypes.length, initialGuestId]);

  const selectedRoom = roomTypes.find(room => room.id === form.roomTypeId);
  const selectedPlan = selectedRoom?.ratePlans.find(plan => plan.id === form.ratePlanId);

  const quoteVariables = () => ({
    roomTypeId: form.roomTypeId,
    ratePlanId: form.ratePlanId,
    checkInDate: new Date(`${form.checkInDate}T00:00:00.000Z`).toISOString(),
    checkOutDate: new Date(`${form.checkOutDate}T00:00:00.000Z`).toISOString(),
    numberOfAdults: Number(form.numberOfAdults),
    numberOfChildren: Number(form.numberOfChildren),
    promoCode: form.promoCode || null,
  });

  const preview = async () => {
    setBusy(true);
    try {
      setQuote(unwrapAction(await getStaffReservationQuote(quoteVariables())) as Quote);
      idempotencyKeyRef.current = crypto.randomUUID();
    } catch (error) {
      toast.error('Quote unavailable', { description: error instanceof Error ? error.message : 'Check dates, occupancy, and rate restrictions.' });
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!quote || createPendingRef.current) return;
    createPendingRef.current = true;
    setBusy(true);
    try {
      const booking = unwrapAction(await createStaffReservationAction({
        ...quoteVariables(),
        quoteToken: quote.quoteToken,
        idempotencyKey: idempotencyKeyRef.current || crypto.randomUUID(),
        guestName: form.guestName,
        guestEmail: form.guestEmail,
        guestPhone: form.guestPhone || null,
        specialRequests: form.specialRequests || null,
        internalNotes: form.internalNotes || null,
        source: form.source,
        status: form.status,
      }));
      toast.success('Reservation created', { description: `Confirmation ${booking.confirmationNumber} was persisted.` });
      setOpen(false);
      setQuote(null);
      idempotencyKeyRef.current = null;
      await onCreated?.();
    } catch (error) {
      toast.error('Reservation not created', { description: error instanceof Error ? error.message : 'The reservation failed validation.' });
    } finally {
      createPendingRef.current = false;
      setBusy(false);
    }
  };

  const nights = Math.max(0, Math.round((Date.parse(`${form.checkOutDate}T00:00:00Z`) - Date.parse(`${form.checkInDate}T00:00:00Z`)) / 86_400_000));
  const changeRoomType = (roomTypeId: string) => {
    const room = roomTypes.find(item => item.id === roomTypeId);
    const plan = room?.ratePlans.find(item => !item.isPromotional) || room?.ratePlans[0];
    update({ roomTypeId, ratePlanId: plan?.id || '', promoCode: '' });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><CalendarPlus aria-hidden="true" />New reservation</Button></DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-3xl gap-0 overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 py-5 text-left">
          <DialogTitle>New desk reservation</DialogTitle>
          <DialogDescription>Phone, walk-in and direct bookings use the same pricing, availability, folio and communication rules as the booking engine.</DialogDescription>
        </DialogHeader>
        {optionsLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground" role="status"><Loader2 className="size-5 animate-spin" aria-hidden="true" />Loading room types and rates</div>
        ) : (
          <form className="space-y-6 px-6 py-5" onSubmit={event => { event.preventDefault(); if (!quote && !busy && form.roomTypeId && form.ratePlanId) void preview(); }}>
            <section className="space-y-3">
              <SectionLabel>Guest</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="staffGuestName"><FieldInput id="staffGuestName" autoComplete="off" value={form.guestName} onChange={e => update({ guestName: e.target.value })} /></Field>
                <Field label="Email" htmlFor="staffGuestEmail"><FieldInput id="staffGuestEmail" type="email" autoComplete="off" value={form.guestEmail} onChange={e => update({ guestEmail: e.target.value })} /></Field>
                <Field label="Phone" htmlFor="staffGuestPhone" optional><FieldInput id="staffGuestPhone" type="tel" value={form.guestPhone} onChange={e => update({ guestPhone: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Adults" htmlFor="staffAdults"><FieldInput id="staffAdults" type="number" min="1" value={form.numberOfAdults} onChange={e => update({ numberOfAdults: e.target.value })} /></Field>
                  <Field label="Children" htmlFor="staffChildren"><FieldInput id="staffChildren" type="number" min="0" value={form.numberOfChildren} onChange={e => update({ numberOfChildren: e.target.value })} /></Field>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3"><SectionLabel>Stay</SectionLabel>{nights > 0 ? <span className="text-xs text-muted-foreground">{pluralize(nights, 'night')}</span> : null}</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Check-in" htmlFor="staffCheckIn"><FieldInput id="staffCheckIn" type="date" value={form.checkInDate} onChange={e => update({ checkInDate: e.target.value })} /></Field>
                <Field label="Check-out" htmlFor="staffCheckOut"><FieldInput id="staffCheckOut" type="date" value={form.checkOutDate} onChange={e => update({ checkOutDate: e.target.value })} /></Field>
                <Field label="Room type" htmlFor="staffRoomType" hint={selectedRoom ? `Sleeps up to ${selectedRoom.maxOccupancy}` : undefined}>
                  <NativeSelect id="staffRoomType" value={form.roomTypeId} onChange={e => changeRoomType(e.target.value)}>
                    {roomTypes.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Rate plan" htmlFor="staffRatePlan" hint={selectedPlan ? `${humanize(selectedPlan.cancellationPolicy)} · ${humanize(selectedPlan.mealPlan)}` : undefined}>
                  <NativeSelect id="staffRatePlan" value={form.ratePlanId} onChange={e => update({ ratePlanId: e.target.value, promoCode: '' })}>
                    {selectedRoom?.ratePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {money(Math.round(plan.baseRate * 100), plan.currencyCode)}</option>)}
                  </NativeSelect>
                </Field>
                {selectedPlan?.isPromotional ? <Field label="Promo code" htmlFor="staffPromo"><FieldInput id="staffPromo" value={form.promoCode} onChange={e => update({ promoCode: e.target.value })} /></Field> : null}
              </div>
            </section>

            <section className="space-y-3">
              <SectionLabel>Booking details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Source" htmlFor="staffSource">
                  <NativeSelect id="staffSource" value={form.source} onChange={e => update({ source: e.target.value })}><option value="phone">Phone</option><option value="walk_in">Walk in</option><option value="direct">Direct</option></NativeSelect>
                </Field>
                <Field label="Initial status" htmlFor="staffStatus">
                  <NativeSelect id="staffStatus" value={form.status} onChange={e => update({ status: e.target.value })}><option value="confirmed">Confirmed</option><option value="pending">Pending two-hour hold</option></NativeSelect>
                </Field>
                <Field label="Special requests" htmlFor="staffRequests" optional className="sm:col-span-2"><FieldInput id="staffRequests" value={form.specialRequests} onChange={e => update({ specialRequests: e.target.value })} /></Field>
                <Field label="Internal note" htmlFor="staffNotes" optional hint="Visible to staff only." className="sm:col-span-2"><FieldInput id="staffNotes" value={form.internalNotes} onChange={e => update({ internalNotes: e.target.value })} /></Field>
              </div>
            </section>

            {quote ? (
              <div className="overflow-hidden rounded-lg border">
                <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-medium"><ReceiptText className="size-4 text-muted-foreground" aria-hidden="true" />{quote.ratePlanName}</span>
                  <span className="text-xs text-muted-foreground">{pluralize(quote.nights, 'night')} · {humanize(quote.cancellationPolicy)}</span>
                </div>
                <dl className="divide-y text-sm">
                  <div className="flex justify-between px-4 py-2"><dt className="text-muted-foreground">Room</dt><dd className="tabular-nums">{money(quote.roomSubtotalMinor, quote.currencyCode)}</dd></div>
                  <div className="flex justify-between px-4 py-2"><dt className="text-muted-foreground">Tax</dt><dd className="tabular-nums">{money(quote.taxAmountMinor, quote.currencyCode)}</dd></div>
                  <div className="flex justify-between px-4 py-2"><dt className="text-muted-foreground">Fees</dt><dd className="tabular-nums">{money(quote.feesAmountMinor, quote.currencyCode)}</dd></div>
                  <div className="flex justify-between bg-muted/20 px-4 py-2.5 font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(quote.totalAmountMinor, quote.currencyCode)}</dd></div>
                </dl>
              </div>
            ) : (
              <FormNote>Quote the stay to confirm price and availability. Changing any field clears the quote.</FormNote>
            )}

            <div className="-mx-6 -mb-5 flex flex-col-reverse gap-2 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={preview} disabled={busy || !form.roomTypeId || !form.ratePlanId}>{busy && !quote ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}{quote ? 'Re-quote' : 'Quote & check availability'}</Button>
              <Button type="button" onClick={create} disabled={busy || !quote || !form.guestName || !form.guestEmail}>{busy && quote ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Create reservation</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
