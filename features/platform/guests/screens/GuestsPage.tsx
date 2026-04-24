import { ListPage } from '@/features/dashboard/screens/ListPage';

export async function GuestsPage() {
  return (
    <ListPage
      params={Promise.resolve({ listKey: 'Guest' })}
      searchParams={Promise.resolve({})}
    />
  );
}

export default GuestsPage;
