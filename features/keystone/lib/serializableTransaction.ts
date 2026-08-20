export function isRetryableTransactionError(error: any) {
  const detail = `${error?.message || ''} ${error?.extensions?.debug?.message || ''} ${error?.extensions?.prisma?.message || ''}`;
  return error?.code === 'P2034' || error?.code === '40001' || error?.extensions?.prisma?.code === 'P2034' || /could not serialize|write conflict|deadlock|current transaction is aborted/i.test(detail);
}

export async function runSerializableTransaction<T>(
  context: any,
  operation: (transactionContext: any) => Promise<T>,
  options: { attempts?: number; maxWait?: number; timeout?: number } = {},
): Promise<T> {
  const attempts = options.attempts || 8;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await context.transaction(operation, {
        maxWait: options.maxWait || 5_000,
        timeout: options.timeout || 30_000,
        isolationLevel: 'Serializable',
      });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 20 + Math.floor(Math.random() * 20)));
    }
  }
  throw new Error('Serializable transaction retry budget was exhausted.');
}
