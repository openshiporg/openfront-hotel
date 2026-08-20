'use client';

import * as React from 'react';
import { CalendarPlus, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { createStaffReservationAction, getStaffReservationOptions, getStaffReservationQuote } from '../actions';

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
  const { toast } = useToast();
  const [open, setOpen] = React.useState(defaultOpen);
  const [optionsLoading, setOptionsLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [roomTypes, setRoomTypes] = React.useState<RoomType[]>([]);
  const [quote, setQuote] = React.useState<Quote | null>(null);
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
        toast({ title: 'Reservation options unavailable', description: error instanceof Error ? error.message : 'Unable to load rates.', variant: 'destructive' });
      } finally {
        setOptionsLoading(false);
      }
    };
    void load();
  }, [open, roomTypes.length, initialGuestId, toast]);

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
      setQuote(await getStaffReservationQuote(quoteVariables()) as Quote);
    } catch (error) {
      toast({ title: 'Quote unavailable', description: error instanceof Error ? error.message : 'Check dates, occupancy, and rate restrictions.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!quote) return;
    setBusy(true);
    try {
      const booking = await createStaffReservationAction({
        ...quoteVariables(),
        guestName: form.guestName,
        guestEmail: form.guestEmail,
        guestPhone: form.guestPhone || null,
        specialRequests: form.specialRequests || null,
        internalNotes: form.internalNotes || null,
        source: form.source,
        status: form.status,
      });
      toast({ title: 'Reservation created', description: `Confirmation ${booking.confirmationNumber} was persisted.` });
      setOpen(false);
      setQuote(null);
      await onCreated?.();
    } catch (error) {
      toast({ title: 'Reservation not created', description: error instanceof Error ? error.message : 'The reservation failed validation.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><CalendarPlus className="mr-2 h-4 w-4" />New reservation</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Create a desk reservation</DialogTitle><DialogDescription>Phone, walk-in, and direct reservations use the same price, availability, snapshot, folio, and communication boundaries as the booking engine.</DialogDescription></DialogHeader>
        {optionsLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
          <div className="grid gap-5 py-2 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="staffGuestName">Guest name</Label><Input id="staffGuestName" value={form.guestName} onChange={e => update({ guestName: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="staffGuestEmail">Email</Label><Input id="staffGuestEmail" type="email" value={form.guestEmail} onChange={e => update({ guestEmail: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="staffGuestPhone">Phone</Label><Input id="staffGuestPhone" value={form.guestPhone} onChange={e => update({ guestPhone: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2"><div className="space-y-2"><Label htmlFor="staffAdults">Adults</Label><Input id="staffAdults" type="number" min="1" value={form.numberOfAdults} onChange={e => update({ numberOfAdults: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="staffChildren">Children</Label><Input id="staffChildren" type="number" min="0" value={form.numberOfChildren} onChange={e => update({ numberOfChildren: e.target.value })} /></div></div>
            <div className="space-y-2"><Label htmlFor="staffCheckIn">Check-in</Label><Input id="staffCheckIn" type="date" value={form.checkInDate} onChange={e => update({ checkInDate: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="staffCheckOut">Check-out</Label><Input id="staffCheckOut" type="date" value={form.checkOutDate} onChange={e => update({ checkOutDate: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="staffRoomType">Room type</Label><select id="staffRoomType" className="h-10 w-full border bg-background px-3" value={form.roomTypeId} onChange={e => { const room = roomTypes.find(item => item.id === e.target.value); const plan = room?.ratePlans.find(item => !item.isPromotional) || room?.ratePlans[0]; update({ roomTypeId: e.target.value, ratePlanId: plan?.id || '', promoCode: '' }); }}>{roomTypes.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="staffRatePlan">Rate plan</Label><select id="staffRatePlan" className="h-10 w-full border bg-background px-3" value={form.ratePlanId} onChange={e => update({ ratePlanId: e.target.value, promoCode: '' })}>{selectedRoom?.ratePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {money(Math.round(plan.baseRate * 100), plan.currencyCode)}</option>)}</select></div>
            {selectedPlan?.isPromotional ? <div className="space-y-2"><Label htmlFor="staffPromo">Promo code</Label><Input id="staffPromo" value={form.promoCode} onChange={e => update({ promoCode: e.target.value })} /></div> : null}
            <div className="space-y-2"><Label htmlFor="staffSource">Source</Label><select id="staffSource" className="h-10 w-full border bg-background px-3" value={form.source} onChange={e => update({ source: e.target.value })}><option value="phone">Phone</option><option value="walk_in">Walk in</option><option value="direct">Direct</option></select></div>
            <div className="space-y-2"><Label htmlFor="staffStatus">Initial status</Label><select id="staffStatus" className="h-10 w-full border bg-background px-3" value={form.status} onChange={e => update({ status: e.target.value })}><option value="confirmed">Confirmed</option><option value="pending">Pending two-hour hold</option></select></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="staffRequests">Special requests</Label><Input id="staffRequests" value={form.specialRequests} onChange={e => update({ specialRequests: e.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="staffNotes">Internal note</Label><Input id="staffNotes" value={form.internalNotes} onChange={e => update({ internalNotes: e.target.value })} /></div>
            {quote ? <div className="border p-4 text-sm md:col-span-2"><p className="font-medium">{quote.ratePlanName} · {quote.nights} nights · {money(quote.totalAmountMinor, quote.currencyCode)}</p><p className="mt-1 text-muted-foreground">Room {money(quote.roomSubtotalMinor, quote.currencyCode)} · tax {money(quote.taxAmountMinor, quote.currencyCode)} · fees {money(quote.feesAmountMinor, quote.currencyCode)} · {quote.cancellationPolicy.replaceAll('_', ' ')}</p></div> : null}
            <div className="flex justify-end gap-2 md:col-span-2"><Button variant="outline" onClick={preview} disabled={busy || !form.roomTypeId || !form.ratePlanId}>{busy && !quote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Quote & check availability</Button><Button onClick={create} disabled={busy || !quote || !form.guestName || !form.guestEmail}>{busy && quote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create reservation</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
