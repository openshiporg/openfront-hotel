export function shouldStartHotelWorkers(env: NodeJS.ProcessEnv) {
  return env.NEXT_RUNTIME === 'nodejs'
    && env.NODE_ENV !== 'test'
    && env.NEXT_PHASE !== 'phase-production-build';
}
