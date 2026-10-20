import type { IncomingMessage } from 'http';
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import {
  getNamedType,
  getNullableType,
  isInputObjectType,
  isListType,
  isObjectType,
  Kind,
  parse,
  print,
  specifiedRules,
  TypeInfo,
  validate,
  visit,
  visitWithTypeInfo,
  type DocumentNode,
  type GraphQLField,
  type GraphQLSchema,
  type SelectionSetNode,
} from 'graphql';
import { keystoneContext } from '@/features/keystone/context';
import { hotelGraphqlQueryLimits } from '@/features/keystone/lib/hotelGraphqlQueryLimits';
import { safeGraphQLError } from '@/features/platform/lib/safeGraphQLError';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_MESSAGES = 20;
const MAX_STEPS = 8;
const MAX_ROWS = 50;
const MAX_DEPTH = 4;
const MAX_FIELDS = 60;
const MAX_RESULT_CHARS = 24_000;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const PROVIDER_ERROR = 'The assistant could not complete this request. Check the API key and model in assistant settings.';

const SYSTEM_INSTRUCTIONS = `You help hotel staff answer questions about their property's data in the Openfront dashboard.

You can only read data, and only what the signed-in staff member is allowed to see. You cannot create, change, cancel, refund or delete anything. When someone asks for a change, tell them which dashboard page handles it (for example Front Desk, Reservations, Folios, Payments, Rooms, Rate Plans, Housekeeping or Property Settings).

How to answer:
1. Use listModels to find the collection that matches the question (for example "booking", "room", "guest", "payment").
2. Use describeType on the collection's type to see its fields and filters.
3. Use queryData to read records (at most ${MAX_ROWS} per request), or countData for totals.
4. Answer from the returned data only. If a read is refused or returns nothing, say so plainly. Never guess figures, guest details or availability.

Keep answers short. Show money with its currency and dates as YYYY-MM-DD.`;

class RequestRejected extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function reply(status: number, error: string) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readBoundedJson(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new RequestRejected(413, 'Request is too large.');
  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RequestRejected(413, 'Request is too large.');
    }
    chunks.push(value);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new RequestRejected(400, 'Invalid request.');
  }
}

/** Staff session for this request, with the same MFA and revocation checks as /api/graphql. */
async function staffContext(req: Request) {
  const headers: Record<string, string> = {};
  const cookie = req.headers.get('cookie');
  if (cookie) headers.cookie = cookie;
  const context = await keystoneContext.withRequest({ headers } as unknown as IncomingMessage);
  if (!context.session?.data?.role?.canAccessDashboard) return null;
  return context;
}

function listQueries(schema: GraphQLSchema) {
  const fields = schema.getQueryType()?.getFields() ?? {};
  return Object.values(fields).filter(
    (field) => field.args.some((arg) => arg.name === 'take') && isObjectType(getNamedType(field.type)),
  );
}

function countQueries(schema: GraphQLSchema) {
  const fields = schema.getQueryType()?.getFields() ?? {};
  return Object.values(fields).filter(
    (field) => field.name.endsWith('Count') && field.args.some((arg) => arg.name === 'where'),
  );
}

function selectionDepth(selection: SelectionSetNode | undefined, depth = 0): number {
  if (!selection) return depth;
  return Math.max(depth, ...selection.selections.map((node) =>
    'selectionSet' in node ? selectionDepth(node.selectionSet, depth + 1) : depth + 1,
  ));
}

