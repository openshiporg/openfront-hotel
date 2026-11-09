import type { NextConfig } from 'next';
import { s3ForcePathStyle } from './features/keystone/lib/s3-storage';

const s3Hostname = process.env.S3_ENDPOINT ? process.env.S3_ENDPOINT.replace(/^https?:\/\//, '').replace(/:\d+$/, '') : '/';

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Match the canonical dashboard upload transport (Keystone caps each file at 10 MiB).
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  serverExternalPackages: ['graphql'],
  // Every inbound callback is served by the reference /api/payment-webhooks/[providerId] route.
  // URLs already registered with Stripe, PayPal, and channels keep working
  // (a rewrite, not a redirect: providers do not follow redirects on POST).
  async rewrites() {
    return [
      { source: '/api/payment-providers/:providerCode/webhook', destination: '/api/payment-webhooks/:providerCode' },
      { source: '/api/webhooks/channel/:channelId', destination: '/api/payment-webhooks/channel-:channelId' },
    ];
  },
  // Workaround since we diverged from Keystone reltionship and document views
  // typescript: {
  //   ignoreBuildErrors: true,
  // },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        // Virtual-hosted buckets serve images from <bucket>.<endpoint host>
        hostname: s3ForcePathStyle(process.env.S3_ENDPOINT) ? s3Hostname : `${process.env.S3_BUCKET_NAME}.${s3Hostname}`,
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'plus.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;