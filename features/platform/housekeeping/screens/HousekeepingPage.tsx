'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StayServiceDesk } from '@/features/platform/stay-service/components/StayServiceDesk';
import { HousekeepingDispatch } from '../components/HousekeepingDispatch';
import { RoomOutageControls } from '../components/RoomOutageControls';
import StaffCapabilityEditor from '../components/StaffCapabilityEditor';
import { 
  HousekeepingDashboard, 
  HousekeepingRoom, 
  HousekeepingTask, 
  StaffMember, 
  HousekeepingMetrics 
} from '@/features/platform/housekeeping/components/HousekeepingDashboard';
import { toast } from 'sonner';
import { useSearchParams, useRouter } from 'next/navigation';
import { PlatformPage } from '@/features/platform/components/PlatformPage';
import { Panel, PanelHeader } from '@/features/platform/components/Surface';
import { WorkspaceTabs, WorkspaceTabsContent, WorkspaceTabsList, WorkspaceTabsTrigger } from '@/features/platform/components/Tabs';
import { WorkspaceError, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { scheduleHousekeepingTaskAction, getHousekeepingWorkspace, reportHousekeepingMaintenanceIssue, updateHousekeepingTaskAction } from '../actions';
import { unwrapAction } from '@/features/platform/lib/actionOutcome';
import { operationAttempt } from '@/lib/operationAttempt';

export function HousekeepingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rooms, setRooms] = React.useState<HousekeepingRoom[]>([]);
  const [tasks, setTasks] = React.useState<HousekeepingTask[]>([]);
  const [staff, setStaff] = React.useState<StaffMember[]>([]);
  const [metrics, setMetrics] = React.useState<HousekeepingMetrics | null>(null);

  const selectedFloor = searchParams?.get('floor') || 'all';
  const selectedStatus = searchParams?.get('status') || 'all';
  const selectedStaff = searchParams?.get('staff') || 'all';

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: any = await getHousekeepingWorkspace();

      const mappedRooms: HousekeepingRoom[] = (data.rooms || []).map((r: any) => ({
        id: r.id,
        roomNumber: r.roomNumber,
        floor: r.floor === null || r.floor === undefined || r.floor === '' ? null : Number(r.floor),
        status: r.status as any,
        roomType: r.roomType?.name,
      }));

      const mappedTasks: HousekeepingTask[] = (data.tasks || []).map((t: any) => ({
        id: t.id,
        room: {
          id: t.room?.id,
          roomNumber: t.room?.roomNumber,
          floor: t.room?.floor,
          status: t.room?.status,
        },
        taskType: t.taskType,
        status: t.status as any,
        priority: t.priority,
        assignedTo: t.assignedTo,
        startedAt: t.startedAt,
        completedAt: t.completedAt,
        updatedAt: t.updatedAt,
        notes: t.notes,
      }));

      const mappedStaff: StaffMember[] = (data.assignees || []).map((u: any) => {
        const activeAssigned = mappedTasks.filter(t => t.assignedTo?.id === u.id && t.status !== 'completed').length;
        return {
          id: u.id,
          name: u.name,
          assignedRooms: activeAssigned,
          completedToday: mappedTasks.filter(t => t.assignedTo?.id === u.id && t.status === 'completed').length,
          status: activeAssigned > 0 ? 'busy' : 'available',
        };
      });

      const cleanRooms = mappedRooms.filter(r => r.status === 'vacant').length;
      const metrics: HousekeepingMetrics = {
        totalRooms: mappedRooms.length,
        cleanRooms,
        dirtyRooms: mappedRooms.filter(r => r.status === 'cleaning').length,
        inProgress: mappedTasks.filter(t => t.status === 'in_progress').length,
        inspectionNeeded: mappedTasks.filter(t => t.status === 'inspection_needed').length,
        maintenance: mappedRooms.filter(r => r.status === 'maintenance').length,
        averageCleanTime: Number(data.metrics?.averageCleanMinutes || 0),
        completedToday: Number(data.metrics?.completedToday || 0),
        pendingTasks: mappedTasks.filter(t => t.status === 'pending').length,
      };

      setRooms(mappedRooms);
      setTasks(mappedTasks);
      setStaff(mappedStaff);
      setMetrics(metrics);
    } catch (error) {
      console.error('Failed to load housekeeping data:', error);
      const message = error instanceof Error ? error.message : 'Unable to load housekeeping data.';
      setError(message);
      toast.error('Housekeeping workspace unavailable', { description: message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpdateTaskStatus = async (taskId: string, status: string, notes?: string) => {
    try {
      unwrapAction(await updateHousekeepingTaskAction(taskId, status, notes ? { notes } : undefined));

      toast.success('Task updated', { description: `Task marked ${status.replaceAll('_', ' ')}.` });
      
      fetchData();
    } catch (error) {
      toast.error('Task not updated', { description: error instanceof Error && error.message ? error.message : 'The task transition was not accepted. Refresh and retry.' });
    }
  };

  const handleScheduleTask = async (roomId: string, taskType: 'deep_clean' | 'turn_down') => {
    const label = taskType === 'deep_clean' ? 'Deep clean' : 'Turn-down';
    try {
      const request = { roomId, taskType };
      const attempt = await operationAttempt('housekeeping-schedule', request);
      unwrapAction(await scheduleHousekeepingTaskAction({ ...request, idempotencyKey: attempt.key }));
      attempt.complete();
      toast.success(`${label} scheduled`, { description: `Room ${rooms.find((room) => room.id === roomId)?.roomNumber || ''} is in the pending queue.` });
      await fetchData();
    } catch (error) {
      toast.error(`${label} not scheduled`, { description: error instanceof Error ? error.message : 'The task could not be created.' });
    }
  };

  const handleReportIssue = async (roomId: string) => {
    try {
      const room = rooms.find((candidate) => candidate.id === roomId);
      unwrapAction(await reportHousekeepingMaintenanceIssue(roomId));
      toast.success('Maintenance request created', { description: `Room ${room?.roomNumber || ''} was escalated to maintenance.` });
      await fetchData();
      router.push('/dashboard/platform/maintenance');
    } catch (error) {
      console.error('Failed to report maintenance issue:', error);
      toast.error('Room not escalated', { description: error instanceof Error && error.message ? error.message : 'Unable to escalate room to maintenance.' });
    }
  };

  const updateSearchParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <PlatformPage
      title="Housekeeping"
      description="Live room readiness, the cleaning and inspection queue, and the team working it."
      actions={(
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" />Refresh
        </Button>
      )}
    >
      {error ? <WorkspaceError message={error} onRetry={fetchData} title="Housekeeping workspace unavailable" /> : null}
      {loading && !metrics ? <WorkspaceLoading label="Loading housekeeping readiness" rows={6} /> : null}
      {metrics && (
        <HousekeepingDashboard
          rooms={rooms}
          tasks={tasks}
          staff={staff}
          metrics={metrics}
          onUpdateTaskStatus={handleUpdateTaskStatus}
          onReportIssue={handleReportIssue}
          onScheduleTask={handleScheduleTask}
          onRefresh={fetchData}
          loading={loading}
          selectedFloor={selectedFloor}
          onFloorChange={(floor) => updateSearchParam('floor', floor)}
          selectedStatus={selectedStatus}
          onStatusChange={(status) => updateSearchParam('status', status)}
          selectedStaff={selectedStaff}
          onStaffChange={(staff) => updateSearchParam('staff', staff)}
        />
      )}

      <Panel>
        <PanelHeader title="Operations tools" description="Dispatch with offline sync, planned outages, guest service cases and staff dispatch rules." />
        <WorkspaceTabs defaultValue="dispatch">
          <WorkspaceTabsList className="pt-1">
            <WorkspaceTabsTrigger value="dispatch">Dispatch & sync</WorkspaceTabsTrigger>
            <WorkspaceTabsTrigger value="outages">Room outages</WorkspaceTabsTrigger>
            <WorkspaceTabsTrigger value="services">Guest services</WorkspaceTabsTrigger>
            <WorkspaceTabsTrigger value="skills">Staff skills</WorkspaceTabsTrigger>
          </WorkspaceTabsList>
          <WorkspaceTabsContent value="dispatch" className="p-4 sm:p-5"><HousekeepingDispatch tasks={tasks} staff={staff} onRefresh={fetchData} /></WorkspaceTabsContent>
          <WorkspaceTabsContent value="outages" className="p-4 sm:p-5"><RoomOutageControls rooms={rooms} /></WorkspaceTabsContent>
          <WorkspaceTabsContent value="services" className="p-4 sm:p-5"><StayServiceDesk rooms={rooms} staff={staff} /></WorkspaceTabsContent>
          <WorkspaceTabsContent value="skills" className="p-4 sm:p-5"><StaffCapabilityEditor /></WorkspaceTabsContent>
        </WorkspaceTabs>
      </Panel>
    </PlatformPage>
  );
}
