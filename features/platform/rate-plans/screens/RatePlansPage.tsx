import { ListPage } from '@/features/dashboard/screens/ListPage';

export async function RatePlansPage() {
  return (
    <ListPage
      params={Promise.resolve({ listKey: 'RatePlan' })}
      searchParams={Promise.resolve({})}
    />
  );
}

export default RatePlansPage;
