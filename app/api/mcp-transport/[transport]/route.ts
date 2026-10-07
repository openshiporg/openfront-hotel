const disabledBody = {
  jsonrpc: '2.0',
  id: null,
  error: {
    code: -32004,
    message: 'MCP transport is disabled until scoped, revocable machine authentication is implemented.',
  },
};

function disabledResponse() {
  return Response.json(disabledBody, {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Hotel intentionally defers machine access; browser cookies are not machine credentials. */
export async function GET() {
  return disabledResponse();
}

export async function POST() {
  return disabledResponse();
}
