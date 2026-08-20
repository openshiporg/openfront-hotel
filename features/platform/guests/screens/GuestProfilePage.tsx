'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { GuestProfile, type Guest } from '@/features/platform/guests/components/GuestProfile';
import { WorkspaceError } from '@/features/platform/components/WorkspaceControls';
import { getGuestProfile } from '../actions';

export default function GuestProfilePage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const guestId = params?.id as string;
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [guest, setGuest] = React.useState<Guest | null>(null);

  React.useEffect(() => {
    const run = async () => {
      if (!guestId) return;
      try {
        setError(null);
        setGuest(await getGuestProfile(guestId) as Guest | null);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Failed to load guest profile.';
        setError(message);
        toast({ title: 'Guest profile unavailable', description: message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [guestId, toast]);

  const header = (
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
      <div>
        <h1 className="text-lg font-semibold md:text-2xl">Guest Profile</h1>
        {guest && <p className="text-muted-foreground">{guest.firstName} {guest.lastName}</p>}
      </div>
    </div>
  );
  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Guests', path: '/dashboard/platform/guests' },
    { type: 'page' as const, label: guest ? `${guest.firstName} ${guest.lastName}` : 'Profile' },
  ];

  if (loading) return <PageContainer title="Guest Profile" header={header} breadcrumbs={breadcrumbs}><div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div></PageContainer>;
  if (error) return <PageContainer title="Guest Profile" header={header} breadcrumbs={breadcrumbs}><div className="p-4 md:p-6"><WorkspaceError message={error} onRetry={() => window.location.reload()} /></div></PageContainer>;
  if (!guest) return <PageContainer title="Guest Profile" header={header} breadcrumbs={breadcrumbs}><div className="py-12 text-center"><p className="mb-1 text-lg font-medium">Guest not found</p><p className="mb-4 text-sm text-muted-foreground">The profile may be outside your authority or no longer available.</p><Button onClick={() => router.push('/dashboard/platform/guests')}>Back to guests</Button></div></PageContainer>;

  return (
    <PageContainer title="Guest Profile" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full max-w-5xl p-4 md:p-6">
        <GuestProfile
          guest={guest}
          onEdit={() => router.push(`/dashboard/guests/${guestId}`)}
          onSendEmail={() => { window.location.href = `mailto:${guest.email}`; }}
          onNewReservation={() => router.push(`/dashboard/platform/reservations?guestId=${guestId}&new=1`)}
          onAddNote={() => router.push(`/dashboard/guests/${guestId}?focus=specialNotes`)}
        />
      </div>
    </PageContainer>
  );
}
