import { createHash } from 'node:crypto';
import { permissions } from '../access';
import { getGuestBookingToken, guestAccessTokenMatches } from '../lib/guestBookingAccess';
import { ensureBookingFolio, getBookingCollectibleBalance } from '../folios/bookingFolio';
import { calculateFolioBalance, validateFolioPosting } from '../folios/ledger';
import { currentPostingDate } from '../lib/hotelBusinessTime';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';

export function loyaltyPolicy(settings: any) {
  const earnMinorPerPoint = Number(settings?.loyaltyEarnMinorPerPoint), redeemMinorPerPoint = Number(settings?.loyaltyRedeemMinorPerPoint), minimumRedemptionPoints = Number(settings?.loyaltyMinimumRedemptionPoints);
  if ([earnMinorPerPoint, redeemMinorPerPoint, minimumRedemptionPoints].some(value => !Number.isSafeInteger(value) || value < 1 || value > 2147483647)) throw new Error('Loyalty earning and redemption rules are not configured.');
  return { earnMinorPerPoint, redeemMinorPerPoint, minimumRedemptionPoints };
}
export function loyaltyBalance(entries: any[]) {
  const points = entries.reduce((sum, entry) => { if (!Number.isSafeInteger(entry.points)) throw new Error('Loyalty ledger contains invalid points.'); return sum + entry.points; }, 0);
  if (!Number.isSafeInteger(points)) throw new Error('Loyalty ledger exceeds the supported accounting range.'); return points;
}
export function loyaltyRedemptionValue(points: number, balance: number, dueMinor: number, policy: ReturnType<typeof loyaltyPolicy>) {
  if (!Number.isSafeInteger(points) || points < policy.minimumRedemptionPoints) throw new Error(`Redeem at least ${policy.minimumRedemptionPoints} whole points.`);
  if (points > balance) throw new Error('Not enough available loyalty points.');
  const amountMinor = points * policy.redeemMinorPerPoint;
  if (!Number.isSafeInteger(amountMinor) || amountMinor > 2147483647 || amountMinor > dueMinor) throw new Error('Redemption cannot exceed the current posted folio balance.');
  return amountMinor;
}
async function bookingAccess(context: any, bookingId: string, redeem = false) {
  const booking = await context.prisma.booking.findUnique({ where: { id: bookingId } });
  const operator = redeem ? permissions.canManagePayments({ session: context.session }) : permissions.canManageGuests({ session: context.session }) || permissions.canManageBookings({ session: context.session }) || permissions.canManagePayments({ session: context.session });
  const token = getGuestBookingToken(context, bookingId);
  if (!booking || (!operator && (!token || !guestAccessTokenMatches(booking.guestAccessTokenHash, token)))) throw new Error('Reservation loyalty access could not be verified.');
  if (!booking.guestProfileId) throw new Error('Reservation has no verified guest profile.'); return booking;
}

