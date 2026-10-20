import { safeActionMessage } from '@/features/platform/lib/safeGraphQLError';
import { getGuestWorkspace, type GuestListPage } from '../actions';
import { GuestsPageClient } from './GuestsPageClient';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || '';

/** Server-rendered guest list: the first paint already holds the page for the URL's view. */
export async function GuestsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  let data: GuestListPage | null = null;
  let error: string | null = null;
  try {
    data = await getGuestWorkspace({
      search: first(params.search).trim().slice(0, 160),
      segment: first(params.segment),
      sort: first(params.sort),
      page: Number(first(params.page)) || 1,
      pageSize: Number(first(params.pageSize)) || undefined,
    });
  } catch (cause) {
    error = safeActionMessage(cause, 'Guest profiles could not be loaded.');
  }
  return <GuestsPageClient data={data} error={error} />;
}

export default GuestsPage;
