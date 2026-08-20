import { buildSnapshotFolioPosting, normalizeFolioCurrency, validateFolioPosting } from './folioLedger';
import { toMinorUnits } from './reservationSnapshots';

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
  const postings = options.postSnapshotEntries
    ? booking.lineItems
        .filter((line: any) =>
          line.snapshotStatus !== 'superseded' && line.totalPrice > 0 &&
          (!serviceDay || new Date(line.date).toISOString().slice(0, 10) === serviceDay)
        )
        .map(buildSnapshotFolioPosting)
    : [];

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
    status: folio.status,
    created,
    existing: postings.length - created,
    total: postings.length,
  };
}

export async function ensurePaymentFolioPosting(context: any, paymentId: string) {
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

  const ensured = await ensureBookingFolio(context, payment.bookingId, { postSnapshotEntries: false });
  const currencyCode = normalizeFolioCurrency(payment.currency || 'USD');
  let folio: any = must(await prisma.folio.findUnique({ where: { id: ensured.folioId } }));
  const authoritativeMinor = Number.isSafeInteger(payment.amountMinor)
    ? payment.amountMinor
    : toMinorUnits(Number(payment.amount));
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
      existing.folioId !== folio.id || existing.entryType !== posting.entryType ||
      existing.direction !== posting.direction || existing.amountMinor !== posting.amountMinor ||
      existing.currencyCode !== posting.currencyCode || existing.sourceId !== payment.id
    ) {
      throw new Error('Payment posting identity is already bound to different folio evidence.');
    }
    return existing;
  }
  if (folio.status === 'voided') {
    throw new Error('Voided folios cannot accept payment postings.');
  }
  // A post-checkout refund is new financial activity. Reopen the settled folio
  // before appending the immutable refund so the resulting balance remains
  // visible for an operator adjustment/reconciliation instead of losing the
  // provider event or fabricating a balanced ledger.
  if (folio.status === 'closed' && isRefund) {
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
      serviceDate: payment.processedAt || payment.refundedAt || payment.createdAt,
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
      },
    },
    update: {},
  }));
}
