'use client';

import React from 'react';
import { differenceInMinutes, parseISO } from 'date-fns';
import { Check, Clock3, Flag, Moon, Pause, Play, Sparkles, UserRound, Wrench } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { FilterTabs } from '@/features/platform/components/FilterTabs';
import { Meter, StatStrip } from '@/features/platform/components/Stats';
import { StatusPill } from '@/features/platform/components/StatusPill';
import { InitialsAvatar, Panel, PanelHeader, SectionLabel } from '@/features/platform/components/Surface';
import { WorkspaceEmpty, WorkspaceSelect } from '@/features/platform/components/WorkspaceControls';
import { formatTime, humanize } from '@/features/platform/lib/format';
import { statusMeta, TONE_DOT, TONE_SURFACE } from '@/features/platform/lib/status';
import { INSPECTION_CHECKLIST_NOTE, requiresInspectionChecklist } from '@/features/keystone/workforce/inspectionChecklist';

const floorKey = (floor: number | null) => (floor === null ? 'none' : String(floor));
const floorLabel = (floor: number | null) => (floor === null ? 'No floor set' : `Floor ${floor}`);
// Numbered floors in order, rooms without a floor last.
const compareFloors = (a: number | null, b: number | null) => (a === null ? 1 : b === null ? -1 : a - b);

export interface HousekeepingRoom {
  id: string;
  roomNumber: string;
  /** Null when the room has no floor recorded; 0 is a real ground floor. */
  floor: number | null;
  status: 'vacant' | 'occupied' | 'cleaning' | 'maintenance' | 'out_of_order';
  roomType?: string;
  guestName?: string;
  checkoutTime?: string;
  lastCleaned?: string;
}

export interface HousekeepingTask {
  id: string;
  room: HousekeepingRoom;
  taskType: string;
  status: 'pending' | 'in_progress' | 'completed' | 'inspection_needed' | 'on_hold';
  priority: number;
  assignedTo?: {
    id: string;
    name: string;
  };
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  notes?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  assignedRooms: number;
  completedToday: number;
  status: 'available' | 'busy' | 'break' | 'offline';
}

export interface HousekeepingMetrics {
  totalRooms: number;
  cleanRooms: number;
  dirtyRooms: number;
  inProgress: number;
  inspectionNeeded: number;
  maintenance: number;
  averageCleanTime: number;
  completedToday: number;
  pendingTasks: number;
}

interface HousekeepingDashboardProps {
  rooms: HousekeepingRoom[];
  tasks: HousekeepingTask[];
  staff: StaffMember[];
  metrics: HousekeepingMetrics;
  onAssignTask?: (taskId: string, staffId: string) => void;
  onUpdateTaskStatus?: (taskId: string, status: string, notes?: string) => void;
  onReportIssue?: (roomId: string) => void;
  onScheduleTask?: (roomId: string, taskType: 'deep_clean' | 'turn_down') => void;
  onRefresh?: () => void;
  loading?: boolean;
  selectedFloor?: string;
  onFloorChange?: (floor: string) => void;
  selectedStatus?: string;
  onStatusChange?: (status: string) => void;
  selectedStaff?: string;
  onStaffChange?: (staff: string) => void;
}

const TASK_TYPE_LABELS: Record<string, string> = {
  checkout_clean: 'Checkout clean',
  stayover_clean: 'Stayover clean',
  deep_clean: 'Deep clean',
  maintenance: 'Maintenance',
  inspection: 'Inspection',
  turn_down: 'Turn-down',
};

const ROOM_STATUSES = ['vacant', 'occupied', 'cleaning', 'maintenance', 'out_of_order'] as const;
const TASK_VIEWS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'inspection_needed', label: 'Inspection' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
] as const;

function taskTypeLabel(type: string) {
  return TASK_TYPE_LABELS[type] || humanize(type);
}

