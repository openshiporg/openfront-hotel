'use client';
import Link from 'next/link';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { completeHotelMfa } from '@/features/platform/guest-governance/mfaActions';

export default function MfaForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState(completeHotelMfa, { message: '' });
  return <main className="mx-auto max-w-md space-y-5 p-6"><h1 className="text-2xl font-semibold">Verify your sign-in</h1><p>Enter your authenticator code or one unused recovery code. Password-only sign-in has no dashboard or record access while MFA is pending.</p><form action={action} className="space-y-4"><input type="hidden" name="from" value={from} /><Label htmlFor="mfa-code">Authenticator or recovery code</Label><Input id="mfa-code" name="code" autoComplete="one-time-code" required maxLength={64} /><Label className="flex gap-2"><input name="recovery" type="checkbox" />Use a recovery code</Label><Button disabled={pending}>Verify sign-in</Button></form><p role="status">{state.message}</p><Link className="underline" href="/dashboard/signin">Start sign-in again</Link></main>;
}
