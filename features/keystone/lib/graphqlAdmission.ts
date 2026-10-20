import { Kind, parse, type DocumentNode, type FragmentDefinitionNode, type SelectionSetNode } from 'graphql';

import { HOTEL_GRAPHQL_MAX_EXPANDED_FIELDS, HOTEL_GRAPHQL_MAX_SELECTION_DEPTH } from './hotelGraphqlQueryLimits';

const MAX_BATCH = 10;
const MAX_TOKENS = 50_000;
// Selections visited while expanding (fields, spreads and inline fragments).
const MAX_EXPANSION_VISITS = HOTEL_GRAPHQL_MAX_EXPANDED_FIELDS * 4;

export type GraphqlAdmission = { ok: true } | { ok: false; message: string };

class AdmissionRejected extends Error {}

/**
 * Count the expanded selection of one document, stopping as soon as the work budget is spent.
 * Every visit counts, including each repeated expansion of the same fragment, so a small
 * document whose fragments fan out exponentially is refused after bounded work.
 */
function assertBoundedExpansion(document: DocumentNode) {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition);
  }
  let fields = 0;
  let visits = 0;
  const visit = (selection: SelectionSetNode | undefined, depth: number, stack: Set<string>) => {
    if (!selection) return;
    if (depth > HOTEL_GRAPHQL_MAX_SELECTION_DEPTH) throw new AdmissionRejected(`Query exceeds maximum selection depth (${HOTEL_GRAPHQL_MAX_SELECTION_DEPTH}).`);
    for (const node of selection.selections) {
      visits += 1;
      if (visits > MAX_EXPANSION_VISITS) throw new AdmissionRejected('Query is too complex.');
      if (node.kind === Kind.FIELD) {
        fields += 1;
        if (fields > HOTEL_GRAPHQL_MAX_EXPANDED_FIELDS) throw new AdmissionRejected(`Query exceeds maximum expanded field count (${HOTEL_GRAPHQL_MAX_EXPANDED_FIELDS}).`);
        visit(node.selectionSet, depth + 1, stack);
      }
      else if (node.kind === Kind.INLINE_FRAGMENT) visit(node.selectionSet, depth, stack);
      else {
        const name = node.name.value;
        if (stack.has(name)) throw new AdmissionRejected('Cyclic fragments are not supported.');
        const fragment = fragments.get(name);
        if (!fragment) continue;
        stack.add(name);
        visit(fragment.selectionSet, depth, stack);
        stack.delete(name);
      }
    }
  };
  for (const definition of document.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) visit(definition.selectionSet, 0, new Set());
  }
}

function queriesOf(body: unknown, query: unknown): unknown[] {
  if (Array.isArray(body)) return body.map(item => (item && typeof item === 'object' ? (item as any).query : undefined));
  if (body && typeof body === 'object' && 'query' in body) return [(body as any).query];
  if (query && typeof query === 'object' && 'query' in (query as any)) return [(query as any).query];
  return [];
}

/**
 * Admission check run before the request policy and any database work: batch size, token
 * count and expanded-selection work are all bounded. Documents that do not parse are left to
 * GraphQL's own error handling.
 */
export function admitGraphqlRequest(body: unknown, query: unknown): GraphqlAdmission {
  const sources = queriesOf(body, query);
  if (sources.length > MAX_BATCH) return { ok: false, message: 'Too many operations in one request.' };
  for (const source of sources) {
    if (typeof source !== 'string') continue;
    let document: DocumentNode;
    try {
      document = parse(source, { maxTokens: MAX_TOKENS });
    } catch (error) {
      if (error instanceof Error && /Parsing aborted/i.test(error.message)) return { ok: false, message: 'Query is too large.' };
      continue;
    }
    try {
      assertBoundedExpansion(document);
    } catch (error) {
      if (error instanceof AdmissionRejected) return { ok: false, message: error.message };
      throw error;
    }
  }
  return { ok: true };
}
