'use client';

import { useFormStatus } from 'react-dom';

export function GuestSearchSubmitButton({
  idleLabel,
  pendingLabel,
}: {
  idleLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="lodging-button w-full disabled:opacity-60">
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
