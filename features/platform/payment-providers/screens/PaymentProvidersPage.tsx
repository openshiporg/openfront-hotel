import { ListPage } from '@/features/dashboard/screens/ListPage';

export async function PaymentProvidersPage() {
  return (
    <ListPage
      params={Promise.resolve({ listKey: 'PaymentProvider' })}
      searchParams={Promise.resolve({})}
    />
  );
}

export default PaymentProvidersPage;
