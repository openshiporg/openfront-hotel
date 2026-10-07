interface HotelPricingInputs {
  securityDepositMinor?: number;
  depositPercent?: number;
  currencyCode: string;
  timeZone?: string;
  checkInTime?: string;
  taxRateBasisPoints: number;
  serviceFeeMinor: number;
}

export function haveHotelPricingInputsChanged(
  before: HotelPricingInputs | null | undefined,
  after: HotelPricingInputs,
) {
  return !before
    || before.securityDepositMinor !== after.securityDepositMinor
    || before.depositPercent !== after.depositPercent
    || before.timeZone !== after.timeZone
    || before.checkInTime !== after.checkInTime
    || before.currencyCode !== after.currencyCode
    || before.taxRateBasisPoints !== after.taxRateBasisPoints
    || before.serviceFeeMinor !== after.serviceFeeMinor;
}
