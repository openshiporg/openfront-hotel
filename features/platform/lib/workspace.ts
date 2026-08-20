export type SortDirection = 'asc' | 'desc';

export interface WorkspaceViewOptions<T> {
  search?: string;
  status?: string;
  statusOf?: (item: T) => string | null | undefined;
  searchText: (item: T) => Array<unknown>;
  sortValue?: (item: T) => string | number | Date | null | undefined;
  direction?: SortDirection;
}

function searchable(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

/** Client-side view helper for already bounded, session-aware workspace projections. */
export function applyWorkspaceView<T>(items: readonly T[], options: WorkspaceViewOptions<T>): T[] {
  const query = searchable(options.search);
  const status = searchable(options.status);
  const filtered = items.filter((item) => {
    const matchesSearch = !query || options.searchText(item).some((value) => searchable(value).includes(query));
    const itemStatus = options.statusOf ? searchable(options.statusOf(item)) : '';
    const matchesStatus = !status || status === 'all' || itemStatus === status;
    return matchesSearch && matchesStatus;
  });

  if (!options.sortValue) return filtered;
  const direction = options.direction === 'asc' ? 1 : -1;
  return filtered.map((item, index) => ({ item, index })).sort((left, right) => {
    const a = left.item == null ? '' : options.sortValue?.(left.item);
    const b = right.item == null ? '' : options.sortValue?.(right.item);
    const aValue = a instanceof Date ? a.getTime() : a ?? '';
    const bValue = b instanceof Date ? b.getTime() : b ?? '';
    if (aValue === bValue) return left.index - right.index;
    return aValue < bValue ? -direction : direction;
  }).map(({ item }) => item);
}

export function workspaceResultLabel(visible: number, total: number, noun: string) {
  return visible === total ? `${total} ${noun}` : `${visible} of ${total} ${noun}`;
}
