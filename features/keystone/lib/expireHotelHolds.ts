import { requestBookingCancellation } from '../bookings/cancellation';

/** Keyset pages and per-reservation transactions keep poison holds from starving later records. */
export async function expireHotelHoldBatch(context: any, now = new Date(), renewLease?: () => Promise<boolean>) {
  const failures: string[] = []; let processed = 0; let cursor: string | undefined; let leaseLost = false;
  for (;;) {
    if (renewLease && !(await renewLease())) { leaseLost = true; break; }
    const rows = await context.prisma.booking.findMany({ where: { status: 'pending', holdExpiresAt: { lte: now }, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: 50, select: { id: true } });
    if (!rows.length) break;
    for (const row of rows) {
      if (renewLease && !(await renewLease())) { leaseLost = true; break; }
      try {
        await requestBookingCancellation({ context, bookingId: row.id, refundReason: 'Unconfirmed reservation hold expired', idempotencyKey: `hold-expired:${row.id}`, actorId: null, source: 'hold_expiry' });
        processed += 1;
      } catch { failures.push(row.id); }
    }
    if (leaseLost) break;
    cursor = rows[rows.length - 1].id;
    if (rows.length < 50) break;
  }
  return { processed, failures, leaseLost };
}