/** Parse and check a generated read: one query, one root field, bounded depth, width and list sizes. */
function admitRead(schema: GraphQLSchema, query: string, rootField: string): { document?: DocumentNode; problems: string[] } {
  let document: DocumentNode;
  try {
    document = parse(query, { maxTokens: 2_000 });
  } catch (error) {
    return { problems: [error instanceof Error ? error.message : 'The query could not be parsed.'] };
  }
  const [operation] = document.definitions;
  if (document.definitions.length !== 1 || operation.kind !== Kind.OPERATION_DEFINITION || operation.operation !== 'query') {
    return { problems: ['Only a single read query is allowed.'] };
  }
  const roots = operation.selectionSet.selections;
  if (roots.length !== 1 || roots[0].kind !== Kind.FIELD || roots[0].name.value !== rootField) {
    return { problems: ['The fields must stay inside the requested collection.'] };
  }
  const problems: string[] = [];
  if (selectionDepth(operation.selectionSet) > MAX_DEPTH) problems.push(`Select at most ${MAX_DEPTH - 1} levels of related records.`);

  let fieldCount = 0;
  const typeInfo = new TypeInfo(schema);
  visit(document, visitWithTypeInfo(typeInfo, {
    Field(node) {
      fieldCount += 1;
      const type = typeInfo.getType();
      if (!type) return;
      const nullable = getNullableType(type);
      if (isListType(nullable) && isObjectType(getNamedType(type))) {
        const take = node.arguments?.find((arg) => arg.name.value === 'take');
        const bounded = take && (
          (take.value.kind === Kind.INT && Number(take.value.value) <= MAX_ROWS)
          || (take.value.kind === Kind.VARIABLE && take.value.name.value === 'take')
        );
        if (!bounded) problems.push(`Add take: ${MAX_ROWS} or less to the related list "${node.name.value}".`);
      }
    },
  }));
  if (fieldCount > MAX_FIELDS) problems.push(`Select at most ${MAX_FIELDS} fields.`);

  const validation = validate(schema, document, [...specifiedRules, hotelGraphqlQueryLimits]);
  problems.push(...validation.slice(0, 5).map((error) => error.message));
  return problems.length ? { problems } : { document, problems };
}

function boundedResult(data: unknown) {
  const text = JSON.stringify(data);
  return text.length <= MAX_RESULT_CHARS
    ? { data }
    : { truncated: true, note: 'The result was too large. Select fewer fields or rows.', partial: text.slice(0, MAX_RESULT_CHARS) };
}

