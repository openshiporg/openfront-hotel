import { shouldStartHotelWorkers } from './features/keystone/jobs/runtimePolicy';

export async function register() {
  if (!shouldStartHotelWorkers(process.env)) return;

  const [{ default: config }, { startHotelWorkers }] = await Promise.all([
    import('./features/keystone'),
    import('./features/keystone/startHotelWorkers'),
  ]);
  await startHotelWorkers(config);
}
