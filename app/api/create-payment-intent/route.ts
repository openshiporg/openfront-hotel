export async function POST() {
  return Response.json(
    {
      error: 'Direct payment intent creation is disabled.',
      details: 'Use the ownership-bound booking payment session workflow.',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}
