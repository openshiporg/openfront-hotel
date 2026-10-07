import {
  Kind,
  parse,
  valueFromASTUntyped,
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
} from 'graphql';

export type HotelGraphqlAbuseLimit = {
  scope: string;
  identity: string;
  limit: number;
  windowMs: number;
  includeNetwork?: boolean;
};

type GraphqlRootField = { name: string; arguments: Record<string, unknown> };
type GraphqlRequestShape = {
  query?: unknown;
  operationName?: unknown;
  variables?: unknown;
};

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

/** Next exposes GET GraphQL parameters separately from the parsed POST body. */
export function hotelGraphqlPolicyRequest(method: string | undefined, body: unknown, query: unknown) {
  if (String(method || '').toUpperCase() !== 'GET') return body;
  const parameters = asRecord(query);
  const rawVariables = firstQueryValue(parameters.variables);
  let variables: unknown = rawVariables;
  if (typeof rawVariables === 'string') {
    try { variables = JSON.parse(rawVariables); } catch { variables = {}; }
  }
  return {
    query: firstQueryValue(parameters.query),
    operationName: firstQueryValue(parameters.operationName),
    variables,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function rootFields(
  selectionSet: SelectionSetNode,
  fragments: Map<string, FragmentDefinitionNode>,
  stack = new Set<string>(),
): FieldNode[] {
  const result: FieldNode[] = [];
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      result.push(selection);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      result.push(...rootFields(selection.selectionSet, fragments, stack));
    } else if (!stack.has(selection.name.value)) {
      const fragment = fragments.get(selection.name.value);
      if (fragment) {
        const nextStack = new Set(stack);
        nextStack.add(selection.name.value);
        result.push(...rootFields(fragment.selectionSet, fragments, nextStack));
      }
    }
  }
  return result;
}

function selectedOperations(document: DocumentNode, operationName: unknown) {
  const operations = document.definitions.filter(definition => definition.kind === Kind.OPERATION_DEFINITION);
  if (typeof operationName === 'string' && operationName) {
    const selected = operations.filter(operation => operation.name?.value === operationName);
    return selected.length ? selected : operations;
  }
  return operations;
}

function selectedRootFields(request: GraphqlRequestShape): GraphqlRootField[] {
  if (typeof request.query !== 'string' || !request.query.trim()) return [];
  const document = parse(request.query);
  const variables = asRecord(request.variables);
  const fragments = new Map(
    document.definitions
      .filter((definition): definition is FragmentDefinitionNode => definition.kind === Kind.FRAGMENT_DEFINITION)
      .map(fragment => [fragment.name.value, fragment]),
  );
  return selectedOperations(document, request.operationName).flatMap(operation =>
    rootFields(operation.selectionSet, fragments).map(field => ({
      // GraphQL field names, not aliases or comment/string contents, own policy.
      name: field.name.value,
      arguments: Object.fromEntries((field.arguments || []).map(argument => [
        argument.name.value,
        valueFromASTUntyped(argument.value, variables),
      ])),
    })),
  );
}

function identity(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().slice(0, 255)
    : '';
}

/**
 * Inspect the actual selected GraphQL operation fields. Aliases and comments do
 * not change field identity; fragments are expanded and every selected root
 * field contributes its own limit, including mixed operations.
 */
export function hotelGraphqlRequestPolicy(body: unknown): {
  abuseLimits: HotelGraphqlAbuseLimit[];
  blockedBuiltInPasswordReset: boolean;
} {
  const requests = Array.isArray(body) ? body : [body];
  const abuseLimits: HotelGraphqlAbuseLimit[] = [];
  let blockedBuiltInPasswordReset = false;

  for (const candidate of requests) {
    const request = asRecord(candidate) as GraphqlRequestShape;
    let fields: GraphqlRootField[];
    try {
      fields = selectedRootFields(request);
    } catch {
      // Invalid syntax cannot execute; Yoga returns its ordinary parse error.
      continue;
    }

    for (const field of fields) {
      const email = identity(field.arguments.email);
      const add = (scope: string, value: string, limit: number, windowMs: number, includeNetwork?: boolean) => {
        abuseLimits.push({ scope, identity: value, limit, windowMs, ...(includeNetwork === undefined ? {} : { includeNetwork }) });
      };

      if (field.name === 'authenticateUserWithPassword') {
        add('auth-login', email, 8, 15 * 60_000);
      } else if (field.name === 'sendUserPasswordResetLink') {
        add('auth-reset-request', email, 5, 60 * 60_000);
        add('auth-reset-request-account', email, 10, 60 * 60_000, false);
      } else if (field.name === 'redeemHotelPasswordResetToken' || field.name === 'redeemUserPasswordResetToken') {
        add('auth-reset-redeem', email, 8, 15 * 60_000);
        add('auth-reset-redeem-account', email, 12, 15 * 60_000, false);
        if (field.name === 'redeemUserPasswordResetToken') blockedBuiltInPasswordReset = true;
      } else if (field.name === 'verifyGuestBooking') {
        add('guest-booking-verify-http', identity(field.arguments.confirmationNumber), 10, 15 * 60_000);
      } else if (field.name === 'createStorefrontBooking') {
        const data = asRecord(field.arguments.data);
        add('booking-create-http', identity(data.guestEmail), 8, 60 * 60_000);
      }
    }
  }

  return { abuseLimits, blockedBuiltInPasswordReset };
}
