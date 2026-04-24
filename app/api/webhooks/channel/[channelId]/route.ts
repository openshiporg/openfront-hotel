import { NextRequest, NextResponse } from 'next/server'
import { keystoneContext } from '@/features/keystone/context'
import { handleChannelWebhook } from '@/features/keystone/lib/channelSync'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params

  if (!channelId) {
    return NextResponse.json({ error: 'Missing channelId' }, { status: 400 })
  }

  try {
    const rawBody = await request.text()
    const headers = Object.fromEntries(request.headers.entries())

    const result = await handleChannelWebhook(
      keystoneContext,
      channelId,
      rawBody,
      headers
    )

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error('Channel webhook error:', error)
    return NextResponse.json(
      { error: error.message || 'Channel webhook failed' },
      { status: 400 }
    )
  }
}
