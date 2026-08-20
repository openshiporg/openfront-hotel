-- Keep the generated Prisma contract aligned with the required hotel lifecycle
-- relations introduced in 20260718180000. Required relations must reject parent
-- deletion instead of attempting the former SET NULL action.

ALTER TABLE "SeasonalRate" ALTER COLUMN "roomType" SET NOT NULL;

ALTER TABLE "Room" DROP CONSTRAINT "Room_roomType_fkey";
ALTER TABLE "Room" ADD CONSTRAINT "Room_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RoomInventory" DROP CONSTRAINT "RoomInventory_roomType_fkey";
ALTER TABLE "RoomInventory" ADD CONSTRAINT "RoomInventory_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HousekeepingTask" DROP CONSTRAINT "HousekeepingTask_room_fkey";
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RoomAssignment" DROP CONSTRAINT "RoomAssignment_booking_fkey";
ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoomAssignment" DROP CONSTRAINT "RoomAssignment_roomType_fkey";
ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking" DROP CONSTRAINT "Booking_guestProfile_fkey";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_guestProfile_fkey" FOREIGN KEY ("guestProfile") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BookingPayment" DROP CONSTRAINT "BookingPayment_booking_fkey";
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingPayment" DROP CONSTRAINT "BookingPayment_paymentProvider_fkey";
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BookingPaymentSession" DROP CONSTRAINT "BookingPaymentSession_booking_fkey";
ALTER TABLE "BookingPaymentSession" ADD CONSTRAINT "BookingPaymentSession_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingPaymentSession" DROP CONSTRAINT "BookingPaymentSession_paymentProvider_fkey";
ALTER TABLE "BookingPaymentSession" ADD CONSTRAINT "BookingPaymentSession_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReservationLineItem" DROP CONSTRAINT "ReservationLineItem_reservation_fkey";
ALTER TABLE "ReservationLineItem" ADD CONSTRAINT "ReservationLineItem_reservation_fkey" FOREIGN KEY ("reservation") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RoomImage" DROP CONSTRAINT "RoomImage_roomType_fkey";
ALTER TABLE "RoomImage" ADD CONSTRAINT "RoomImage_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestDocument" DROP CONSTRAINT "GuestDocument_guest_fkey";
ALTER TABLE "GuestDocument" ADD CONSTRAINT "GuestDocument_guest_fkey" FOREIGN KEY ("guest") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LoyaltyTransaction" DROP CONSTRAINT "LoyaltyTransaction_guest_fkey";
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_guest_fkey" FOREIGN KEY ("guest") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RatePlan" DROP CONSTRAINT "RatePlan_roomType_fkey";
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SeasonalRate" DROP CONSTRAINT "SeasonalRate_roomType_fkey";
ALTER TABLE "SeasonalRate" ADD CONSTRAINT "SeasonalRate_roomType_fkey" FOREIGN KEY ("roomType") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaintenanceRequest" DROP CONSTRAINT "MaintenanceRequest_room_fkey";
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChannelReservation" DROP CONSTRAINT "ChannelReservation_channel_fkey";
ALTER TABLE "ChannelReservation" ADD CONSTRAINT "ChannelReservation_channel_fkey" FOREIGN KEY ("channel") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChannelSyncEvent" DROP CONSTRAINT "ChannelSyncEvent_channel_fkey";
ALTER TABLE "ChannelSyncEvent" ADD CONSTRAINT "ChannelSyncEvent_channel_fkey" FOREIGN KEY ("channel") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Folio" DROP CONSTRAINT "Folio_booking_fkey";
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FolioEntry" DROP CONSTRAINT "FolioEntry_folio_fkey";
ALTER TABLE "FolioEntry" ADD CONSTRAINT "FolioEntry_folio_fkey" FOREIGN KEY ("folio") REFERENCES "Folio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
