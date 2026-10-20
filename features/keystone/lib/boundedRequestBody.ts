export class RequestBodyRejectedError extends Error {
  constructor(readonly status: 400 | 408 | 413, message: string) {
    super(message);
  }
}

/**
 * Read a request body as text without ever holding more than `maxBytes`. The declared
 * Content-Length is only an early hint: the actual stream is counted, cancelled at the limit,
 * and abandoned after `deadlineMs`. The bytes are returned exactly as sent, for signatures.
 */
export async function readBoundedRequestText(request: Request, maxBytes: number, deadlineMs = 10_000): Promise<string> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestBodyRejectedError(413, 'Request body is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyRejectedError(400, 'Request body is missing.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new RequestBodyRejectedError(408, 'Request body was not received in time.')), deadlineMs);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RequestBodyRejectedError(413, 'Request body is too large.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (!size) throw new RequestBodyRejectedError(400, 'Request body is missing.');
  return Buffer.concat(chunks).toString('utf8');
}
