import { buildSnapshotFolioPosting, normalizeFolioCurrency, validateFolioPosting } from './ledger';
import { toMinorUnits } from './reservationSnapshots';
import { currentPostingDate } from '../lib/hotelBusinessTime';

const MAX_FOLIO_ENTRY_MINOR = 2_147_483_647;

function must<T>(value: T): T {
  if (value instanceof Error || (value as any)?.extensions?.code === 'KS_PRISMA_ERROR') throw value;
  return value;
}

export async function ensureBookingFolio(
  context: any,
  bookingId: string,
  options: { postSnapshotEntries?: boolean; serviceDate?: Date } = {}
) {
  const prisma = context.prisma;
  await prisma.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    `hotel-folio-booking:${bookingId}`
  );
  const booking: any = must(await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      lineItems: { orderBy: [{ date: 'asc' }, { id: 'asc' }] },
      billingFolio: true,
      groupBlock: { include: { masterFolio: true } },
    },
  }));

  if (!booking) throw new Error('Booking not found.');

  const currencyCode = normalizeFolioCurrency(
    booking.lineItems.find((line: any) => line.currencyCode)?.currencyCode || 'USD'
  );
  const routedFolio = booking.billingFolio || (
    booking.groupBlock?.billingType === 'master_folio' ? booking.groupBlock.masterFolio : null
  );
  if (booking.groupBlock?.billingType === 'master_folio' && !routedFolio) {
    throw new Error('Master-folio group reservation is missing its billing folio.');
  }
  const folio: any = routedFolio || must(await prisma.folio.upsert({
    where: { bookingId },
    create: {
      bookingId,
      folioNumber: `FOL-${booking.confirmationNumber}`,
      currencyCode,
      status: 'open',
      openedAt: booking.createdAt,
    },
    update: {},
  }));

  if (folio.status !== 'open' && options.postSnapshotEntries) {
    throw new Error('Closed or voided folios cannot accept new postings.');
  }
  if (folio.currencyCode !== currencyCode) {
    throw new Error('Reservation snapshot currency does not match the booking folio.');
  }

  const serviceDay = options.serviceDate?.toISOString().slice(0, 10) || null;
  const candidateLines = options.postSnapshotEntries
    ? booking.lineItems.filter((line: any) => line.snapshotStatus !== 'superseded' && line.totalPrice > 0)
    : [];
  const businessDay = candidateLines.length
    ? await currentPostingDate(prisma, options.serviceDate)
    : null;
  const postings = candidateLines
    .filter((line: any) => {
      const lineDate = new Date(line.date);
      return serviceDay
        ? lineDate.toISOString().slice(0, 10) === serviceDay
        : Boolean(businessDay && lineDate <= businessDay);
    })
    .map(buildSnapshotFolioPosting);

  for (const posting of postings) {
    if (posting.currencyCode !== folio.currencyCode) throw new Error('Snapshot posting currency does not match folio.');
    if (posting.serviceDate < businessDay!) {
      const existing = await prisma.folioEntry.findUnique({ where: { postingKey: posting.postingKey } });
      if (!existing) throw new Error('A closed business date is missing a reservation posting; use an audited current-day adjustment.');
    } else if (posting.serviceDate > businessDay!) {
      throw new Error('Future reservation snapshots must be superseded or reconciled before posting.');
    }
  }
  const created = postings.length
    ? must(await prisma.folioEntry.createMany({
        data: postings.map((posting: any) => ({
          folioId: folio.id,
          ...posting,
        })),
        skipDuplicates: true,
      })).count
    : 0;

  return {
    bookingId,
    folioId: folio.id,
    folioNumber: folio.folioNumber,
    currencyCode: folio.currencyCode,
    status: folio.status,
    created,
    existing: postings.length - created,
    total: postings.length,
  };
}

