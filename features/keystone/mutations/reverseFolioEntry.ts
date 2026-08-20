import { permissions } from '../access';
import { reverseFolioPosting } from '../lib/folioPosting';

export default async function reverseFolioEntry(
  root: unknown,
  {
    entryId,
    postingKey,
    reason,
  }: { entryId: string; postingKey: string; reason: string },
  context: any
) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error('Not authorized to reverse folio entries.');
  }
  return reverseFolioPosting({ context, entryId, postingKey, reason });
}
