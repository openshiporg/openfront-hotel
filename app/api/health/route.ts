export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    { status: 'ok', service: 'openfront-hotel' },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
