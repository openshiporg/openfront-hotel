import { getContext } from '@keystone-6/core/context';
import type { KeystoneConfig } from '@keystone-6/core/types';
import * as PrismaModule from '@prisma/client';
import { Prisma } from '@prisma/client';
import { acquireWorkerLease } from '../lib/workerLease';
import { requestBookingCancellation } from '../lib/bookingCancellation';

export function startHotelHoldJobs(config: KeystoneConfig) {
  if (process.env.NODE_ENV === 'test') return;
  const globalState = globalThis as any; if (globalState.__hotelHoldJobsState) return;
  const context = getContext(config, PrismaModule); const ownerId = `hotel-hold-${process.pid}`; let stopping = false;
  const run = async () => {
    if (stopping || !(await acquireWorkerLease(context.prisma, { leaseKey: 'booking-hold-expiry', ownerId, ttlMs: 120_000 }))) return;
    await context.transaction(async (tx: any) => {
      const rows = await tx.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Booking" WHERE "status"='pending' AND "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" <= NOW() ORDER BY "holdExpiresAt", "id" FOR UPDATE SKIP LOCKED LIMIT 50`) as Array<{id:string}>;
      for (const row of rows) {
        await requestBookingCancellation({
          context: tx,
          bookingId: row.id,
          refundReason: 'Unpaid reservation hold expired',
          idempotencyKey: `hold-expired:${row.id}`,
          actorId: null,
          source: 'guest',
          withinTransaction: true,
        });
      }
    }, { timeout: 30_000 });
  };
  const interval=setInterval(()=>void run(),60_000);interval.unref();const shutdown=()=>{stopping=true;clearInterval(interval)};process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);globalState.__hotelHoldJobsState={interval,shutdown};void run();
}
