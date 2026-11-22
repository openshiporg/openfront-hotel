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

// The database column is required, so a missing link would otherwise surface as a raw Prisma error that
// the dashboard can only show as "Unable to complete the request". Say which field to fill instead.
export const requiredRelationshipHooks = {
  validate: {
    create: ({ resolvedData, fieldKey, listKey, addValidationError }: any) => {
      if (resolvedData?.[fieldKey] == null) addValidationError(`Choose a ${fieldLabel(fieldKey)} for this ${fieldLabel(listKey)}.`);
    },
  },
};

function fieldLabel(key: string) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}
