import { Skeleton } from '@/features/storefront/components/ui';
export default function StorefrontLoading() {
  return <div className="sf-wrap sf-section" aria-busy="true">
    <p role="status" className="sf-eyebrow">Preparing the details of your stay…</p>
    <div style={{ height: 20 }} />
    <Skeleton height={64} width="min(520px, 80%)" />
    <div style={{ height: 32 }} />
    <Skeleton height={320} radius={22} />
  </div>;
}
