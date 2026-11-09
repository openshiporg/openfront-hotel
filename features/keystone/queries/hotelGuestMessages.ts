import { permissions } from '../access';

export const hotelGuestMessagesTypeDefs = String.raw`
  extend type Query { hotelGuestMessages: JSON! }
`;

/** Contact inquiries for the front desk: the durable record written when a guest submits the storefront contact form. */
export async function hotelGuestMessages(_root: unknown, _args: unknown, context: any) {
  if (!permissions.canManageBookings({ session: context.session }) && !permissions.canManageGuests({ session: context.session })) {
    throw new Error('Not authorized to read guest messages.');
  }
  const rows = await context.prisma.hotelContactMessage.findMany({
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: 100,
  });
  if (rows instanceof Error) throw rows;
  return {
    messages: rows.map((row: any) => ({
      id: row.id,
      reference: row.reference,
      receivedAt: row.receivedAt,
      guestName: row.guestName,
      replyTo: row.replyTo,
      phone: row.phone,
      subject: row.subject,
      message: row.message,
    })),
  };
}
