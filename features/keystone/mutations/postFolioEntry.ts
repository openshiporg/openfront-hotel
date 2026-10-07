import { permissions } from '../access';
import { postOperatorFolioEntry } from '../folios/commands';
import type { FolioEntryType } from '../folios/ledger';

export default async function postFolioEntry(
  root: unknown,
  {
    bookingId,
    postingKey,
    entryType,
    direction,
    amountMinor,
    currencyCode,
    description,
    serviceDate,
    approvalId,
  }: {
    bookingId: string;
    postingKey: string;
    entryType: FolioEntryType;
    direction: 'debit' | 'credit';
    amountMinor: number;
    currencyCode: string;
    description: string;
    serviceDate?: string | Date | null;
    approvalId?: string | null;
  },
  context: any
) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error('Not authorized to post folio entries.');
  }
  return postOperatorFolioEntry({
    context,
    bookingId,
    postingKey,
    entryType,
    direction,
    amountMinor,
    currencyCode,
    description,
    serviceDate,
    approvalId,
  });
}
