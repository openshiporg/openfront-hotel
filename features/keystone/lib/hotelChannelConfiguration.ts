import { createHash } from 'node:crypto';
import { permissions } from '../access';
import { encryptChannelCredentials } from './channelCredentials';
import { findHotelLifecycleReplay, lockHotelLifecycle, recordHotelLifecycleEvent } from './hotelLifecycle';
import { runSerializableTransaction } from './serializableTransaction';

/** Stores a reviewable bridge draft. Activation belongs to an implemented partner contract. */
export async function saveHotelChannelDraft(_root: unknown, { input }: { input: any }, context: any) {
  if (!permissions.canManageBookings({ session: context.session }) || !permissions.canManageIntegrations({ session: context.session })) throw new Error('Not authorized to configure channels.');
  const name = String(input.name || '').trim(); const channelId = String(input.channelId || '').trim();
  const key = String(input.idempotencyKey || ''); const expectedVersion = Number(input.expectedVersion || 0);
  if (!name || name.length > 150 || !/^[\w:-]{16,180}$/.test(key) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('Invalid channel draft identity or version.');
  if (!['ota', 'gds', 'direct', 'metasearch'].includes(input.channelType)) throw new Error('Invalid channel type.');
  const apiBaseUrl = String(input.apiBaseUrl || '').trim();
  let allowedOrigins: string[] = [];
  if (apiBaseUrl) {
    const url = new URL(apiBaseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Bridge base URL must use HTTPS without credentials, query or fragment.');
    allowedOrigins = [url.origin];
  }
  const accessToken = String(input.accessToken || ''); const webhookSecret = String(input.webhookSecret || '');
  if (accessToken.length > 4000 || webhookSecret.length > 4000 || (accessToken && accessToken.length < 16) || (webhookSecret && webhookSecret.length < 16)) throw new Error('Credential lengths are invalid.');
  const mapping = input.roomTypes;
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || Object.keys(mapping).length > 500) throw new Error('Room mappings must be an object of external IDs to local room type IDs.');
  for (const [external, local] of Object.entries(mapping)) if (!external || external.length > 150 || typeof local !== 'string' || !local || local.length > 100) throw new Error('Invalid room mapping.');
  const credentials = { mode: 'disabled', apiBaseUrl, allowedOrigins, accessToken, webhookSecret };
  const request = { name, channelId, channelType: input.channelType, expectedVersion, mapping, credentialDigest: createHash('sha256').update(JSON.stringify(credentials)).digest('hex') };
  const eventKey = `channel-draft:${key}`;
  return runSerializableTransaction(context, async tx => {
    await lockHotelLifecycle(tx.prisma, eventKey);
    await tx.prisma.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `hotel-channel-config:${channelId || name}`);
    const identity = { request, aggregateType: 'channel_configuration', aggregateId: channelId || name, action: 'draft_saved' };
    const replay = await findHotelLifecycleReplay(tx.prisma, eventKey, identity);
    if (replay) return replay.afterSnapshot;
    const before = channelId ? await tx.prisma.channel.findUnique({ where: { id: channelId } }) : null;
    if (channelId && !before) throw new Error('Channel not found.');
    if (before?.isActive) throw new Error('An active channel must be retired through its partner lifecycle before changing mappings.');
    if (Number(before?.mappingRules?.version || 0) !== expectedVersion) throw new Error('Channel draft changed; refresh its mapping version.');
    const ids = [...new Set(Object.values(mapping))];
    if (ids.length && await tx.prisma.roomType.count({ where: { id: { in: ids } } }) !== ids.length) throw new Error('Every mapped room type must belong to this property.');
    const data = { name, channelType: input.channelType, credentials: encryptChannelCredentials(credentials), mappingRules: { version: expectedVersion + 1, roomTypes: mapping }, isActive: false, syncInventory: false, syncRates: false, syncStatus: 'paused' };
    const saved = before ? await tx.prisma.channel.update({ where: { id: before.id }, data }) : await tx.prisma.channel.create({ data });
    const result = { channelId: saved.id, name, version: expectedVersion + 1, status: 'draft', credentialsStored: Boolean(accessToken && webhookSecret), activationAvailable: false };
    await recordHotelLifecycleEvent({ prisma: tx.prisma, eventKey, actorId: context.session.itemId, identity, beforeSnapshot: { version: expectedVersion }, afterSnapshot: result });
    return result;
  });
}
