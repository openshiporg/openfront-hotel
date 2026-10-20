'use client';

import * as React from 'react';
import { FileUp, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DataTable, TBody, Td, Th, THead, Tr } from '@/features/platform/components/DataTable';
import { Field, FieldInput, FieldTextarea, FormNote, NativeSelect } from '@/features/platform/components/Form';
import { Callout } from '@/features/platform/components/Surface';
import { pluralize } from '@/features/platform/lib/format';
import { parseRoomingCsv } from '../lib/roomingCsv';

type Allocation = { id: string; roomsHeld: number; roomsPickedUp: number; roomType: { name: string } };
type RoomingRow = ReturnType<typeof parseRoomingCsv>[number];

// Header row only: a template is a starting point, never a reservation to submit.
const TEMPLATE_HEADER = 'rowId,guestName,guestEmail,numberOfGuests,guestPhone,specialRequests';
const PREVIEW_ROWS = 8;

/**
 * Rooming-list intake for one group block: choose the held allocation, paste
 * or upload CSV, and see the parsed rooms before any reservation is created.
 */
export function RoomingListImport({
  groupId,
  allocations,
  disabled,
  onImport,
}: {
  groupId: string;
  allocations: Allocation[];
  disabled: boolean;
  onImport: (allocationId: string, rows: RoomingRow[], csv: string) => void;
}) {
  const [csv, setCsv] = React.useState('');
  const [allocationId, setAllocationId] = React.useState(allocations[0]?.id || '');
  const allocation = allocations.find((item) => item.id === allocationId);
  const remaining = allocation ? Math.max(0, allocation.roomsHeld - allocation.roomsPickedUp) : 0;

  const parsed = React.useMemo<{ rows: RoomingRow[]; error: string | null }>(() => {
    if (!csv.trim()) return { rows: [], error: null };
    try { return { rows: parseRoomingCsv(csv), error: null }; }
    catch (error) { return { rows: [], error: error instanceof Error ? error.message : 'Invalid rooming list.' }; }
  }, [csv]);
  const overCapacity = parsed.rows.length > remaining;

  return (
    <div className="space-y-4 rounded-lg border border-dashed p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold"><FileUp className="size-4 text-muted-foreground" aria-hidden="true" />Rooming list</p>
          <FormNote>One room per row with a stable row reference. The import is all-or-nothing — any row error saves no reservations.</FormNote>
        </div>
        <FormNote className="shrink-0 font-mono">rowId, guestName, guestEmail, numberOfGuests[, guestPhone, specialRequests]</FormNote>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Pick up from" htmlFor={`rooming-allocation-${groupId}`} hint={allocation ? `${pluralize(remaining, 'room')} still held for pickup.` : undefined}>
          <NativeSelect id={`rooming-allocation-${groupId}`} value={allocationId} onChange={(event) => setAllocationId(event.target.value)} disabled={allocations.length < 2}>
            {allocations.map((item) => <option key={item.id} value={item.id}>{item.roomType.name} · {item.roomsPickedUp}/{item.roomsHeld} picked up</option>)}
          </NativeSelect>
        </Field>
        <Field label="CSV file" htmlFor={`rooming-file-${groupId}`} optional hint="Replaces the text below.">
          <FieldInput id={`rooming-file-${groupId}`} type="file" accept=".csv,text/csv" className="text-sm file:mr-3 file:text-sm file:font-medium" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setCsv(await file.text()); }} />
        </Field>
      </div>

      <Field label="Rooming-list CSV" htmlFor={`rooming-csv-${groupId}`}>
        <FieldTextarea id={`rooming-csv-${groupId}`} spellCheck={false} className="min-h-32 font-mono text-xs" placeholder={TEMPLATE_HEADER} value={csv} onChange={(event) => setCsv(event.target.value)} />
      </Field>
      {!csv.trim() ? <Button type="button" size="sm" variant="ghost" onClick={() => setCsv(`${TEMPLATE_HEADER}\n`)}>Start with the column headings</Button> : null}

      {parsed.error ? (
        <Callout tone="danger" title="This list can't be imported yet">{parsed.error}</Callout>
      ) : parsed.rows.length ? (
        <div className="overflow-hidden rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2 text-xs">
            <span className="font-medium">{pluralize(parsed.rows.length, 'room')} parsed</span>
            {overCapacity
              ? <span className="font-medium text-amber-700 dark:text-amber-400">More rows than the {pluralize(remaining, 'room')} still held; the whole import may be refused</span>
              : <span className="text-muted-foreground">{pluralize(remaining - parsed.rows.length, 'room')} will remain held</span>}
          </div>
          <DataTable minWidth="min-w-[520px]">
            <THead>
              <tr><Th>Row</Th><Th>Guest</Th><Th align="right">Guests</Th></tr>
            </THead>
            <TBody>
              {parsed.rows.slice(0, PREVIEW_ROWS).map((row) => (
                <Tr key={row.rowId}>
                  <Td className="font-mono text-xs text-muted-foreground">{row.rowId}</Td>
                  <Td><p className="font-medium">{row.guestName || '—'}</p><p className="text-xs text-muted-foreground">{row.guestEmail || 'No email'}</p></Td>
                  <Td numeric align="right">{Number.isFinite(row.numberOfGuests) ? row.numberOfGuests : '—'}</Td>
                </Tr>
              ))}
            </TBody>
          </DataTable>
          {parsed.rows.length > PREVIEW_ROWS ? <p className="border-t px-4 py-2 text-xs text-muted-foreground">+ {pluralize(parsed.rows.length - PREVIEW_ROWS, 'more row')}</p> : null}
        </div>
      ) : null}

      <Button size="sm" disabled={disabled || !allocationId || !parsed.rows.length || Boolean(parsed.error)} onClick={() => onImport(allocationId, parsed.rows, csv)}>
        <Users aria-hidden="true" />Create {parsed.rows.length ? pluralize(parsed.rows.length, 'reservation') : 'reservations'} from held rooms
      </Button>
    </div>
  );
}
