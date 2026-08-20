import { User } from './User';
import { Role } from './Role';
import { RoomType } from './RoomType';
import { RoomImage } from './RoomImage';
import { Room } from './Room';
import { RoomInventory } from './RoomInventory';
import { HousekeepingTask } from './HousekeepingTask';
import { RoomAssignment } from './RoomAssignment';
import { Booking } from './Booking';
import { BookingPayment } from './BookingPayment';
import { BookingPaymentSession } from './BookingPaymentSession';
import { PaymentProvider } from './PaymentProvider';
import { ReservationLineItem } from './ReservationLineItem';
import { Guest } from './Guest';
import { GuestDocument } from './GuestDocument';
import { LoyaltyTransaction } from './LoyaltyTransaction';
import { RatePlan } from './RatePlan';
import { SeasonalRate } from './SeasonalRate';
import { MaintenanceRequest } from './MaintenanceRequest';
import { Channel } from './Channel';
import { ChannelReservation } from './ChannelReservation';
import { ChannelSyncEvent } from './ChannelSyncEvent';
import { DailyMetrics } from './DailyMetrics';
import { HotelSettings } from './HotelSettings';
import { PaymentEvent } from './PaymentEvent';
import { Folio } from './Folio';
import { FolioEntry } from './FolioEntry';
import { HotelAuditEvent } from './HotelAuditEvent';
import { HotelOutboxEvent } from './HotelOutboxEvent';
import { HotelOutboxAttempt } from './HotelOutboxAttempt';
import { HotelOutboxReceipt } from './HotelOutboxReceipt';
import { HotelBusinessDate } from './HotelBusinessDate';
import { NightAuditRun } from './NightAuditRun';
import { GroupBlock } from './GroupBlock';
import { GroupBlockAllocation } from './GroupBlockAllocation';
import { RefundIntent } from './RefundIntent';
import { HotelSeedRecord } from './HotelSeedRecord';
import { HotelAbuseBucket } from './HotelAbuseBucket';
import { HotelWorkerLease } from './HotelWorkerLease';
import { BookingModificationRequest } from './BookingModificationRequest';

export const models = {
  User,
  Role,
  RoomType,
  RoomImage,
  Room,
  RoomInventory,
  HousekeepingTask,
  RoomAssignment,
  Booking,
  BookingPayment,
  BookingPaymentSession,
  PaymentProvider,
  ReservationLineItem,
  Guest,
  GuestDocument,
  LoyaltyTransaction,
  RatePlan,
  SeasonalRate,
  MaintenanceRequest,
  Channel,
  ChannelReservation,
  ChannelSyncEvent,
  DailyMetrics,
  HotelSettings,
  PaymentEvent,
  Folio,
  FolioEntry,
  HotelAuditEvent,
  HotelOutboxEvent,
  HotelOutboxAttempt,
  HotelOutboxReceipt,
  HotelBusinessDate,
  NightAuditRun,
  GroupBlock,
  GroupBlockAllocation,
  RefundIntent,
  HotelSeedRecord,
  HotelAbuseBucket,
  HotelWorkerLease,
  BookingModificationRequest,
};

export default models;
