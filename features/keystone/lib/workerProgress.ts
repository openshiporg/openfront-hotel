export async function recordWorkerProgress(prisma: any, worker: 'holds' | 'refunds' | 'outbox') {
  const now = new Date();
  const data = { ownerId: `process:${process.pid}`, heartbeatAt: now, expiresAt: new Date(now.getTime() + 180_000) };
  await prisma.hotelWorkerLease.upsert({ where: { leaseKey: `progress:${worker}` }, create: { leaseKey: `progress:${worker}`, ...data }, update: data });
}

const WORKER_PROGRESS_MAX_AGE_MS = 180_000;

type WorkerProgress = { leaseKey: string; heartbeatAt: Date };

function workerIsFresh(rows: WorkerProgress[], worker: 'holds' | 'refunds' | 'outbox', now: Date) {
  return rows.some(row =>
    row.leaseKey === `progress:${worker}` &&
    now.getTime() - new Date(row.heartbeatAt).getTime() <= WORKER_PROGRESS_MAX_AGE_MS,
  );
}

export function getWorkerReadiness(rows: WorkerProgress[], communicationsRequired: boolean, now = new Date()) {
  const holds = workerIsFresh(rows, 'holds', now);
  const refunds = workerIsFresh(rows, 'refunds', now);
  const communications = workerIsFresh(rows, 'outbox', now);

  return {
    holds,
    refunds,
    communications,
    communicationsRequired,
    ready: holds && refunds && (!communicationsRequired || communications),
  };
}
