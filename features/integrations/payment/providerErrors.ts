export class PaymentProviderCredentialRejectedError extends Error {
  constructor() {
    super('Payment provider rejected its configured credentials.');
    this.name = 'PaymentProviderCredentialRejectedError';
  }
}
