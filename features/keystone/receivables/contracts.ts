export const HOTEL_RECEIVABLE_ACTIONS = [
  'account',
  'invoice',
  'route_charges',
  'collect',
  'write_off',
  'refund_credit',
] as const;

export type HotelReceivableAction = (typeof HOTEL_RECEIVABLE_ACTIONS)[number];

export type HotelPayerAllocation = {
  entryId: string;
  amountMinor: number;
};

type ReceivableCommandBase = {
  id: string;
  idempotencyKey: string;
  amountMinor: number;
  reference: string;
  billingEmail: string;
  termsDays: number;
  accountId: string;
  folioId: string;
  bookingId: string;
  method: string;
  approvalId: string;
};

export type ManageHotelReceivableInput =
  | (ReceivableCommandBase & {
      action: 'route_charges';
      payerAllocations: HotelPayerAllocation[];
    })
  | (ReceivableCommandBase & {
      action: Exclude<HotelReceivableAction, 'route_charges'>;
      payerAllocations?: never;
    });
