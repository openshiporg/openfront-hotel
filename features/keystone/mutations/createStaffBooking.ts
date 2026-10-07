// Compatibility facade for existing staff-booking imports.
// Production callers should use the bookings slice directly.
export { default } from '../bookings/createStaffBooking';
export * from '../bookings/createStaffBooking';