export function HousekeepingDashboard({
  rooms,
  tasks,
  staff,
  metrics,
  onUpdateTaskStatus,
  onReportIssue,
  onScheduleTask,
  loading = false,
  selectedFloor = 'all',
  onFloorChange,
  selectedStatus = 'all',
  onStatusChange,
  selectedStaff = 'all',
  onStaffChange,
}: HousekeepingDashboardProps) {
  const [taskView, setTaskView] = React.useState<string>('pending');

  const floors = React.useMemo(() => [...new Set(rooms.map((room) => room.floor))].sort(compareFloors), [rooms]);

  const floorRooms = React.useMemo(
    () => rooms.filter((room) => selectedFloor === 'all' || floorKey(room.floor) === selectedFloor),
    [rooms, selectedFloor],
  );
  const filteredRooms = React.useMemo(
    () => floorRooms.filter((room) => selectedStatus === 'all' || room.status === selectedStatus),
    [floorRooms, selectedStatus],
  );
  const roomsByFloor = React.useMemo(() => {
    const groups = new Map<number | null, HousekeepingRoom[]>();
    filteredRooms.forEach((room) => groups.set(room.floor, [...(groups.get(room.floor) || []), room]));
    return [...groups.entries()].sort(([a], [b]) => compareFloors(a, b)).map(([floor, list]) => ({
      floor,
      rooms: [...list].sort((a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true })),
    }));
  }, [filteredRooms]);

  const activeTaskByRoom = React.useMemo(() => {
    const map = new Map<string, HousekeepingTask>();
    tasks.filter((task) => task.status !== 'completed').forEach((task) => {
      const existing = map.get(task.room.id);
      if (!existing || task.priority < existing.priority) map.set(task.room.id, task);
    });
    return map;
  }, [tasks]);

  const staffTasks = selectedStaff === 'all' ? tasks : tasks.filter((task) => task.assignedTo?.id === selectedStaff);
  const tasksByView = (status: string) => staffTasks.filter((task) => task.status === status).sort((a, b) => a.priority - b.priority);
  const visibleTasks = tasksByView(taskView);
  const selectedStaffName = staff.find((member) => member.id === selectedStaff)?.name;

  const readyPercent = metrics.totalRooms > 0 ? Math.round((metrics.cleanRooms / metrics.totalRooms) * 100) : 0;
  const statusCount = (status: string) => floorRooms.filter((room) => room.status === status).length;

  return (
    <div className="min-w-0 space-y-6">
      <StatStrip
        loading={loading && !rooms.length}
        items={[
          { label: 'Vacant', value: metrics.cleanRooms, tone: 'success', hint: `${readyPercent}% of ${metrics.totalRooms} rooms`, onSelect: () => onStatusChange?.(selectedStatus === 'vacant' ? 'all' : 'vacant'), active: selectedStatus === 'vacant' },
          { label: 'Cleaning', value: metrics.dirtyRooms, tone: 'warning', hint: `${metrics.pendingTasks} tasks pending`, onSelect: () => onStatusChange?.(selectedStatus === 'cleaning' ? 'all' : 'cleaning'), active: selectedStatus === 'cleaning' },
          { label: 'In progress', value: metrics.inProgress, tone: 'progress', hint: 'Tasks being worked', onSelect: () => setTaskView('in_progress'), active: taskView === 'in_progress' },
          { label: 'Inspection', value: metrics.inspectionNeeded, tone: 'accent', hint: 'Awaiting sign-off', onSelect: () => setTaskView('inspection_needed'), active: taskView === 'inspection_needed' },
          { label: 'Maintenance', value: metrics.maintenance, tone: 'danger', hint: 'Rooms out of service', onSelect: () => onStatusChange?.(selectedStatus === 'maintenance' ? 'all' : 'maintenance'), active: selectedStatus === 'maintenance' },
          { label: 'Done today', value: metrics.completedToday, tone: 'neutral', hint: metrics.averageCleanTime ? `Avg ${Math.round(metrics.averageCleanTime)} min clean` : 'No timed cleans yet' },
        ]}
      />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel>
          <PanelHeader
            title="Room board"
            description={`${metrics.cleanRooms} of ${metrics.totalRooms} rooms vacant. Select a room for details or to escalate an issue.`}
            actions={(
              <WorkspaceSelect label="Filter rooms by floor" value={selectedFloor} onChange={(floor) => onFloorChange?.(floor)}>
                <option value="all">All floors</option>
                {floors.map((floor) => <option key={floorKey(floor)} value={floorKey(floor)}>{floorLabel(floor)}</option>)}
              </WorkspaceSelect>
            )}
          >
            <Meter value={metrics.cleanRooms} max={metrics.totalRooms} label="Vacant rooms" className="mt-3" />
          </PanelHeader>
          <div className="border-b px-4 sm:px-5">
            <FilterTabs
              label="Filter rooms by status"
              value={selectedStatus}
              onChange={(status) => onStatusChange?.(status)}
              tabs={[
                { value: 'all', label: 'All', count: floorRooms.length },
                ...ROOM_STATUSES.map((status) => ({ value: status, label: statusMeta('room', status).label, count: statusCount(status), tone: statusMeta('room', status).tone })),
              ]}
            />
          </div>
          {roomsByFloor.length === 0 ? (
            <WorkspaceEmpty
              compact
              title={rooms.length ? 'No rooms match this view' : 'No rooms configured'}
              description={rooms.length ? 'Choose another floor or status.' : 'Rooms appear here after property onboarding.'}
              onClear={rooms.length ? () => { onFloorChange?.('all'); onStatusChange?.('all'); } : undefined}
            />
          ) : (
            <div className="space-y-5 p-4 sm:p-5">
              {roomsByFloor.map(({ floor, rooms: list }) => (
                <div key={floorKey(floor)} className="space-y-2">
                  <SectionLabel>{floorLabel(floor)} <span className="normal-case tracking-normal text-muted-foreground/70">· {list.length}</span></SectionLabel>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-2">
                    {list.map((room) => {
                      const meta = statusMeta('room', room.status);
                      const task = activeTaskByRoom.get(room.id);
                      return (
                        <DropdownMenu key={room.id}>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={cn('relative flex min-h-[4.25rem] flex-col items-start justify-between rounded-md border px-2.5 py-2 text-left transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', TONE_SURFACE[meta.tone])}
                              aria-label={`Room ${room.roomNumber}, ${meta.label}${task ? `, ${taskTypeLabel(task.taskType)} ${statusMeta('task', task.status).label}` : ''}`}
                            >
                              <span className="flex w-full items-center justify-between gap-1">
                                <span className="text-sm font-semibold tabular-nums">{room.roomNumber}</span>
                                <span className={cn('size-1.5 rounded-full', TONE_DOT[meta.tone])} aria-hidden="true" />
                              </span>
                              <span className="w-full truncate text-[11px] opacity-80">{task ? taskTypeLabel(task.taskType) : meta.label}</span>
                              {task ? <span className={cn('absolute bottom-1.5 right-2 size-1.5 rounded-full', TONE_DOT[statusMeta('task', task.status).tone])} title={statusMeta('task', task.status).label} aria-hidden="true" /> : null}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-60 [&_svg]:size-4">
                            <DropdownMenuLabel className="space-y-1">
                              <span className="block">Room {room.roomNumber}</span>
                              <span className="block text-xs font-normal text-muted-foreground">{room.roomType || 'Room type not set'} · {floorLabel(room.floor)}</span>
                            </DropdownMenuLabel>
                            <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                              <StatusPill kind="room" value={room.status} />
                              {task ? <StatusPill kind="task" value={task.status} label={`${taskTypeLabel(task.taskType)} · ${statusMeta('task', task.status).label}`} /> : null}
                            </div>
                            {task?.assignedTo ? <p className="px-2 pb-2 text-xs text-muted-foreground">Assigned to {task.assignedTo.name}</p> : null}
                            <DropdownMenuSeparator />
                            {onScheduleTask ? <>
                              <DropdownMenuItem onSelect={() => onScheduleTask(room.id, 'deep_clean')}><Sparkles aria-hidden="true" />Schedule deep clean</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => onScheduleTask(room.id, 'turn_down')}><Moon aria-hidden="true" />Schedule turn-down</DropdownMenuItem>
                            </> : null}
                            {onReportIssue ? (
                              <DropdownMenuItem onSelect={() => onReportIssue(room.id)}><Wrench aria-hidden="true" />Report maintenance issue</DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="h-fit">
          <PanelHeader
            title="Team"
            description={selectedStaffName ? `Task queue filtered to ${selectedStaffName}.` : 'Select a person to filter the task queue.'}
            actions={selectedStaff !== 'all' ? <Button size="sm" variant="ghost" onClick={() => onStaffChange?.('all')}>Show all</Button> : null}
          />
          {staff.length ? (
            <ul className="divide-y">
              {staff.map((member) => {
                const active = selectedStaff === member.id;
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onStaffChange?.(active ? 'all' : member.id)}
                      className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5', active && 'bg-muted/60')}
                    >
                      <InitialsAvatar name={member.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{member.name}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">{member.assignedRooms} active · {member.completedToday} done</span>
                      </span>
                      <StatusPill tone={member.status === 'busy' ? 'progress' : member.status === 'available' ? 'success' : 'neutral'} label={humanize(member.status)} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <WorkspaceEmpty compact icon={UserRound} title="No housekeeping staff" description="People with housekeeping roles appear here." />
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Task queue"
          description="Highest priority first. Starting, pausing and completing tasks updates room readiness."
          actions={selectedStaffName ? <StatusPill tone="info" label={`Assigned to ${selectedStaffName}`} /> : null}
        />
        <div className="border-b px-4 sm:px-5">
          <FilterTabs
            label="Filter tasks by status"
            value={taskView}
            onChange={setTaskView}
            tabs={TASK_VIEWS.map((view) => ({ value: view.value, label: view.label, count: tasksByView(view.value).length }))}
          />
        </div>
        {visibleTasks.length === 0 ? (
          <WorkspaceEmpty compact icon={Sparkles} title={`No ${TASK_VIEWS.find((view) => view.value === taskView)?.label.toLowerCase()} tasks`} description={selectedStaffName ? `Nothing in this state for ${selectedStaffName}.` : 'The queue is clear for this state.'} />
        ) : (
          <ul className="divide-y">
            {visibleTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onStart={['pending', 'inspection_needed', 'on_hold'].includes(task.status) ? () => onUpdateTaskStatus?.(task.id, 'in_progress') : undefined}
                onPause={task.status === 'in_progress' ? () => onUpdateTaskStatus?.(task.id, 'on_hold') : undefined}
                onComplete={['in_progress', 'inspection_needed'].includes(task.status) ? (notes) => onUpdateTaskStatus?.(task.id, 'completed', notes) : undefined}
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function TaskRow({ task, onStart, onComplete, onPause }: { task: HousekeepingTask; onStart?: () => void; onComplete?: (notes?: string) => void; onPause?: () => void }) {
  const [checklistOpen, setChecklistOpen] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  const needsChecklist = requiresInspectionChecklist(task);
  const duration = task.startedAt && task.completedAt
    ? differenceInMinutes(parseISO(task.completedAt), parseISO(task.startedAt))
    : task.startedAt
      ? differenceInMinutes(new Date(), parseISO(task.startedAt))
      : null;
  const priority = task.priority === 1 ? 'urgent' : task.priority === 2 ? 'high' : null;

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="w-14 shrink-0 text-center">
          <p className="text-base font-semibold tabular-nums leading-5">{task.room.roomNumber}</p>
          <p className="text-[11px] text-muted-foreground">Floor {task.room.floor ?? '—'}</p>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{taskTypeLabel(task.taskType)}</p>
            <StatusPill kind="task" value={task.status} />
            {priority ? <StatusPill kind="priority" value={priority} /> : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><UserRound className="size-3" aria-hidden="true" />{task.assignedTo?.name || 'Unassigned'}</span>
            {duration !== null ? <span className="inline-flex items-center gap-1 tabular-nums"><Clock3 className="size-3" aria-hidden="true" />{duration} min</span> : null}
            {task.status === 'completed' && task.completedAt ? <span>Completed {formatTime(task.completedAt)}</span> : null}
            {task.notes ? <span className="max-w-md truncate" title={task.notes}><Flag className="mr-1 inline size-3" aria-hidden="true" />{task.notes}</span> : null}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-[4.5rem] sm:pl-0">
        {onStart ? <Button size="sm" variant={task.status === 'inspection_needed' ? 'outline' : 'default'} onClick={onStart}><Play aria-hidden="true" />{task.status === 'on_hold' ? 'Resume' : 'Start'}</Button> : null}
        {onPause ? <Button size="sm" variant="outline" onClick={onPause} aria-label={`Put room ${task.room.roomNumber} task on hold`}><Pause aria-hidden="true" />Hold</Button> : null}
        {onComplete ? <Button size="sm" onClick={() => { if (needsChecklist) { setChecked(false); setChecklistOpen(true); } else onComplete(); }}><Check aria-hidden="true" />{needsChecklist || task.status === 'inspection_needed' ? 'Pass inspection' : 'Done'}</Button> : null}
      </div>
      {onComplete && needsChecklist ? (
        <AlertDialog open={checklistOpen} onOpenChange={setChecklistOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Pass inspection for room {task.room.roomNumber}</AlertDialogTitle>
              <AlertDialogDescription>Confirm the checks for this room before completing its inspection.</AlertDialogDescription>
            </AlertDialogHeader>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={checked} onCheckedChange={(value) => setChecked(value === true)} className="mt-0.5" />
              Cleanliness, room safety and repairs checked
            </label>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={!checked} onClick={() => onComplete(INSPECTION_CHECKLIST_NOTE)}>Pass inspection</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </li>
  );
}

export default HousekeepingDashboard;
