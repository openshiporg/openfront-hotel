import { notFound } from 'next/navigation';
import GuestProfilePage from '@/features/platform/guests/screens/GuestProfilePage';
import { getGuestProfile } from '@/features/platform/guests/actions';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A missing or unreadable guest is a 404, never a 200 with an in-page message.
  const guest = await getGuestProfile(id).catch(() => null);
  if (!guest) notFound();
  return <GuestProfilePage />;
}
