export async function POST() {
  return Response.json(
    {
      error: 'Direct email dispatch is disabled.',
      details: 'Booking email must be initiated by an authorized booking lifecycle operation.',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}
