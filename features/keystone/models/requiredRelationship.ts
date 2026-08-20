export function restrictRelation(model: string, relationName: string) {
  return model.replace(
    `@relation("${relationName}", fields:`,
    `@relation("${relationName}", onDelete: Restrict, fields:`,
  );
}

export const requiredRelationshipDb = {
  extendPrismaSchema(field: string) {
    return field.replaceAll('?', '');
  },
};