/** Internal checkout/refund hook. Caller owns a serializable transaction and booking lock. */
export async function reconcileBookingLoyalty(prisma: any, bookingId: string, reasonKey: string, actorId?: string | null) {
  const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
  const initialKey = `hotel-loyalty:earn:${bookingId}`;
  const initial = await prisma.hotelAuditEvent.findUnique({ where: { eventKey: initialKey } });
  if (!settings?.loyaltyEnabled && !initial) return { pointsChanged: 0 };
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { folio: { include: { entries: true } }, groupBlock: true } });
  if (!booking || booking.status !== 'checked_out' || !booking.guestProfileId || booking.billingFolioId || booking.groupBlock?.billingType === 'master_folio') return { pointsChanged: 0 };
  await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-loyalty-guest:${booking.guestProfileId}`);
  const eventKey = initial ? `hotel-loyalty:adjust:${bookingId}:${createHash('sha256').update(reasonKey).digest('hex').slice(0, 24)}` : initialKey;
  if (await prisma.hotelAuditEvent.findUnique({ where: { eventKey } })) return { pointsChanged: 0 };
  if (!initial && (!booking.folio || calculateFolioBalance(booking.folio.entries).balanceMinor !== 0)) return { pointsChanged: 0 };
  const policy = initial?.afterSnapshot?.policy || loyaltyPolicy(settings);
  const [payments, entries] = await Promise.all([
    prisma.bookingPayment.findMany({ where: { bookingId, status: { in: ['completed', 'refunded'] } } }),
    prisma.loyaltyTransaction.findMany({ where: { guestId: booking.guestProfileId, bookingId, type: { in: ['earned', 'adjusted'] } } }),
  ]);
  if (payments.some((payment: any) => String(payment.currency || 'USD').toUpperCase() !== 'USD' || !Number.isSafeInteger(payment.amountMinor))) throw new Error('Loyalty requires reconciled USD payment evidence.');
  const netPaidMinor = Math.max(0, payments.reduce((sum: number, payment: any) => sum + (payment.paymentType === 'refund' ? -Math.abs(payment.amountMinor) : Math.max(0, payment.amountMinor)), 0));
  const redeemedMinor = (booking.folio?.entries || []).filter((entry: any) => entry.metadataSnapshot?.loyaltyRedemption === true).reduce((sum: number, entry: any) => sum + entry.amountMinor, 0);
  const eligibleRoomMinor = initial ? Number(initial.afterSnapshot.eligibleRoomMinor) : Math.max(0, Number(booking.roomRateMinor || 0) - redeemedMinor);
  const targetPoints = Math.floor(Math.min(eligibleRoomMinor, netPaidMinor) / policy.earnMinorPerPoint), previousPoints = loyaltyBalance(entries), delta = targetPoints - previousPoints;
  if (!Number.isSafeInteger(targetPoints) || Math.abs(delta) > 2147483647) throw new Error('Loyalty award exceeds the supported ledger range.');
  if (delta) await prisma.loyaltyTransaction.create({ data: { guestId: booking.guestProfileId, bookingId, points: delta, type: initial ? 'adjusted' : 'earned', description: initial ? 'Settled refund adjustment to completed stay points' : 'Points earned on paid room charges at completed checkout', createdById: actorId || null } });
  await recordHotelLifecycleEvent({ prisma, eventKey, actorId, identity: { request: { bookingId, reasonKey }, aggregateType: 'loyalty', aggregateId: booking.guestProfileId, action: initial ? 'stay_adjusted' : 'stay_earned' }, afterSnapshot: { bookingId, pointsChanged: delta, awardedPoints: targetPoints, eligibleRoomMinor, netPaidMinor, policy } });
  return { pointsChanged: delta };
}

export async function hotelLoyaltyAccount(_root: unknown, { bookingId }: { bookingId: string }, context: any) {
  const booking = await bookingAccess(context, bookingId);
  const [settings, entries] = await Promise.all([context.prisma.hotelSettings.findUnique({ where: { id: 1 } }), context.prisma.loyaltyTransaction.findMany({ where: { guestId: booking.guestProfileId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })]);
  const balance = loyaltyBalance(entries);
  const policy = settings?.loyaltyEnabled ? loyaltyPolicy(settings) : null;
  return JSON.stringify({ enabled: settings?.loyaltyEnabled === true, balance, policy, canRedeem: settings?.loyaltyEnabled === true && booking.status === 'checked_in' && !booking.billingFolioId, entries: entries.slice(0, 50).map((entry: any) => ({ id: entry.id, points: entry.points, type: entry.type, description: entry.description, createdAt: entry.createdAt })) });
}
export async function redeemHotelLoyalty(_root: unknown, { bookingId, points, idempotencyKey }: { bookingId: string; points: number; idempotencyKey: string }, context: any) {
  await bookingAccess(context, bookingId, true);
  const key = String(idempotencyKey || '').trim(); if (!key || key.length > 200) throw new Error('A stable bounded loyalty redemption key is required.');
  const eventKey = `hotel-loyalty:redeem:${createHash('sha256').update(key).digest('hex')}`;
  return runSerializableTransaction(context, async (tx: any) => {
    const p = tx.prisma; await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`); await lockHotelLifecycle(p, eventKey);
    const booking = await bookingAccess({ ...context, prisma: p }, bookingId, true);
    const identity = { request: { bookingId, points }, aggregateType: 'loyalty', aggregateId: booking.guestProfileId, action: 'redeemed' };
    const replay = await findHotelLifecycleReplay(p, eventKey, identity); if (replay) return JSON.stringify(replay.afterSnapshot);
    const settings = await p.hotelSettings.findUnique({ where: { id: 1 } }); if (!settings?.loyaltyEnabled) throw new Error('Loyalty redemption is not enabled in property settings.');
    const policy = loyaltyPolicy(settings);
    if (booking.status !== 'checked_in' || booking.billingFolioId) throw new Error('Redeem points against an in-house guest-paid folio. Group master billing is excluded.');
    await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-loyalty-guest:${booking.guestProfileId}`);
    const folio = await ensureBookingFolio(tx, bookingId);
    await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-folio:${folio.folioId}`);
    if (folio.status !== 'open') throw new Error('Loyalty redemption requires an open folio.');
    const [entries, ledger] = await Promise.all([p.loyaltyTransaction.findMany({ where: { guestId: booking.guestProfileId } }), p.folioEntry.findMany({ where: { folioId: folio.folioId } })]);
    const amountMinor = loyaltyRedemptionValue(points, loyaltyBalance(entries), calculateFolioBalance(ledger).balanceMinor, policy), serviceDate = await currentPostingDate(p);
    const posting = validateFolioPosting({ postingKey: eventKey, amountMinor, currencyCode: 'USD', entryType: 'adjustment', direction: 'credit', description: `Loyalty redemption: ${points} points` });
    if (folio.currencyCode !== posting.currencyCode) throw new Error('Loyalty supports USD folios only.');
    await p.folioEntry.create({ data: { ...posting, folioId: folio.folioId, serviceDate, sourceType: 'operator', sourceId: bookingId, postedById: permissions.canManagePayments({ session: context.session }) ? context.session.itemId : null, metadataSnapshot: { loyaltyRedemption: true, bookingId, guestId: booking.guestProfileId, points, policy } } });
    await p.loyaltyTransaction.create({ data: { guestId: booking.guestProfileId, bookingId, points: -points, type: 'redeemed', description: `Redeemed ${points} points for USD ${(amountMinor / 100).toFixed(2)} in-house folio credit`, createdById: permissions.canManagePayments({ session: context.session }) ? context.session.itemId : null } });
    const collectible = await getBookingCollectibleBalance(tx, bookingId);
    await p.booking.update({ where: { id: bookingId }, data: { balanceDueMinor: collectible.balanceDueMinor, balanceDue: collectible.balanceDueMinor / 100, paymentStatus: collectible.balanceDueMinor <= 0 ? 'paid' : 'partial' } });
    const result = { bookingId, pointsRedeemed: points, amountMinor, balance: loyaltyBalance(entries) - points };
    await recordHotelLifecycleEvent({ prisma: p, eventKey, actorId: permissions.canManagePayments({ session: context.session }) ? context.session.itemId : null, identity, afterSnapshot: result });
    return JSON.stringify(result);
  });
}
