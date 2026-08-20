interface HotelPricingInputs {
  currencyCode: string;
  taxRateBasisPoints: number;
  serviceFeeMinor: number;
}

export function haveHotelPricingInputsChanged(
  before: HotelPricingInputs | null | undefined,
  after: HotelPricingInputs,
) {
  return !before
    || before.currencyCode !== after.currencyCode
    || before.taxRateBasisPoints !== after.taxRateBasisPoints
    || before.serviceFeeMinor !== after.serviceFeeMinor;
}
