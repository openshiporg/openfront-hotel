import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { graphqlQuery } from '@/lib/graphql-client';
import { primaryRoomImage } from '@/lib/hotel-storefront';
import type { RoomType } from '@/lib/types';
import RoomDetailPage from '@/features/storefront/screens/RoomDetailPage';
import { storefrontPageMetadata } from '@/features/storefront/lib/page-metadata';

const ROOM_SUMMARY_QUERY = String.raw`
  query StorefrontRoomSummary($id: ID!) {
    roomType: storefrontRoomType(id: $id) {
      id
      name
      shortDescription
      thumbnail
      roomImages { id url imagePath isPrimary }
    }
  }
`;

type RoomSummary = Pick<RoomType, 'id' | 'name' | 'shortDescription' | 'thumbnail' | 'roomImages'>;

/** `null` when no public room has this id; `undefined` when it could not be checked. */
const loadRoom = cache(async (id: string): Promise<RoomSummary | null | undefined> => {
  try {
    return (await graphqlQuery<{ roomType: RoomSummary | null }>(ROOM_SUMMARY_QUERY, { id })).roomType;
  } catch {
    return undefined;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const room = await loadRoom((await params).slug);
  if (room === null) return { title: 'Page not found' };
  if (!room) return { title: 'Room' };
  return storefrontPageMetadata(room.name, room.shortDescription || `Rates, amenities and stay details for ${room.name}.`, { image: primaryRoomImage(room) });
}

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  if ((await loadRoom((await params).slug)) === null) notFound();
  return <RoomDetailPage />;
}
