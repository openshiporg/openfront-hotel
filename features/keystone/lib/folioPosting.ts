import { createHash, randomUUID } from 'node:crypto';

import { ensureBookingFolio, ensurePaymentFolioPosting } from './bookingFolio';
import { assertNewOperatorPostingAllowed } from './folioPostingPolicy';
import { runSerializableTransaction } from './serializableTransaction';
import {
  buildFolioReversalPosting,
  calculateFolioBalance,
  validateFolioPosting,
  type FolioEntryType,
} from './folioLedger';

function must<T>(value: T): T {
  if (value instanceof Error || (value as any)?.extensions?.code === 'KS_PRISMA_ERROR') throw value;
  return value;
}

const OPERATOR_ENTRY_TYPES = new Set<FolioEntryType>(['addon', 'adjustment']);
const OPERATOR_PAYMENT_METHODS = new Set([
  'credit_card',
  'debit_card',
  'cash',
  'bank_transfer',
  'check',
  'other',
]);

function normalizePostingKey(value: string) {
  const postingKey = value.trim();
  if (!postingKey || postingKey.length > 200) {
    throw new Error('postingKey must contain between 1 and 200 characters.');
  }
  return postingKey;
}

function normalizeDescription(value: string, label = 'description') {
  const description = value.trim();
  if (!description || description.length > 500) {
    throw new Error(`${label} must contain between 1 and 500 characters.`);
  }
  return description;
}

function assertSamePosting(existing: any, expected: any) {
  const fields = [
    'folioId',
    'postingKey',
    'entryType',
    'direction',
    'amountMinor',
    'currencyCode',
    'description',
    'sourceType',
    'sourceId',
  ];
  if (fields.some((field) => existing[field] !== expected[field])) {
    throw new Error('postingKey is already bound to different folio evidence.');
  }
}

async function lock(prisma: any, key: string) {
  await prisma.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    key
  );
}

async function folioResult(prisma: any, entry: any, replayed: boolean) {
  const entries: any = must(await prisma.folioEntry.findMany({
    where: { folioId: entry.folioId },
    select: { direction: true, amountMinor: true },
  }));
  const balance = calculateFolioBalance(entries as any);
  return {
    folioId: entry.folioId,
    entryId: entry.id,
    postingKey: entry.postingKey,
    replayed,
    ...balance,
  };
}

export async function postOperatorFolioEntry({
  context,
  bookingId,
  postingKey,
  entryType,
  direction,
  amountMinor,
  currencyCode,
  description,
  serviceDate,
}: {
  context: any;
  bookingId: string;
  postingKey: string;
  entryType: FolioEntryType;
  direction: 'debit' | 'credit';
  amountMinor: number;
  currencyCode: string;
  description: string;
  serviceDate?: string | Date | null;
}) {
  if (!OPERATOR_ENTRY_TYPES.has(entryType)) {
    throw new Error('Operators may post only add-on or adjustment entries through this operation.');
  }
  const posting = validateFolioPosting({
    postingKey: normalizePostingKey(postingKey),
    entryType,
    direction,
    amountMinor,
    currencyCode,
    description: normalizeDescription(description),
  });
  const parsedServiceDate = serviceDate ? new Date(serviceDate) : new Date();
  if (Number.isNaN(parsedServiceDate.getTime())) throw new Error('serviceDate must be a valid date.');

  return runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lock(prisma, `hotel-folio-booking:${bookingId}`);
    const ensured = await ensureBookingFolio(transactionContext, bookingId);
    const expected = {
      folioId: ensured.folioId,
      ...posting,
      sourceType: 'operator',
      sourceId: context.session.itemId,
    };
    const existing: any = must(await prisma.folioEntry.findUnique({
      where: { postingKey: posting.postingKey },
    }));
    if (existing) {
      assertSamePosting(existing, expected);
      return folioResult(prisma, existing, true);
    }
    assertNewOperatorPostingAllowed(ensured.status);

    const entry: any = must(await prisma.folioEntry.create({
      data: {
        ...expected,
        serviceDate: parsedServiceDate,
        postedAt: new Date(),
        postedById: context.session.itemId,
        metadataSnapshot: { actorId: context.session.itemId },
      },
    }));
    return folioResult(prisma, entry, false);
  });
}

export async function reverseFolioPosting({
  context,
  entryId,
  postingKey,
  reason,
}: {
  context: any;
  entryId: string;
  postingKey: string;
  reason: string;
}) {
  const normalizedPostingKey = normalizePostingKey(postingKey);
  const normalizedReason = normalizeDescription(reason, 'reason');

  return runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lock(prisma, `hotel-folio-entry:${entryId}`);
    const original = await prisma.folioEntry.findUnique({
      where: { id: entryId },
      include: { folio: true, reversedBy: true },
    });
    if (!original?.folioId || !original.folio) throw new Error('Folio entry not found.');
    if (original.folio.status !== 'open') {
      throw new Error('Closed or voided folios cannot accept reversals.');
    }
    if (['payment', 'refund'].includes(original.entryType)) {
      throw new Error('Payment and refund entries must be corrected through the payment domain.');
    }
    if (original.reversedBy) {
      if (original.reversedBy.postingKey !== normalizedPostingKey) {
        throw new Error('This folio entry has already been reversed.');
      }
      return folioResult(prisma, original.reversedBy, true);
    }

    const posting = buildFolioReversalPosting(original, {
      postingKey: normalizedPostingKey,
      reason: normalizedReason,
    });
    const expected = {
      folioId: original.folioId,
      ...posting,
      postedById: context.session.itemId,
    };
    const existing = await prisma.folioEntry.findUnique({
      where: { postingKey: normalizedPostingKey },
    });
    if (existing) {
      assertSamePosting(existing, expected);
      return folioResult(prisma, existing, true);
    }

    const now = new Date();
    const entry = await prisma.folioEntry.create({
      data: {
        ...posting,
        folioId: original.folioId,
        serviceDate: now,
        postedAt: now,
        postedById: context.session.itemId,
      },
    });
    return folioResult(prisma, entry, false);
  });
}

