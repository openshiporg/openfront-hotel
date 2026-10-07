/** Never copy GraphQL transport errors: they can embed variables, personal data, and credentials. */
export function safeGraphQLError(error: unknown) {
  const response = (error as any)?.response;
  const raw = Array.isArray(response?.errors) ? response.errors : [];
  const message = 'Request could not be completed. Check the affected record and operation status before taking further action, or contact the property administrator.';
  const errors = raw.slice(0, 20).map(() => ({ message }));
  return { message, errors };
}
export function safeGraphQLLog(error: unknown) {
  const status = Number((error as any)?.response?.status);
  return { status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null, errorCount: Array.isArray((error as any)?.response?.errors) ? (error as any).response.errors.length : 0 };
}
