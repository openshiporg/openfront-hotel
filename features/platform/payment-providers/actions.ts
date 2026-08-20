'use server';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData } from '@/features/platform/lib/actionResult';

const PAYMENT_PROVIDERS = String.raw`
  query HotelPaymentProviders {
    hotelPaymentProviderOperations(propertyKey: "the-alder-house") {
      providers { id name code isInstalled configured }
    }
  }
`;

const CONFIGURE_PROVIDER = String.raw`
  mutation ConfigureHotelPaymentProvider($code:String!,$enabled:Boolean!,$credentials:HotelPaymentProviderCredentialsInput){
    configureHotelPaymentProvider(code:$code,enabled:$enabled,credentials:$credentials){
      id name code isInstalled configured
    }
  }
`;

export async function getPaymentProviderWorkspace() {
  const response = await keystoneClient<any>(PAYMENT_PROVIDERS);
  return requireActionData(response).hotelPaymentProviderOperations?.providers || [];
}

export async function configurePaymentProviderAction(input: {
  code: string;
  enabled: boolean;
  credentials?: Record<string, unknown>;
}) {
  if (!['pp_stripe_stripe', 'pp_paypal_paypal'].includes(input.code)) throw new Error('Unsupported payment provider.');
  const response = await keystoneClient<any>(CONFIGURE_PROVIDER, {
    code: input.code,
    enabled: Boolean(input.enabled),
    credentials: input.enabled ? input.credentials || {} : null,
  });
  return requireActionData(response).configureHotelPaymentProvider;
}
