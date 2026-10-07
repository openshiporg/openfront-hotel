import { getContext } from '@keystone-6/core/context';
import type { KeystoneConfig } from '@keystone-6/core/types';
import * as PrismaModule from '@prisma/client';

import { safeOperationalErrorMessage } from '../lib/safeOperationalError';

const GLOBAL_KEY = '__hotelWorkerRuntimeState';

type WorkerRuntimeState = {
  contexts: WeakMap<KeystoneConfig, any>;
  contextInstances: Set<any>;
  shutdown?: () => Promise<void>;
  shutdownPromise?: Promise<void>;
  signalsInstalled: boolean;
  stopping: boolean;
};
type WorkerGlobal = typeof globalThis & { __hotelWorkerRuntimeState?: WorkerRuntimeState };

export function getOrCreateWorkerContext<T extends object, Context>(
  cache: WeakMap<T, Context>,
  config: T,
  create: () => Context,
): Context {
  if (cache.has(config)) return cache.get(config)!;
  const context = create();
  cache.set(config, context);
  return context;
}

export async function drainHotelWorkerRuntime(
  shutdown: () => Promise<void>,
  contexts: Iterable<any>,
) {
  let shutdownError: unknown;
  try { await shutdown(); } catch (error) { shutdownError = error; }

  const disconnects = await Promise.allSettled([...contexts].map(context => context?.prisma?.$disconnect?.()));
  if (shutdownError) throw shutdownError;
  const failedDisconnect = disconnects.find(result => result.status === 'rejected');
  if (failedDisconnect?.status === 'rejected') throw failedDisconnect.reason;
}

function getRuntimeState() {
  const globalState = globalThis as WorkerGlobal;
  return globalState[GLOBAL_KEY] ??= {
    contexts: new WeakMap<KeystoneConfig, any>(),
    contextInstances: new Set<any>(),
    signalsInstalled: false,
    stopping: false,
  };
}

export function getHotelWorkerContext(config: KeystoneConfig) {
  const state = getRuntimeState();
  if (state.stopping) throw new Error('Hotel worker runtime is shutting down.');
  return getOrCreateWorkerContext(state.contexts, config, () => {
    const context = getContext(config, PrismaModule);
    state.contextInstances.add(context);
    return context;
  });
}

export function registerHotelWorkerShutdown(shutdown: () => Promise<void>) {
  const state = getRuntimeState();
  if (state.stopping) throw new Error('Hotel worker runtime is shutting down.');
  if (state.signalsInstalled) return;
  state.shutdown = shutdown;
  state.signalsInstalled = true;

  const stop = () => {
    if (state.shutdownPromise) return;
    state.stopping = true;
    state.shutdownPromise = drainHotelWorkerRuntime(
      state.shutdown ?? (async () => undefined),
      state.contextInstances,
    ).catch(error => {
      console.error(safeOperationalErrorMessage('worker', error));
    });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
