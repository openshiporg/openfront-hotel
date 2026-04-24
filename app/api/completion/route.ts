export async function POST() {
  return Response.json(
    {
      error: 'AI assistant temporarily unavailable',
      details:
        'The dashboard AI route has been disabled during build stabilization. Re-enable it after the AI SDK wiring is upgraded.',
    },
    { status: 501 }
  )
}
