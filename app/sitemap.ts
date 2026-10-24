import type { MetadataRoute } from 'next';
import { configuredSiteOrigin } from '@/features/keystone/lib/productionConfig';
import { graphqlQuery } from '@/lib/graphql-client';

export const dynamic = 'force-dynamic';

const PUBLIC_PATHS = ['', '/rooms', '/amenities', '/gallery', '/location', '/contact', '/policies', '/bookings/lookup'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = configuredSiteOrigin().replace(/\/$/, '');
  if (!origin) return [];
  const rooms = await graphqlQuery<{ roomTypes: Array<{ id: string }> }>('query StorefrontSitemapRooms { roomTypes: storefrontRoomTypes { id } }')
    .then(data => data.roomTypes)
    .catch(() => []);
  return [
    ...PUBLIC_PATHS.map(path => ({ url: `${origin}${path}` })),
    ...rooms.map(room => ({ url: `${origin}/rooms/${encodeURIComponent(room.id)}` })),
  ];
}
