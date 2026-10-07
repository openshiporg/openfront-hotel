import { queueHotelPrearrivalCommunications, prearrivalStillEligible } from '../communications/scheduling';
import type { KeystoneConfig } from '@keystone-6/core/types';
import { getHotelWorkerContext } from './runtimeContext';

import {
  createHttpOutboxHandler,
  dispatchHotelOutboxBatch,
} from '../communications/outbox';
import { getOutboxDispatchConfig } from '../lib/integrationConfig';
import { recordWorkerProgress } from '../lib/workerProgress';
import { safeOperationalErrorMessage } from '../lib/safeOperationalError';
import {
  HOTEL_COMMUNICATION_TOPICS,
  isHotelCommunicationTopic,
  type HotelCommunicationPayload,
} from '../communications/commands';
import {
  hotelMailInfrastructureConfigured,
  sendHotelCommunicationEmail,
} from '../lib/mail';

const DEFAULT_INTERVAL_MS = 5_000;

/**
 * Starts only when the durable worker switch is enabled and either SMTP or
 * an authenticated HMAC receiver can deliver events. Unsupported topics remain
 * pending rather than being reported as delivered.
 */
export function startHotelOutboxJobs(config: KeystoneConfig) {
  if (process.env.NODE_ENV === 'test') return;
  const dispatchConfig = getOutboxDispatchConfig();
  const smtpInfrastructureConfigured = hotelMailInfrastructureConfigured();
  if (!dispatchConfig.enabled && !smtpInfrastructureConfigured) return;
  if ((globalThis as any).__hotelOutboxJobsState) return;

  let httpHandler: ReturnType<typeof createHttpOutboxHandler> | null = null;
  if (dispatchConfig.enabled) {
    const { url, secret, credentialKeyId } = dispatchConfig;
    if (!url || !secret || !credentialKeyId) throw new Error('Enabled hotel outbox dispatch configuration is incomplete.');
    httpHandler = createHttpOutboxHandler({ url, secret, credentialKeyId });
  }

  ;(globalThis as any).__hotelOutboxJobsState = { starting: true };
  const context = getHotelWorkerContext(config);
  const workerId = process.env.HOTEL_OUTBOX_WORKER_ID || `hotel-${process.pid}`;
  const intervalMs = Number(process.env.HOTEL_OUTBOX_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  const topics = httpHandler ? undefined : HOTEL_COMMUNICATION_TOPICS;
  const handler = async (event: any) => {
    if (event.topic === 'hotel.communication.booking_prearrival' && !(await prearrivalStillEligible(context.prisma, event.payloadSnapshot))) return { suppressed: true, reason: 'Reservation changed, arrival passed or scheduled emails disabled.' };
    if (isHotelCommunicationTopic(event.topic) && smtpInfrastructureConfigured) {
      const settings = await context.prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { contactEmail: true } });
      if (!settings?.contactEmail) throw new Error('Property communication settings are unconfigured.');
      return {
        channel: 'smtp',
        ...(await sendHotelCommunicationEmail(event.payloadSnapshot as HotelCommunicationPayload)),
      };
    }
    if (httpHandler) return httpHandler(event);
    throw new Error('No delivery adapter is configured for this outbox topic.');
  };

  const dispatch = async () => {
    try {
      const scheduled = await queueHotelPrearrivalCommunications(context);
      if (scheduled.failures) console.error('Scheduled communication records failed:', scheduled.failures);
      await dispatchHotelOutboxBatch(
        context.prisma,
        {
          propertyKey: 'the-alder-house', workerId,
          limit: smtpInfrastructureConfigured ? 1 : 25,
          topics,
          ambiguousTopics: smtpInfrastructureConfigured ? HOTEL_COMMUNICATION_TOPICS : [],
        },
        handler,
      );
      if (!scheduled.failures) await recordWorkerProgress(context.prisma, 'outbox');
    } catch (error) {
      console.error(safeOperationalErrorMessage('worker', error));
    }
  };

  let stopping = false;
  let inFlight: Promise<void> | null = null;
  const guardedDispatch = () => {
    if (stopping || inFlight) return;
    const current = dispatch().finally(() => { if (inFlight === current) inFlight = null; });
    inFlight = current;
    return current;
  };
  const interval = setInterval(() => void guardedDispatch(), Number.isFinite(intervalMs) ? Math.max(1_000, intervalMs) : DEFAULT_INTERVAL_MS);
  interval.unref();
  const shutdown = async () => {
    stopping = true;
    clearInterval(interval);
    await inFlight;
  };
  ;(globalThis as any).__hotelOutboxJobsState = { interval, shutdown };
  void guardedDispatch();
  return shutdown;
}
