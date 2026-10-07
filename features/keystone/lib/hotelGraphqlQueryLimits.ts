import { GraphQLError, Kind, type FragmentDefinitionNode, type SelectionSetNode, type ValidationRule } from 'graphql';
import type { Plugin } from 'graphql-yoga';

export const HOTEL_GRAPHQL_MAX_SELECTION_DEPTH = 24;
export const HOTEL_GRAPHQL_MAX_ALIASES = 500;
export const HOTEL_GRAPHQL_MAX_EXPANDED_FIELDS = 3_000;

/** Bound expanded query work so aliases and fragments cannot hide resolver fan-out. */
export const hotelGraphqlQueryLimits: ValidationRule = context => ({
  Document(document) {
    const fragments = new Map<string, FragmentDefinitionNode>(
      document.definitions
        .filter((node): node is FragmentDefinitionNode => node.kind === Kind.FRAGMENT_DEFINITION)
        .map(node => [node.name.value, node]),
    );
    let fields = 0;
    let aliases = 0;

    const inspect = (selection: SelectionSetNode | undefined, depth: number, stack: Set<string>) => {
      if (depth > HOTEL_GRAPHQL_MAX_SELECTION_DEPTH) {
        throw new Error(`Query exceeds maximum selection depth (${HOTEL_GRAPHQL_MAX_SELECTION_DEPTH}).`);
      }
      if (!selection) return;

      for (const node of selection.selections) {
        if (node.kind === Kind.FIELD) {
          fields += 1;
          if (fields > HOTEL_GRAPHQL_MAX_EXPANDED_FIELDS) {
            throw new Error(`Query exceeds maximum expanded field count (${HOTEL_GRAPHQL_MAX_EXPANDED_FIELDS}).`);
          }
          if (node.alias) {
            aliases += 1;
            if (aliases > HOTEL_GRAPHQL_MAX_ALIASES) {
              throw new Error(`Query exceeds maximum alias count (${HOTEL_GRAPHQL_MAX_ALIASES}).`);
            }
          }
          inspect(node.selectionSet, depth + 1, stack);
        } else if (node.kind === Kind.FRAGMENT_SPREAD) {
          const name = node.name.value;
          if (stack.has(name)) throw new Error('Cyclic fragments are not supported.');
          const fragment = fragments.get(name);
          if (!fragment) continue;
          const nextStack = new Set(stack);
          nextStack.add(name);
          inspect(fragment.selectionSet, depth, nextStack);
        } else {
          inspect(node.selectionSet, depth, stack);
        }
      }
    };

    try {
      for (const definition of document.definitions) {
        if (definition.kind === Kind.OPERATION_DEFINITION) inspect(definition.selectionSet, 0, new Set());
      }
    } catch (error) {
      context.reportError(new GraphQLError(error instanceof Error ? error.message : 'GraphQL query limit exceeded.'));
    }
  },
});

/** Register the admission rule in Yoga's ordinary GraphQL validation phase. */
export const hotelGraphqlQueryLimitsPlugin: Plugin = {
  onValidate({ addValidationRule }) {
    addValidationRule(hotelGraphqlQueryLimits);
  },
};
