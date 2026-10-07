import { NextRequest, NextResponse } from 'next/server'
import { keystoneContext } from '@/features/keystone/context'
import { handleChannelWebhook } from '@/features/keystone/channels/commands'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params

  if (!channelId) {
    return NextResponse.json({ error: 'Missing channelId' }, { status: 400 })
  }

  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing webhook body');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1_048_576) { await reader.cancel(); return NextResponse.json({ error: 'Webhook body too large' }, { status: 413 }); } chunks.push(value); }
    const rawBody = Buffer.concat(chunks).toString('utf8')
    const headers = Object.fromEntries(request.headers.entries())

    const result = await handleChannelWebhook(
      keystoneContext,
      channelId,
      rawBody,
      headers
    )

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error('Channel webhook rejected')
    return NextResponse.json(
      { error: 'Channel webhook rejected' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
