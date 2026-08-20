import { getContext } from '@keystone-6/core/context';
import type { KeystoneConfig } from '@keystone-6/core/types';
import * as PrismaModule from '@prisma/client';

import {
  createHttpOutboxHandler,
  dispatchHotelOutboxBatch,
} from '../lib/hotelOutbox';
import { getOutboxDispatchConfig } from '../lib/integrationConfig';
import {
  HOTEL_COMMUNICATION_TOPICS,
  isHotelCommunicationTopic,
  type HotelCommunicationPayload,
} from '../lib/hotelCommunications';
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
  const context = getContext(config, PrismaModule);
  const workerId = process.env.HOTEL_OUTBOX_WORKER_ID || `hotel-${process.pid}`;
  const intervalMs = Number(process.env.HOTEL_OUTBOX_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  const topics = httpHandler ? undefined : HOTEL_COMMUNICATION_TOPICS;
  const handler = async (event: any) => {
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
      await dispatchHotelOutboxBatch(
        context.prisma,
        { propertyKey: 'the-alder-house', workerId, limit: 25, topics },
        handler,
      );
    } catch (error) {
      console.error('Hotel outbox dispatch cycle failed:', error instanceof Error ? error.message : error);
    }
  };

  let stopping = false;
  let running = false;
  const guardedDispatch = async () => {
    if (stopping || running) return;
    running = true;
    try { await dispatch(); } finally { running = false; }
  };
  const interval = setInterval(() => void guardedDispatch(), Number.isFinite(intervalMs) ? Math.max(1_000, intervalMs) : DEFAULT_INTERVAL_MS);
  interval.unref();
  const shutdown = () => { stopping = true; clearInterval(interval); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  ;(globalThis as any).__hotelOutboxJobsState = { interval, shutdown };
  void guardedDispatch();
}
