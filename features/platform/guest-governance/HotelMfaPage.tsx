'use client';
import Link from 'next/link';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changeHotelMfa, loadHotelMfaStatus } from './mfaActions';

export default function HotelMfaPage() {
  const [status, setStatus] = React.useState<any>(null); const [result, setResult] = React.useState<any>(null);
  const [action, setAction] = React.useState('enroll'); const [password, setPassword] = React.useState(''); const [code, setCode] = React.useState(''); const [recovery, setRecovery] = React.useState(false);
  const [busy, setBusy] = React.useState(false); const [message, setMessage] = React.useState('');
  async function run(fn: () => Promise<void>) { setBusy(true); setMessage(''); try { await fn(); } catch (error) { setMessage(error instanceof Error ? error.message : 'MFA operation failed.'); } finally { setBusy(false); } }
  return <main className="max-w-2xl space-y-5 p-6"><h1 className="text-2xl font-semibold">Authenticator security</h1><p>Protect your own staff account with an authenticator. Keep recovery codes privately; each code works once. Changing security settings revokes existing sessions.</p><Button variant="outline" disabled={busy} onClick={() => void run(async () => setStatus(await loadHotelMfaStatus()))}>Check security status</Button>{status && <p>MFA {status.enabled ? 'enabled' : 'not enabled'} · {status.recoveryCodesRemaining || 0} recovery codes remaining</p>}
    <form className="space-y-4 rounded-md border p-4" onSubmit={event => { event.preventDefault(); void run(async () => { const next = await changeHotelMfa(action, password, code, recovery); setResult(next); setPassword(''); setCode(''); if (action === 'enroll') setAction('confirm'); }); }}>
      <Label htmlFor="mfa-setting-action">Action</Label><select id="mfa-setting-action" className="block w-full rounded-md border bg-background p-2" value={action} onChange={event => setAction(event.target.value)}><option value="enroll">Start authenticator enrollment</option><option value="confirm">Confirm enrollment</option><option value="rotate_recovery">Replace recovery codes</option><option value="disable">Disable authenticator</option></select>
      <Label htmlFor="mfa-current-password">Current password</Label><Input id="mfa-current-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
      {action !== 'enroll' && <><Label htmlFor="mfa-current-code">Authenticator code</Label><Input id="mfa-current-code" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} required />{action !== 'confirm' && <Label className="flex gap-2"><input type="checkbox" checked={recovery} onChange={event => setRecovery(event.target.checked)} />Use an unused recovery code instead</Label>}</>}
      <Button disabled={busy || result?.signedOut}>Apply security action</Button>
    </form><p role="status">{message}</p>{result && <div className="space-y-3 rounded-md border p-4"><p>{result.message}</p>{result.secret && <><p>Enter this setup key in your authenticator:</p><code className="break-all">{result.secret}</code></>}{result.recoveryCodes?.length > 0 && <><p>Save these recovery codes privately now. They will not be displayed again.</p><ul>{result.recoveryCodes.map((value: string) => <li className="font-mono" key={value}>{value}</li>)}</ul></>}{result.signedOut && <Link className="underline" href="/dashboard/signin">Sign in again</Link>}</div>}
  </main>;
}
