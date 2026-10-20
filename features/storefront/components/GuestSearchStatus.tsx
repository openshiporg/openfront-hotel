'use client';

import { CircleAlert, CircleCheck } from 'lucide-react';

type GuestSearchStatusState = {
  phase: 'idle' | 'matched' | 'no_match' | 'error';
  message: string;
  value: unknown;
};

export function GuestSearchStatus({ state }: { state: GuestSearchStatusState }) {
  const isFailure = state.phase === 'no_match' || state.phase === 'error';
  return (
    <div role="status" aria-live="polite" aria-atomic="true" style={{ minHeight: 4 }}>
      {state.message ? (
        <p className={`sf-notice ${isFailure ? 'sf-notice--danger' : 'sf-notice--success'}`}>
          {isFailure ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
          <span>{state.message}</span>
        </p>
      ) : null}
    </div>
  );
}
