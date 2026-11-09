type WorkerName = 'holds' | 'refunds' | 'security' | 'retirements';

async function recordWorkerMarker(prisma: any, leaseKey: string) {
  const now = new Date();
  const data = { ownerId: `process:${process.pid}`, heartbeatAt: now, expiresAt: new Date(now.getTime() + 180_000) };
  await prisma.hotelWorkerLease.upsert({ where: { leaseKey }, create: { leaseKey, ...data }, update: data });
}

/** The worker's work succeeded (or there was none): its queue is moving. */
export async function recordWorkerProgress(prisma: any, worker: WorkerName) {
  await recordWorkerMarker(prisma, `progress:${worker}`);
}

const WORKER_PROGRESS_MAX_AGE_MS = 180_000;

type WorkerProgress = { leaseKey: string; heartbeatAt: Date };

function workerIsFresh(rows: WorkerProgress[], worker: WorkerName, now: Date) {
  return rows.some(row =>
    row.leaseKey === `progress:${worker}` &&
    now.getTime() - new Date(row.heartbeatAt).getTime() <= WORKER_PROGRESS_MAX_AGE_MS,
  );
}

export function getWorkerReadiness(rows: WorkerProgress[], now = new Date()) {
  const holds = workerIsFresh(rows, 'holds', now);
  const refunds = workerIsFresh(rows, 'refunds', now);
  return { holds, refunds, ready: holds && refunds };
}
