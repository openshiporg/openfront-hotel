import { ListPage } from '@/features/dashboard/screens/ListPage';

export async function RoomsPage() {
  return (
    <ListPage
      params={Promise.resolve({ listKey: 'Room' })}
      searchParams={Promise.resolve({})}
    />
  );
}

export default RoomsPage;
