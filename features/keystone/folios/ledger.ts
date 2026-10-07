export type FolioDirection = 'debit' | 'credit';

export type FolioEntryType =
  | 'room_charge'
  | 'tax'
  | 'fee'
  | 'addon'
  | 'payment'
  | 'refund'
  | 'adjustment'
  | 'transfer'
  | 'reversal';

export type FolioBalanceEntry = {
  direction: FolioDirection;
  amountMinor: number;
  currencyCode?: string;
};

export type FolioPosting = FolioBalanceEntry & {
  entryType: FolioEntryType;
  postingKey: string;
  currencyCode: string;
  description: string;
};

export function normalizeFolioCurrency(value: string): string {
  const currencyCode = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error('currencyCode must be a three-letter ISO currency code.');
  }
  return currencyCode;
}

export function validateFolioPosting(posting: FolioPosting): FolioPosting {
  if (!Number.isSafeInteger(posting.amountMinor) || posting.amountMinor <= 0) {
    throw new Error('Folio postings require a positive safe integer amountMinor.');
  }
  if (!posting.postingKey.trim()) {
    throw new Error('Folio postings require a stable postingKey.');
  }
  if (!posting.description.trim()) {
    throw new Error('Folio postings require a description snapshot.');
  }

  return {
    ...posting,
    postingKey: posting.postingKey.trim(),
    currencyCode: normalizeFolioCurrency(posting.currencyCode),
    description: posting.description.trim(),
  };
}

export type ReversibleFolioEntry = FolioPosting & {
  id: string;
};

export function buildFolioReversalPosting(
  original: ReversibleFolioEntry,
  { postingKey, reason }: { postingKey: string; reason: string }
) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error('Folio reversals require a reversal reason.');
  }
  if (original.entryType === 'reversal') {
    throw new Error('Folio reversal entries cannot themselves be reversed.');
  }

  const posting = validateFolioPosting({
    postingKey,
    entryType: 'reversal',
    direction: original.direction === 'debit' ? 'credit' : 'debit',
    amountMinor: original.amountMinor,
    currencyCode: original.currencyCode,
    description: `Reversal: ${original.description} — ${normalizedReason}`,
  });

  return {
    ...posting,
    sourceType: 'operator' as const,
    sourceId: original.id,
    reversesId: original.id,
    metadataSnapshot: {
      reason: normalizedReason,
      reversedPostingKey: original.postingKey,
      reversedEntryType: original.entryType,
    },
  };
}

export type ReservationSnapshotForFolio = {
  id: string;
  snapshotKey: string;
  type: string;
  totalPrice: number;
  currencyCode: string;
  description: string;
  date: string | Date;
  createdAt?: string | Date | null;
};

export function buildSnapshotFolioPosting(snapshot: ReservationSnapshotForFolio) {
  const entryType: FolioEntryType = snapshot.type === 'room'
    ? 'room_charge'
    : snapshot.type === 'tax'
      ? 'tax'
      : snapshot.type === 'service_fee'
        ? 'fee'
        : 'addon';

  const posting = validateFolioPosting({
    amountMinor: snapshot.totalPrice,
    currencyCode: snapshot.currencyCode,
    direction: 'debit',
    entryType,
    postingKey: `folio:snapshot:${snapshot.snapshotKey}`,
    description: snapshot.description,
  });

  return {
    ...posting,
    sourceType: 'reservation_snapshot' as const,
    sourceId: snapshot.id,
    serviceDate: new Date(snapshot.date),
    postedAt: new Date(snapshot.createdAt || snapshot.date),
    taxCategorySnapshot: entryType === 'tax' ? 'lodging_tax' : '',
    metadataSnapshot: {
      reservationSnapshotKey: snapshot.snapshotKey,
      reservationLineType: snapshot.type,
    },
  };
}

export function calculateFolioBalance(entries: FolioBalanceEntry[]) {
  let debitMinor = 0;
  let creditMinor = 0;
  const currencies = new Set(entries.map(entry => entry.currencyCode).filter(Boolean));
  if (currencies.size > 1) throw new Error('Mixed-currency folio balances cannot be settled without explicit reconciliation.');

  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
      throw new Error('Folio balance entries require positive safe integer amounts.');
    }
    if (entry.direction === 'debit') debitMinor += entry.amountMinor;
    else if (entry.direction === 'credit') creditMinor += entry.amountMinor;
    else throw new Error('Folio balance entries require a debit or credit direction.');
  }

  if (!Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor)) {
    throw new Error('Folio totals exceed safe integer bounds.');
  }

  return {
    debitMinor,
    creditMinor,
    balanceMinor: debitMinor - creditMinor,
  };
}

export function assertFolioCanClose(entries: FolioBalanceEntry[]) {
  const totals = calculateFolioBalance(entries);
  if (totals.balanceMinor > 0) {
    throw new Error(`Folio has an outstanding debit balance of ${totals.balanceMinor} minor units.`);
  }
  if (totals.balanceMinor < 0) {
    throw new Error(`Folio has an outstanding credit balance of ${Math.abs(totals.balanceMinor)} minor units.`);
  }
  return totals;
}

export function assertNoFutureDatedFolioEntries(entries: Array<{ serviceDate: string | Date }>, currentBusinessDate: string | Date) {
  const dayKey = (value: string | Date) => {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Folio service dates must be valid before checkout.');
    return date.toISOString().slice(0, 10);
  };
  const businessDay = dayKey(currentBusinessDate);
  for (const entry of entries) {
    if (!entry.serviceDate) throw new Error('Every folio entry must have a service date before checkout.');
    const serviceDay = dayKey(entry.serviceDate);
    if (serviceDay > businessDay) {
      throw new Error(`Folio contains a future-dated entry (${serviceDay}) beyond business date ${businessDay}; reconcile it before checkout.`);
    }
  }
}
