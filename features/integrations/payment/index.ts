export const paymentProviderAdapters = {
  pp_stripe_stripe: () => import('./stripe'),
  pp_paypal_paypal: () => import('./paypal'),
} as const;
