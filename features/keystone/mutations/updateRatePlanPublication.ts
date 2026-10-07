import { loadRateEconomics } from '../rates/economics';
import { requireHotelApproval } from '../guest-governance/commands';
import { permissions } from '../access';
import {
  findHotelLifecycleReplay,
  lockHotelLifecycle,
  recordHotelLifecycleEvent,
} from '../lib/hotelLifecycle';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { lockHotelBusinessDate } from '../lib/hotelBusinessTime';

const RATE_STATUSES = new Set(['active', 'inactive', 'draft']);

export default async function updateRatePlanPublication(
  root: unknown,
  {
    approvalId,
    ratePlanId,
    status,
    isPublic,
    idempotencyKey,
  }: {
    approvalId?: string | null;
    ratePlanId: string;
    status?: string | null;
    isPublic?: boolean | null;
    idempotencyKey: string;
  },
  context: any
) {
  if (!permissions.canManageRooms({ session: context.session })) {
    throw new Error('Not authorized to publish rate plans.');
  }
  if (status === undefined && isPublic === undefined) {
    throw new Error('Provide status or isPublic.');
  }
  if (status != null && !RATE_STATUSES.has(status)) throw new Error('Unsupported rate plan status.');
  const eventKey = idempotencyKey.trim();
  if (!eventKey || eventKey.length > 200) throw new Error('A stable idempotencyKey is required.');
  const request = { ratePlanId, status: status ?? null, isPublic: isPublic ?? null };
  const identity = {
    request,
    aggregateType: 'rate_plan',
    aggregateId: ratePlanId,
    action: 'publication_changed',
  };

  await runSerializableTransaction(context, async (transactionContext: any) => {
    const prisma = transactionContext.prisma;
    await lockHotelLifecycle(prisma, eventKey);
    await lockHotelBusinessDate(prisma);
    if (await findHotelLifecycleReplay(prisma, eventKey, identity)) return;
    const plan = await prisma.ratePlan.findUnique({ where: { id: ratePlanId } });
    if (!plan?.roomTypeId) throw new Error('Rate plan or required room type not found.');
    const nextStatus = status ?? plan.status;
    const nextIsPublic = isPublic ?? plan.isPublic;
    if (nextStatus === 'active' && String(plan.currencyCode || '').toUpperCase() !== 'USD') {
      throw new Error('The bounded initial release supports USD rate plans only.');
    }
    if (nextStatus === 'active' && (!Number.isSafeInteger(plan.baseRateMinor) || plan.baseRateMinor < 0)) {
      throw new Error('Active rate plans require a non-negative integer minor-unit rate.');
    }
    if (nextStatus === 'active' && nextIsPublic && plan.isPromotional && !String(plan.promoCode || '').trim()) {
      throw new Error('A public promotional rate cannot be activated without a promo code.');
    }
    const settings = await prisma.hotelSettings.findUnique({ where: { id: 1 } });
    if (settings?.ratePublicationRequiresApproval !== false) await requireHotelApproval(prisma, { approvalId, action: "rate_publish", aggregateId: ratePlanId, amountMinor: 0, actorId: context.session.itemId, operationKey: eventKey, parameters: { status: nextStatus, isPublic: nextIsPublic, economicsHash: (await loadRateEconomics(prisma, ratePlanId)).economicsHash } });
    const updated = await prisma.ratePlan.update({
      where: { id: ratePlanId },
      data: { status: nextStatus, isPublic: nextIsPublic },
    });
    await recordHotelLifecycleEvent({
      prisma,
      eventKey,
      actorId: context.session.itemId,
      identity,
      beforeSnapshot: { status: plan.status, isPublic: plan.isPublic },
      afterSnapshot: { status: updated.status, isPublic: updated.isPublic },
      metadata: { roomTypeId: plan.roomTypeId },
    });
  });

  return context.prisma.ratePlan.findUnique({ where: { id: ratePlanId } });
}
