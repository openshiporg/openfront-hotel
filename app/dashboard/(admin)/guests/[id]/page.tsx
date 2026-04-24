'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { gql, request } from 'graphql-request';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { GuestProfile, Guest } from '@/features/platform/guests/components/GuestProfile';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { useToast } from '@/components/ui/use-toast';

const GET_GUEST = gql`
  query GetGuest($id: ID!) {
    guest(where: { id: $id }) {
      id
      firstName
      lastName
      email
      phone
      company
      address1
      address2
      city
      state
      postalCode
      country
      loyaltyNumber
      loyaltyTier
      loyaltyPoints
      preferences
      idType
      idNumber
      nationality
      isVip
      isBlacklisted
      specialNotes
      lastStayAt
      totalStays
      totalSpent
      createdAt
      bookings(orderBy: { checkInDate: desc }) {
        id
        confirmationNumber
        checkInDate
        checkOutDate
        status
        totalAmount
        specialRequests
        roomAssignments {
          roomType {
            name
          }
        }
      }
    }
  }
`;

export default function GuestProfilePage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const guestId = params?.id as string;

  const [loading, setLoading] = React.useState(true);
  const [guest, setGuest] = React.useState<Guest | null>(null);

  React.useEffect(() => {
    const fetchGuest = async () => {
      if (!guestId) return;

      try {
        const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/api/graphql';
        const data = await request<{ guest: any }>(endpoint, GET_GUEST, { id: guestId });
        
        if (data.guest) {
          const transformedGuest: Guest = {
            ...data.guest,
            bookings: data.guest.bookings?.map((b: any) => ({
              ...b,
              roomType: b.roomAssignments?.[0]?.roomType?.name,
            })),
          };
          setGuest(transformedGuest);
        }
      } catch (err) {
        console.error('Error fetching guest:', err);
        toast({
          title: 'Error',
          description: 'Failed to load guest profile.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchGuest();
  }, [guestId, toast]);

  const header = (
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="icon" onClick={() => router.back()}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div>
        <h1 className="text-lg font-semibold md:text-2xl">Guest Profile</h1>
        {guest && (
          <p className="text-muted-foreground">
            {guest.firstName} {guest.lastName}
          </p>
        )}
      </div>
    </div>
  );

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Guests', path: '/dashboard/Guest' },
    { type: 'page' as const, label: guest ? `${guest.firstName} ${guest.lastName}` : 'Profile' },
  ];

  if (loading) {
    return (
      <PageContainer title="Guest Profile" header={header} breadcrumbs={breadcrumbs}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageContainer>
    );
  }

  if (!guest) {
    return (
      <PageContainer title="Guest Profile" header={header} breadcrumbs={breadcrumbs}>
        <div className="text-center py-12">
          <p className="text-lg mb-4">Guest not found</p>
          <Button onClick={() => router.push('/dashboard/Guest')}>
            Back to Guests
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Guest Profile" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full max-w-5xl p-4 md:p-6">
        <GuestProfile
          guest={guest}
          onEdit={() => router.push(`/dashboard/Guest/${guestId}`)}
          onSendEmail={() => {
            window.location.href = `mailto:${guest.email}`;
          }}
          onNewReservation={() => {
            router.push(`/dashboard/Booking/create?guestId=${guestId}`);
          }}
          onAddNote={() => {
            router.push(`/dashboard/Guest/${guestId}?focus=specialNotes`);
          }}
        />
      </div>
    </PageContainer>
  );
}
