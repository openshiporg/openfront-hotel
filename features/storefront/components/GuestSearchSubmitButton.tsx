'use client';

import { useFormStatus } from 'react-dom';
import { ArrowRight, LoaderCircle } from 'lucide-react';

export function GuestSearchSubmitButton({
  idleLabel,
  pendingLabel,
}: {
  idleLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="sf-btn sf-btn--lg sf-btn--block sf-btn--split" aria-busy={pending || undefined}>
      <span>{pending ? pendingLabel : idleLabel}</span>
      {pending ? <LoaderCircle className="sf-spinner" aria-hidden="true" /> : <ArrowRight className="sf-btn__go" aria-hidden="true" />}
    </button>
  );
}
