import { permissions } from '../access';
import { calculateFolioBalance } from '../folios/ledger';

export function buildFolioReceipt(folio: any, settings: any) {
  if (folio.entries.some((entry: any) => entry.currencyCode !== folio.currencyCode)) throw new Error('Receipt contains mixed currencies. Reconcile the folio first.');
  const balance = calculateFolioBalance(folio.entries);
  const directBilled = folio.entries.some((entry: any) => entry.entryType === 'transfer' && entry.direction === 'credit');
  return { folioId: folio.id, folioNumber: folio.folioNumber, currencyCode: folio.currencyCode,
    kind: folio.status === 'closed' && balance.balanceMinor === 0 ? directBilled ? 'Final statement — direct billed' : 'Final receipt' : 'Folio statement',
    property: { name: settings.propertyName, address: [settings.addressLine1, settings.addressLine2, settings.city, settings.state, settings.postalCode].filter(Boolean).join(', '), contactEmail: settings.contactEmail },
    guestName: folio.booking?.guestName || '', confirmationNumber: folio.booking?.confirmationNumber || '', closedAt: folio.closedAt || null,
    ...balance, entries: folio.entries.map((entry: any) => ({ id: entry.id, serviceDate: new Date(entry.serviceDate).toISOString().slice(0, 10),
      entryType: entry.entryType, direction: entry.direction, amountMinor: entry.amountMinor, currencyCode: entry.currencyCode,
      description: entry.description, sourceType: entry.sourceType, sourceId: entry.sourceId })) };
}
export async function hotelFolioReceipt(_root: unknown, { folioId }: { folioId: string }, context: any) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error('Folio payment permission is required.');
  if (!folioId || folioId.length > 200) throw new Error('A bounded folio ID is required.');
  const [folio, settings] = await Promise.all([
    context.prisma.folio.findUnique({ where: { id: folioId }, include: { booking: { select: { guestName: true, confirmationNumber: true } }, entries: { orderBy: [{ serviceDate: 'asc' }, { postedAt: 'asc' }, { id: 'asc' }] } } }),
    context.prisma.hotelSettings.findUnique({ where: { id: 1 } }),
  ]);
  if (!folio || !settings) throw new Error('Folio or property was not found.');
  return buildFolioReceipt(folio, settings);
}
