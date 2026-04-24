import { User } from './User';
import { Role } from './Role';
import { RoomType } from './RoomType';
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

export const models = {
  User,
  Role,
  RoomType,
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
};

export default models;