function readTools(context: NonNullable<Awaited<ReturnType<typeof staffContext>>>) {
  const schema = context.graphql.schema;

  async function run(document: DocumentNode, variables: Record<string, unknown>) {
    const result = await context.graphql.raw({ query: print(document), variables });
    if (result.errors?.length) return { error: safeGraphQLError({ response: { errors: result.errors } }).message };
    return boundedResult(result.data);
  }

  function argType(field: GraphQLField<unknown, unknown>, name: string) {
    return field.args.find((arg) => arg.name === name)?.type.toString();
  }

  return {
    listModels: tool({
      description: 'List the hotel data collections you can read. Optionally filter by a search word.',
      inputSchema: z.object({ search: z.string().max(60).optional() }),
      execute: async ({ search }) => {
        const needle = (search || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return listQueries(schema)
          .map((field) => ({ operation: field.name, type: getNamedType(field.type).name, countOperation: `${field.name}Count` }))
          .filter((entry) => !needle || `${entry.operation}${entry.type}`.toLowerCase().includes(needle))
          .slice(0, 80);
      },
    }),
    describeType: tool({
      description: 'Show the fields of a data type and the filters its collection accepts.',
      inputSchema: z.object({ typeName: z.string().min(1).max(80) }),
      execute: async ({ typeName }) => {
        const type = schema.getType(typeName);
        if (!type || !isObjectType(type)) return { error: `Unknown type "${typeName}". Use listModels first.` };
        const where = schema.getType(`${typeName}WhereInput`);
        return {
          fields: Object.values(type.getFields()).slice(0, 150).map((field) => ({ name: field.name, type: field.type.toString() })),
          filters: where && isInputObjectType(where)
            ? Object.values(where.getFields()).slice(0, 150).map((field) => ({ name: field.name, type: field.type.toString() }))
            : [],
        };
      },
    }),
    queryData: tool({
      description: `Read records from a collection. "fields" is a GraphQL selection such as "id status checkInDate guest { name }". Related lists need take: ${MAX_ROWS} or less.`,
      inputSchema: z.object({
        operation: z.string().min(1).max(80),
        fields: z.string().min(1).max(1_500),
        where: z.record(z.any()).optional(),
        orderBy: z.array(z.record(z.enum(['asc', 'desc']))).max(3).optional(),
        take: z.number().int().min(1).max(MAX_ROWS).optional(),
        skip: z.number().int().min(0).max(100_000).optional(),
      }),
      execute: async ({ operation, fields, where, orderBy, take, skip }) => {
        const field = listQueries(schema).find((candidate) => candidate.name === operation);
        if (!field) return { error: `Unknown collection "${operation}". Use listModels first.` };
        const variables: Record<string, unknown> = { take: take ?? 20 };
        const definitions = [`$take: ${argType(field, 'take')}`];
        const args = ['take: $take'];
        for (const [name, value] of Object.entries({ where, orderBy, skip })) {
          const type = argType(field, name);
          if (value === undefined || !type) continue;
          variables[name] = value;
          definitions.push(`$${name}: ${type}`);
          args.push(`${name}: $${name}`);
        }
        const admitted = admitRead(schema, `query AssistantRead(${definitions.join(', ')}) { ${operation}(${args.join(', ')}) { ${fields} } }`, operation);
        if (!admitted.document) return { error: admitted.problems.join(' ') };
        return run(admitted.document, variables);
      },
    }),
    countData: tool({
      description: 'Count records in a collection, optionally filtered. Use the countOperation from listModels.',
      inputSchema: z.object({ operation: z.string().min(1).max(80), where: z.record(z.any()).optional() }),
      execute: async ({ operation, where }) => {
        const field = countQueries(schema).find((candidate) => candidate.name === operation);
        if (!field) return { error: `Unknown count "${operation}". Use listModels first.` };
        const admitted = admitRead(schema, `query AssistantCount($where: ${argType(field, 'where')}) { ${operation}(where: $where) }`, operation);
        if (!admitted.document) return { error: admitted.problems.join(' ') };
        return run(admitted.document, { where: where ?? {} });
      },
    }),
  };
}

/**
 * Dashboard assistant. The caller supplies their own OpenRouter key for this request only;
 * it is never stored or logged. Tools read through the caller's own session, so list access
 * rules apply, and no tool can write.
 */
export async function POST(req: Request) {
  const context = await staffContext(req);
  if (!context) return reply(401, 'Sign in to the dashboard to use the assistant.');

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJson(req);
  } catch (error) {
    return error instanceof RequestRejected ? reply(error.status, error.message) : reply(400, 'Invalid request.');
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  if (!apiKey || apiKey.length > 512 || /\s/.test(apiKey)) return reply(400, 'Add your API key in assistant settings.');
  if (!/^[\w.-]+\/[\w.:-]+$/.test(model) || model.length > 160) return reply(400, 'Choose a model in assistant settings.');
  const maxTokens = Number(body.maxTokens);

  const rawMessages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 8_000) : '';
  const inputMessages = (rawMessages.length
    ? rawMessages
    : prompt ? [{ id: `prompt-${Date.now()}`, role: 'user', parts: [{ type: 'text', text: prompt }] }] : []) as UIMessage[];
  if (!inputMessages.length) return reply(400, 'Type a question for the assistant.');

  let messages;
  try {
    messages = await convertToModelMessages(inputMessages);
  } catch {
    return reply(400, 'Invalid conversation.');
  }

  const openrouter = createOpenRouter({ apiKey, baseURL: OPENROUTER_BASE_URL });
  const result = streamText({
    model: openrouter(model),
    system: SYSTEM_INSTRUCTIONS,
    messages,
    tools: readTools(context),
    stopWhen: stepCountIs(MAX_STEPS),
    abortSignal: req.signal,
    ...(Number.isInteger(maxTokens) && maxTokens > 0 ? { maxOutputTokens: Math.min(maxTokens, 8_000) } : {}),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: inputMessages,
    onError: () => PROVIDER_ERROR,
  });
}
