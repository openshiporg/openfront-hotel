import type { Metadata } from 'next';
import { getHotelSettings } from './hotel-settings';

/**
 * Title, description and a complete Open Graph set for one storefront page. A page's
 * `openGraph` replaces the layout's rather than merging, so it carries everything.
 */
export async function storefrontPageMetadata(title: string, description: string, options: { index?: boolean; image?: string } = {}): Promise<Metadata> {
  const identity = await getHotelSettings();
  const siteName = identity.state === 'configured' ? identity.name : 'Direct reservations';
  return {
    title,
    description,
    openGraph: {
      type: 'website',
      siteName,
      title: `${title} · ${siteName}`,
      description,
      images: [options.image ? { url: options.image, alt: title } : { url: identity.media.hero.imagePath, alt: identity.media.hero.altText }],
    },
    ...(options.index === false ? { robots: { index: false } } : {}),
  };
}
