import { permissions } from '../access';
import { runSerializableTransaction } from '../lib/serializableTransaction';
import { hashLifecycleRequest, HOTEL_PROPERTY_KEY } from '../lib/hotelLifecycle';
import { requireHotelApproval } from '../guest-governance/commands';
import { loadRateEconomics } from './economics';

export type DerivedRateConfiguration = { revision: number; targetPlanId: string; sourcePlanId: string; enabled: boolean; multiplierBasisPoints: number; adjustmentMinor: number };
export function validateDerivedRateConfiguration(input: any): Omit<DerivedRateConfiguration, 'revision'> & { expectedRevision: number } {
  if (!input || typeof input.enabled !== 'boolean' || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('Derived rate requires enabled and current revision.');
  const targetPlanId = String(input.targetPlanId || '').trim(), sourcePlanId = String(input.sourcePlanId || '').trim();
  if (!targetPlanId || targetPlanId.length > 200 || (input.enabled && (!sourcePlanId || sourcePlanId.length > 200 || sourcePlanId === targetPlanId))) throw new Error('Choose distinct bounded target and parent rate plans.');
  if (!Number.isSafeInteger(input.multiplierBasisPoints) || input.multiplierBasisPoints < 1 || input.multiplierBasisPoints > 100_000) throw new Error('Derived multiplier must be 1–100000 basis points (10000 = 100%).');
  if (!Number.isSafeInteger(input.adjustmentMinor) || Math.abs(input.adjustmentMinor) > 2_147_483_647) throw new Error('Derived adjustment must be a supported signed minor-unit amount.');
  return { targetPlanId, sourcePlanId, enabled: input.enabled, expectedRevision: input.expectedRevision, multiplierBasisPoints: input.multiplierBasisPoints, adjustmentMinor: input.adjustmentMinor };
}
export function resolveDerivedRateAmount(targetPlanId: string, plans: Map<string, any>, configs: Map<string, DerivedRateConfiguration>, calculateLeaf: (plan: any) => number, visited: string[] = []): number {
  if (visited.includes(targetPlanId) || visited.length >= 8) throw new Error('Derived rate cycle or depth greater than eight plans.');
  const plan = plans.get(targetPlanId); if (!plan || plan.status !== 'active') throw new Error('Derived pricing requires every rate plan to be published.');
  const config = configs.get(targetPlanId);
  if (!config?.enabled) return calculateLeaf(plan);
  const parent = plans.get(config.sourcePlanId);
  if (!parent || parent.roomTypeId !== plan.roomTypeId || parent.currencyCode !== plan.currencyCode || !parent.isPublic) throw new Error('Derived parent must be a public rate for the same room type and currency.');
  const inherited = resolveDerivedRateAmount(parent.id, plans, configs, calculateLeaf, [...visited, targetPlanId]);
  const amount = Math.round(inherited * config.multiplierBasisPoints / 10_000) + config.adjustmentMinor;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2_147_483_647) throw new Error('Derived pricing produced an invalid nightly amount.');
  return amount;
}
export async function loadHotelDerivedRateGraph(prisma: any) {
  const [plans, events] = await Promise.all([prisma.ratePlan.findMany({}), prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: 'derived_rate' } })]);
  const configs = new Map<string, DerivedRateConfiguration>();
  for (const event of events) { const config = event.afterSnapshot?.derivedRate; if (config && Number(config.revision) > Number(configs.get(config.targetPlanId)?.revision || 0)) configs.set(config.targetPlanId, config); }
  return { plans: new Map<string, any>(plans.map((plan: any) => [plan.id, plan])), configs };
}
function authorize(context: any) { if (!permissions.canManageRooms({ session: context.session })) throw new Error('Room management permission is required for derived rates.'); }
export async function hotelDerivedRateWorkspace(_root: unknown, _args: unknown, context: any) {
  authorize(context); const graph = await loadHotelDerivedRateGraph(context.prisma);
  return JSON.stringify({ plans: [...graph.plans.values()].map(plan => ({ id: plan.id, name: plan.name, status: plan.status, isPublic: plan.isPublic, roomTypeId: plan.roomTypeId, currencyCode: plan.currencyCode })), configs: [...graph.configs.values()] });
}
export async function updateHotelDerivedRate(_root: unknown, { payload, approvalId, idempotencyKey }: { payload: string; approvalId?: string | null; idempotencyKey: string }, context: any) {
  authorize(context); if (payload.length > 10_000) throw new Error('Derived rate request too large.');
  const data = validateDerivedRateConfiguration(JSON.parse(payload)); const key = String(idempotencyKey || '').trim(); if (!key || key.length > 150) throw new Error('A bounded idempotency key is required.');
  const eventKey = `derived-rate:${key}`; const requestHash = hashLifecycleRequest({ data, actorId: context.session.itemId, approvalId: approvalId || null });
  return runSerializableTransaction(context, async (tx: any) => {
    const p = tx.prisma; await p.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', 'hotel-derived-rate-graph');
    const replay = await p.hotelAuditEvent.findUnique({ where: { eventKey } });
    if (replay) { if (replay.requestHash !== requestHash) throw new Error('Derived rate idempotency key was reused with different evidence.'); return JSON.stringify(replay.afterSnapshot.derivedRate); }
    const graph = await loadHotelDerivedRateGraph(p); const target = graph.plans.get(data.targetPlanId); if (!target) throw new Error('Target rate plan not found.');
    const previous = graph.configs.get(data.targetPlanId);
    if ((previous?.revision || 0) !== data.expectedRevision) throw new Error('Derived rate configuration changed. Refresh before applying.');
    const { expectedRevision, ...config } = data; const next = { ...config, revision: expectedRevision + 1 }; graph.configs.set(data.targetPlanId, next);
    if (data.enabled) {
      // Validate the complete prospective graph, including draft targets, before
      // saving. Quote-time validation still requires every actual plan active.
      const validationPlans = new Map(graph.plans); validationPlans.set(target.id, { ...target, status: 'active' });
      resolveDerivedRateAmount(target.id, validationPlans, graph.configs, plan => Number(plan.baseRateMinor));
    }
    const settings = await p.hotelSettings.findUnique({ where: { id: 1 } }); if (!settings) throw new Error('Property configuration is required.');
    if (settings.ratePublicationRequiresApproval !== false) {
      const { targetPlanId: _, ...derivedRate } = data;
      const parameters: any = { status: target.status, isPublic: Boolean(target.isPublic), derivedRate, economicsHash: (await loadRateEconomics(p, target.id)).economicsHash };
      if (data.enabled) parameters.sourceEconomicsHash = (await loadRateEconomics(p, data.sourcePlanId)).economicsHash;
      await requireHotelApproval(p, { approvalId, action: 'rate_publish', aggregateId: target.id, amountMinor: 0, actorId: context.session.itemId, operationKey: eventKey, parameters });
    }
    await p.hotelAuditEvent.create({ data: { eventKey, requestHash, propertyKey: HOTEL_PROPERTY_KEY, aggregateType: 'derived_rate', aggregateId: target.id, action: data.enabled ? 'configured' : 'disabled', actorId: context.session.itemId, beforeSnapshot: { derivedRate: previous || null }, afterSnapshot: { derivedRate: next }, metadataSnapshot: { approvalId: approvalId || null }, occurredAt: new Date() } });
    return JSON.stringify(next);
  });
}
export const hotelDerivedRateTypeDefs = String.raw`
  extend type Query { hotelDerivedRateWorkspace:String! }
  extend type Mutation { updateHotelDerivedRate(payload:String!,approvalId:ID,idempotencyKey:String!):String! }
`;
export const hotelDerivedRateResolvers = { Query: { hotelDerivedRateWorkspace }, Mutation: { updateHotelDerivedRate } };
