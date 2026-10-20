import { list } from '@keystone-6/core';
import { checkbox, image, integer, json, relationship, text } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';
import { requiredRelationshipDb } from './requiredRelationship';

const storageInfrastructureConfigured = () => Boolean(
  process.env.S3_BUCKET_NAME && process.env.S3_REGION && process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY && process.env.S3_ENDPOINT
);

// A public image path needs no file storage; only an uploaded file does.
const uploadAllowed = ({ inputData }: any) => !inputData?.image || storageInfrastructureConfigured();

export const RoomImage = list({
  access: {
    operation: {
      query: permissions.canManageRooms,
      create: permissions.canManageRooms,
      update: permissions.canManageRooms,
      delete: permissions.canManageRooms,
    },
    item: {
      create: uploadAllowed,
      update: uploadAllowed,
    },
  },
  hooks: {
    validateInput: ({ operation, resolvedData, item, addValidationError }) => {
      const image = resolvedData.image?.id ?? (operation === 'update' ? item?.image_id : null);
      const path = String(resolvedData.imagePath ?? (operation === 'update' ? item?.imagePath : '') ?? '').trim();
      if (!image && !path) addValidationError('Add an image path, or upload an image when uploads are available.');
    },
  },
  ui: {
    listView: {
      initialColumns: ['image', 'imagePath', 'altText', 'roomType', 'order', 'isPrimary'],
    },
  },
  fields: {
    image: image({
      storage: 'my_images',
      ui: {
        createView: { fieldMode: () => (storageInfrastructureConfigured() ? 'edit' : 'hidden') },
        itemView: { fieldMode: () => (storageInfrastructureConfigured() ? 'edit' : 'read') },
      },
    }),
    imagePath: text({
      ui: {
        description: 'Public path or remote URL used for seeded/storefront imagery when no uploaded image is present.',
      },
    }),
    altText: text(),
    caption: text(),
    order: integer({ defaultValue: 0 }),
    isPrimary: checkbox({ defaultValue: false }),
    roomType: relationship({ ref: 'RoomType.roomImages', db: requiredRelationshipDb }),
    metadata: json(),
    ...trackingFields,
  },
});