export async function ensurePaymentFolioPosting(context: any, paymentId: string, options: { allowRecoveryReopen?: boolean } = {}) {
  const prisma = context.prisma;
  const payment: any = must(await prisma.bookingPayment.findUnique({
    where: { id: paymentId },
    include: { booking: true },
  }));
  if (!payment?.bookingId || !payment.booking) {
    throw new Error('Payment is not attached to a booking.');
  }
  if (!['completed', 'refunded'].includes(String(payment.status))) {
    throw new Error('Only settled payments or refunds may be posted to a folio.');
  }
  const authoritativeMinor = Number.isSafeInteger(payment.amountMinor)
    ? payment.amountMinor
    : toMinorUnits(Number(payment.amount));
  if (!Number.isSafeInteger(authoritativeMinor) || Math.abs(authoritativeMinor) > MAX_FOLIO_ENTRY_MINOR) {
    throw new Error('Payment folio amount exceeds the PostgreSQL Int32 minor-unit limit.');
  }

  const ensured = await ensureBookingFolio(context, payment.bookingId, { postSnapshotEntries: false });
  const currencyCode = normalizeFolioCurrency(payment.currency || 'USD');
  let folio: any = must(await prisma.folio.findUnique({ where: { id: ensured.folioId } }));
  const isRefund = authoritativeMinor < 0 || payment.paymentType === 'refund';
  if (!folio) throw new Error('Booking folio not found.');
  if (folio.currencyCode !== currencyCode) {
    throw new Error('Payment currency does not match the booking folio.');
  }
  const providerEvidence = payment.providerData && typeof payment.providerData === 'object'
    ? payment.providerData as Record<string, unknown>
    : {};
  const posting = validateFolioPosting({
    postingKey: `folio:payment:${payment.id}`,
    entryType: isRefund ? 'refund' : 'payment',
    direction: isRefund ? 'debit' : 'credit',
    amountMinor: Math.abs(authoritativeMinor),
    currencyCode,
    description: payment.description || `${isRefund ? 'Refund' : 'Payment'} for booking ${payment.booking.confirmationNumber}`,
  });
  const existing: any = must(await prisma.folioEntry.findUnique({
    where: { postingKey: posting.postingKey },
  }));
  if (existing) {
    if (
      existing.postingKey !== posting.postingKey || existing.folioId !== folio.id || existing.entryType !== posting.entryType ||
      existing.direction !== posting.direction || existing.amountMinor !== posting.amountMinor ||
      existing.currencyCode !== posting.currencyCode || existing.sourceType !== (isRefund ? 'refund' : 'payment') ||
      existing.sourceId !== payment.id
    ) {
      throw new Error('Payment posting identity is already bound to different folio evidence.');
    }
    return existing;
  }
  const recovery = options.allowRecoveryReopen === true && payment.status === 'completed' && typeof providerEvidence.recoveryReason === 'string' && Boolean(providerEvidence.recoveryReason);
  if (folio.status === 'voided' && !recovery) {
    throw new Error('Voided folios cannot accept payment postings.');
  }
  // A post-checkout refund is new financial activity. Reopen the settled folio
  // before appending the immutable refund so the resulting balance remains
  // visible for an operator adjustment/reconciliation instead of losing the
  // provider event or fabricating a balanced ledger.
  if ((folio.status === 'closed' && isRefund) || (recovery && ['closed', 'voided'].includes(folio.status))) {
    folio = must(await prisma.folio.update({
      where: { id: folio.id },
      data: { status: 'open', closedAt: null },
    }));
  } else if (folio.status !== 'open') {
    throw new Error('Closed folios accept only post-stay refund postings.');
  }

  return must(await prisma.folioEntry.upsert({
    where: { postingKey: posting.postingKey },
    create: {
      folioId: folio.id,
      ...posting,
      serviceDate: await currentPostingDate(prisma),
      postedAt: payment.processedAt || payment.refundedAt || payment.createdAt,
      sourceType: isRefund ? 'refund' : 'payment',
      sourceId: payment.id,
      metadataSnapshot: {
        paymentReference: payment.paymentReference,
        paymentMethod: payment.paymentMethod,
        providerPaymentId: payment.providerPaymentId || null,
        providerRefundId: payment.providerRefundId || null,
        operatorPostingKey: providerEvidence.operatorPostingKey || null,
        sourcePaymentId: providerEvidence.sourcePaymentId || null,
        recordedBy: providerEvidence.recordedBy || null,
        recoveryReason: recovery ? providerEvidence.recoveryReason : null,
      },
    },
    update: {},
  }));
}

/** Guest's current collectible obligation: posted ledger + unposted contracted nights,
 * with pending refunds excluded from money available to settle that obligation. */
export async function getBookingCollectibleBalance(context: any, bookingId: string) {
  const prisma = context.prisma;
  await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-booking:${bookingId}`);
  const ensured = await ensureBookingFolio(context, bookingId);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { lineItems: true } });
  if (!booking) throw new Error('Booking not found.');
  // Every child of a master folio shares one financial obligation and lock.
  await prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-folio:${ensured.folioId}`);
  const members = booking.billingFolioId
    ? await prisma.booking.findMany({ where: { billingFolioId: ensured.folioId }, include: { lineItems: true } })
    : [booking];
  if (!members.some((member: any) => member.id === booking.id)) throw new Error('Booking is not attached to its billing folio.');
  const [entries, intents] = await Promise.all([
    prisma.folioEntry.findMany({ where: { folioId: ensured.folioId }, select: { postingKey: true, direction: true, amountMinor: true, currencyCode: true } }),
    prisma.refundIntent.findMany({ where: { bookingId: { in: members.map((member: any) => member.id) }, status: { in: ['pending', 'processing', 'failed', 'dead_letter'] } }, select: { amountMinor: true } }),
  ]);
  return { ...calculateCollectibleBalance(entries, members, intents, ensured.currencyCode), folioId: ensured.folioId };
}


export function calculateCollectibleBalance(entries: any[], members: any[], intents: any[], currencyCode: string) {
  const posted = new Set(entries.map((entry: any) => entry.postingKey));
  let balanceMinor = 0;
  for (const entry of entries) {
    if (entry.currencyCode !== currencyCode || !Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0 || !['debit', 'credit'].includes(entry.direction)) throw new Error('Invalid folio currency or amount requires reconciliation.');
    balanceMinor += entry.direction === 'debit' ? entry.amountMinor : -entry.amountMinor;
  }
  for (const member of members) {
  if (!['cancelled', 'no_show', 'cancellation_pending'].includes(member.status)) {
    for (const line of member.lineItems) {
      if (line.snapshotStatus === 'superseded' || posted.has(`folio:snapshot:${line.snapshotKey}`)) continue;
      if (line.currencyCode !== currencyCode || !Number.isSafeInteger(line.totalPrice) || line.totalPrice < 0) throw new Error('Invalid reservation economics require reconciliation.');
      balanceMinor += line.totalPrice;
    }
  }
  }
  for (const intent of intents) {
    if (!Number.isSafeInteger(intent.amountMinor) || intent.amountMinor < 0) throw new Error('Invalid pending refund amount.');
    balanceMinor += intent.amountMinor;
  }
  if (!Number.isSafeInteger(balanceMinor)) throw new Error('Collectible balance exceeds safe integer bounds.');
  return { balanceMinor, balanceDueMinor: Math.max(0, balanceMinor), creditMinor: Math.max(0, -balanceMinor) };
}
