// Compatibility facade for existing storefront-booking imports.
// Production callers should use the bookings slice directly.
export { default } from '../bookings/createStorefrontBooking';
export * from '../bookings/createStorefrontBooking';
