'use client';

type GuestSearchStatusState = {
  phase: 'idle' | 'matched' | 'no_match' | 'error';
  message: string;
  value: unknown;
};

export function GuestSearchStatus({ state }: { state: GuestSearchStatusState }) {
  const isFailure = state.phase === 'no_match' || state.phase === 'error';
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="min-h-6">
      {state.message ? (
        <p className={isFailure
          ? 'border-l-2 border-[var(--lodging-danger)] pl-4 text-sm leading-6 text-[var(--lodging-danger)]'
          : 'text-sm text-[var(--lodging-accent-deep)]'}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