export async function recordOperatorBookingPayment({
  context,
  bookingId,
  postingKey,
  amountMinor,
  currencyCode,
  paymentMethod,
  description,
}: {
  context: any;
  bookingId: string;
  postingKey: string;
  amountMinor: number;
  currencyCode: string;
  paymentMethod: string;
  description: string;
}) {
  const normalizedKey = normalizePostingKey(postingKey);
  const normalizedDescription = normalizeDescription(description);
  const validated = validateFolioPosting({
    postingKey: normalizedKey,
    entryType: 'payment',
    direction: 'credit',
    amountMinor,
    currencyCode,
    description: normalizedDescription,
  });
  if (!OPERATOR_PAYMENT_METHODS.has(paymentMethod)) {
    throw new Error('Unsupported operator payment method.');
  }
  if (validated.currencyCode !== 'USD') {
    throw new Error('Operator payments currently support USD only.');
  }

  const paymentId = `manual_${createHash('sha256')
    .update(`${bookingId}:${normalizedKey}`)
    .digest('hex')
    .slice(0, 24)}`;

  return runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lock(prisma, `hotel-folio-booking:${bookingId}`);
    await lock(prisma, `hotel-folio-operator-payment:${normalizedKey}`);

    const booking: any = must(await prisma.booking.findUnique({ where: { id: bookingId } }));
    if (!booking) throw new Error('Booking not found.');
    const provider: any = must(await prisma.paymentProvider.findUnique({
      where: { code: 'pp_manual_manual' },
    }));
    if (!provider) throw new Error('Manual payment provider is not configured.');

    const existingPayment: any = must(await prisma.bookingPayment.findUnique({ where: { id: paymentId } }));
    if (existingPayment) {
      const evidence = (existingPayment.providerData || {}) as Record<string, unknown>;
      if (
        existingPayment.bookingId !== bookingId ||
        Math.round(Number(existingPayment.amount) * 100) !== amountMinor ||
        existingPayment.currency !== validated.currencyCode ||
        existingPayment.paymentMethod !== paymentMethod ||
        existingPayment.description !== normalizedDescription ||
        evidence.operatorPostingKey !== normalizedKey
      ) {
        throw new Error('postingKey is already bound to different payment evidence.');
      }
      const entry = await ensurePaymentFolioPosting(transactionContext, existingPayment.id);
      return folioResult(prisma, entry, true);
    }

    const now = new Date();
    const payment: any = must(await prisma.bookingPayment.create({
      data: {
        id: paymentId,
        paymentReference: `PAY-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`,
        bookingId,
        paymentProviderId: provider.id,
        amountMinor,
        amount: amountMinor / 100,
        currency: validated.currencyCode,
        paymentType: 'full_payment',
        paymentMethod,
        status: 'completed',
        providerPaymentId: `manual:${normalizedKey}`,
        providerData: {
          operatorPostingKey: normalizedKey,
          recordedBy: context.session.itemId,
        },
        description: normalizedDescription,
        processedAt: now,
        processedById: context.session.itemId,
      },
    }));
    const entry = await ensurePaymentFolioPosting(transactionContext, payment.id);

    const ledger = await prisma.bookingPayment.findMany({
      where: { bookingId, status: { in: ['completed', 'refunded'] } },
      select: { paymentType: true, amountMinor: true },
    });
    const paidMinor = Math.max(0, ledger.reduce((sum: number, item: any) =>
      sum + (item.paymentType === 'refund' ? -Math.abs(Number(item.amountMinor || 0)) : Math.max(0, Number(item.amountMinor || 0))), 0));
    const totalMinor = Number(booking.totalAmountMinor || Math.round(Number(booking.totalAmount || 0) * 100));
    const terminal = ['cancelled', 'no_show'].includes(booking.status);
    const terminalEntries = terminal ? await prisma.folioEntry.findMany({
      where: { folioId: entry.folioId },
      select: { direction: true, amountMinor: true },
    }) : [];
    const remainingMinor = terminal
      ? Math.max(0, calculateFolioBalance(terminalEntries as any).balanceMinor)
      : Math.max(0, totalMinor - paidMinor);
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: remainingMinor <= 0 ? 'paid' : paidMinor > 0 ? 'partial' : 'unpaid',
        balanceDueMinor: remainingMinor,
        balanceDue: remainingMinor / 100,
      },
    });

    return folioResult(prisma, entry, false);
  });
}
