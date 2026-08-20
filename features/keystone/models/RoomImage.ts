import { list } from '@keystone-6/core';
import { checkbox, image, integer, json, relationship, text } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';
import { requiredRelationshipDb } from './requiredRelationship';

const storageInfrastructureConfigured = () => Boolean(
  process.env.S3_BUCKET_NAME && process.env.S3_REGION && process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY && process.env.S3_ENDPOINT
);

const canUseImageStorage = async (args: any) => {
  if (!permissions.canManageRooms(args) || !storageInfrastructureConfigured()) return false;
  const settings = await args.context.prisma.hotelSettings.findUnique({ where: { id: 1 }, select: { id: true } });
  return Boolean(settings);
};

export const RoomImage = list({
  access: {
    operation: {
      query: permissions.canManageRooms,
      create: canUseImageStorage,
      update: canUseImageStorage,
      delete: canUseImageStorage,
    },
  },
  ui: {
    listView: {
      initialColumns: ['image', 'imagePath', 'altText', 'roomType', 'order', 'isPrimary'],
    },
  },
  fields: {
    image: image({ storage: 'my_images' }),
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
