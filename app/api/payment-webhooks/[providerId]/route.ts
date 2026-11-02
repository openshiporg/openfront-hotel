import { handleInboundWebhook } from '@/features/keystone/webhooks/inboundWebhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  return handleInboundWebhook(request, providerId);
}
