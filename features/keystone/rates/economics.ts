import { hashLifecycleRequest, HOTEL_PROPERTY_KEY } from '../lib/hotelLifecycle';

const ECONOMIC_FIELDS = ['id', 'roomTypeId', 'baseRateMinor', 'currencyCode', 'minimumStay', 'maximumStay', 'advanceBookingMin', 'advanceBookingMax', 'validFrom', 'validTo', 'applicableDays', 'isPromotional', 'promoCode', 'cancellationPolicy', 'mealPlan', 'seasonalAdjustments'] as const;
const SEASON_FIELDS = ['id', 'name', 'startDate', 'endDate', 'priority', 'priceMultiplier', 'priceAdjustment', 'minimumStay'] as const;
const seasonFacts = (seasons: any[]) => seasons.map(season => Object.fromEntries(SEASON_FIELDS.map(field => [field, season[field]])));

export function rateEconomicsReview(plan: any, derivedConfig: unknown = null, seasons: any[] = []) { return { name: plan.name, ...Object.fromEntries(ECONOMIC_FIELDS.map(field => [field, plan[field]])), derivedConfig, seasons: seasonFacts(seasons) }; }
/** The price a guest pays depends on the plan, its derived-rate rule and the active seasons for its room type. */
export function rateEconomicsHash(plan: any, derivedConfig: unknown = null, seasons: any[] = []) {
  return hashLifecycleRequest({ plan: Object.fromEntries(ECONOMIC_FIELDS.map(field => [field, plan[field]])), derivedConfig, seasons: seasonFacts(seasons) });
}
export async function loadRateEconomics(prisma: any, ratePlanId: string) {
  const [plan, events] = await Promise.all([
    prisma.ratePlan.findUnique({ where: { id: ratePlanId } }),
    prisma.hotelAuditEvent.findMany({ where: { propertyKey: HOTEL_PROPERTY_KEY, aggregateType: 'derived_rate', aggregateId: ratePlanId } }),
  ]);
  if (!plan) throw new Error('Rate plan not found.');
  const seasons = plan.roomTypeId
    ? await prisma.seasonalRate.findMany({ where: { roomTypeId: plan.roomTypeId, isActive: true }, orderBy: [{ priority: 'desc' }, { id: 'asc' }] })
    : [];
  const derivedConfig = events.reduce((latest: any, event: any) => Number(event.afterSnapshot?.derivedRate?.revision || 0) > Number(latest?.revision || 0) ? event.afterSnapshot.derivedRate : latest, null);
  return { plan, derivedConfig, seasons, economicsHash: rateEconomicsHash(plan, derivedConfig, seasons) };
}
