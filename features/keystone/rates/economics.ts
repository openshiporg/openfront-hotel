import { hashLifecycleRequest, HOTEL_PROPERTY_KEY } from '../lib/hotelLifecycle';

const ECONOMIC_FIELDS = ['id', 'roomTypeId', 'baseRateMinor', 'currencyCode', 'minimumStay', 'maximumStay', 'advanceBookingMin', 'advanceBookingMax', 'validFrom', 'validTo', 'applicableDays', 'isPromotional', 'promoCode', 'cancellationPolicy', 'mealPlan', 'seasonalAdjustments'] as const;
export function rateEconomicsReview(plan: any, derivedConfig: unknown = null) { return { name: plan.name, ...Object.fromEntries(ECONOMIC_FIELDS.map(field => [field, plan[field]])), derivedConfig }; }
export function rateEconomicsHash(plan: any, derivedConfig: unknown = null) {
  return hashLifecycleRequest({ plan: Object.fromEntries(ECONOMIC_FIELDS.map(field => [field, plan[field]])), derivedConfig });
}
export async function loadRateEconomics(prisma: any, ratePlanId: string) {
  const [plan, events] = await Promise.all([
    prisma.ratePlan.findUnique({ where: { id: ratePlanId } }),
    prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: 'derived_rate', aggregateId: ratePlanId } }),
  ]);
  if (!plan) throw new Error('Rate plan not found.');
  const derivedConfig = events.reduce((latest: any, event: any) => Number(event.afterSnapshot?.derivedRate?.revision || 0) > Number(latest?.revision || 0) ? event.afterSnapshot.derivedRate : latest, null);
  return { plan, derivedConfig, economicsHash: rateEconomicsHash(plan, derivedConfig) };
}
