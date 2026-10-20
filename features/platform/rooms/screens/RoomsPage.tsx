import { safeActionMessage } from '@/features/platform/lib/safeGraphQLError';
import { getRoomsWorkspace, type RoomListPage } from '../actions';
import { RoomsPageClient } from './RoomsPageClient';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || '';

/** Server-rendered room board: the first paint already holds the page for the URL's view. */
export async function RoomsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  let data: RoomListPage | null = null;
  let error: string | null = null;
  try {
    data = await getRoomsWorkspace({
      search: first(params.search).trim().slice(0, 120),
      status: first(params.status),
      sort: first(params.sort),
      page: Number(first(params.page)) || 1,
      pageSize: Number(first(params.pageSize)) || undefined,
    });
  } catch (cause) {
    error = safeActionMessage(cause, 'Rooms could not be loaded.');
  }
  return <RoomsPageClient data={data} error={error} />;
}

export default RoomsPage;
