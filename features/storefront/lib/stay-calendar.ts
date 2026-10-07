/** Reservation dates are calendar labels, not instants in the browser's time zone. */
import { formatStayDate } from '@/lib/hotelCalendarDate';
export { formatStayDate } from '@/lib/hotelCalendarDate';
function text(value: unknown) { return String(value ?? '').replaceAll('\\', '\\\\').replace(/\r?\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,'); }
export function stayCalendar(booking: { id: string; confirmationNumber: string; guestName: string; numberOfGuests: number; checkInDate: string; checkOutDate: string }, identity: { name: string; address: { line1: string; line2: string } }, now = new Date()) {
  const day = (value: string) => { formatStayDate(value); return value.slice(0, 10).replaceAll('-', ''); };
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return ['BEGIN:VCALENDAR','VERSION:2.0',`PRODID:-//${text(identity.name)}//Reservation//EN`, 'BEGIN:VEVENT',`UID:hotel-booking-${text(booking.id)}`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${day(booking.checkInDate)}`,`DTEND;VALUE=DATE:${day(booking.checkOutDate)}`,`SUMMARY:${text(identity.name)} stay - ${text(booking.confirmationNumber)}`,`DESCRIPTION:${text(`Reservation for ${booking.guestName}. Confirmation: ${booking.confirmationNumber}. Guests: ${booking.numberOfGuests}. Check arrival hours with the property.`)}`,`LOCATION:${text([identity.address.line1, identity.address.line2].filter(Boolean).join(', '))}`, 'STATUS:CONFIRMED','END:VEVENT','END:VCALENDAR',''].join('\r\n');
}
