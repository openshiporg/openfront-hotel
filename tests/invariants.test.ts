import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('a rate with reservations, a role someone holds, and an account with history cannot be deleted', () => {
  for (const [file, guard] of [
    ['RatePlan', 'booking.count'],
    ['Role', 'user.count'],
    ['User', 'booking.count'],
  ]) {
    const model = source(`features/keystone/models/${file}.ts`);
    assert.match(model, /validateDelete/, `${file} has a delete guard`);
    assert.ok(model.includes(guard), `${file} counts ${guard}`);
  }
  assert.match(source('features/keystone/models/User.ts'), /delete your own account/);
});

test('a season cannot end before it starts', () => {
  assert.match(source('features/keystone/models/SeasonalRate.ts'), /end date can\\'t be before its start date/);
});

test('the database refuses wrong-signed payments, negative prices and backwards seasons', () => {
  const sql = source('migrations/20261107130000_hotel_money_sign_and_season_dates/migration.sql');
  for (const name of ['BookingPayment_amount_sign_check', 'Booking_amounts_nonnegative_check', 'RefundIntent_amount_check', 'RatePlan_baseRate_nonnegative_check', 'RoomAssignment_rate_nonnegative_check', 'SeasonalRate_dates_check']) {
    assert.ok(sql.includes(`"${name}"`), name);
  }
  assert.match(sql, /RAISE EXCEPTION/);
});
