import { permissions } from '../access';
import { releaseDueHotelGroupBlocks } from '../groups/commands';
import { expireHotelHoldBatch } from '../lib/expireHotelHolds';
import { pruneExpiredAbuseBuckets } from '../lib/abuseControl';
import { safeOperationalErrorMessage } from '../lib/safeOperationalError';
import { dispatchRefundIntentBatch } from '../refunds/refundIntentWorker';
import { reconcileSecurityAuthorizations } from '../security/authorization';
import { dispatchPaymentSessionRetirements } from '../payments/settlement';

/**
 * Advances time-based state on a request (a staff page load or the Refresh button) instead of a timer:
 * lapsed holds, group cut-off dates, queued refunds, payment-attempt retirements, card-hold
 * reconciliation and finished abuse-limit windows. Every step is idempotent and takes the same
 * per-record locks as the original loop, so overlapping requests never apply anything twice.
 */
export async function refreshHotelOperationsNow(context: any) {
  const result = { holdsExpired: 0, groupBlocksReleased: 0, refundsSucceeded: 0, refundsRetried: 0, failed: 0 };
  const step = async (run: () => Promise<void>) => {
    try { await run(); } catch (error) { result.failed += 1; console.error(safeOperationalErrorMessage('worker', error)); }
  };
  await step(async () => {
    const holds = await expireHotelHoldBatch(context, new Date());
    result.holdsExpired = holds.processed;
    result.failed += holds.failures.length;
  });
  await step(async () => { result.groupBlocksReleased = (await releaseDueHotelGroupBlocks(context)).released; });
  await step(async () => {
    const refunds = await dispatchRefundIntentBatch(context, { workerId: 'staff-refresh', limit: 10 });
    result.refundsSucceeded = refunds.succeeded;
    result.refundsRetried = refunds.retried + refunds.deadLettered;
  });
  await step(async () => { await dispatchPaymentSessionRetirements(context); });
  await step(async () => { await reconcileSecurityAuthorizations(context); });
  await step(async () => { await pruneExpiredAbuseBuckets(context.prisma); });
  return result;
}

export default async function refreshHotelOperations(_root: unknown, _args: unknown, context: any) {
  const session = context.session;
  if (!permissions.canManageBookings({ session }) && !permissions.canManagePayments({ session })) {
    throw new Error('Not authorized to refresh hotel operations.');
  }
  return refreshHotelOperationsNow(context);
}
