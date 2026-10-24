import type { MetadataRoute } from 'next';
import { configuredSiteOrigin } from '@/features/keystone/lib/productionConfig';

export default function robots(): MetadataRoute.Robots {
  const origin = configuredSiteOrigin().replace(/\/$/, '');
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/api', '/account', '/book', '/booking/', '/stripe', '/paypal'] },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
