'use client';

import React from 'react';
import { StayServiceDesk } from '@/features/platform/stay-service/components/StayServiceDesk';
import { HousekeepingDispatch } from '../components/HousekeepingDispatch';
import { RoomOutageControls } from '../components/RoomOutageControls';
import { 
  HousekeepingDashboard, 
  HousekeepingRoom, 
  HousekeepingTask, 
  StaffMember, 
  HousekeepingMetrics 
} from '@/features/platform/housekeeping/components/HousekeepingDashboard';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { useToast } from '@/components/ui/use-toast';
import { useSearchParams, useRouter } from 'next/navigation';
import { WorkspaceError, WorkspaceLoading } from '@/features/platform/components/WorkspaceControls';
import { getHousekeepingWorkspace, reportHousekeepingMaintenanceIssue, updateHousekeepingTaskAction } from '../actions';

export function HousekeepingPage() {
  const { toast } = useToast();
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
        floor: r.floor || 1,
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
      toast({
        title: 'Housekeeping workspace unavailable',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    try {
      await updateHousekeepingTaskAction(taskId, status);

      toast({
        title: 'Updated',
        description: `Task marked as ${status.replace('_', ' ')}`,
      });
      
      fetchData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update task status.',
        variant: 'destructive',
      });
    }
  };

  const handleReportIssue = async (roomId: string) => {
    try {
      const room = rooms.find((candidate) => candidate.id === roomId);
      await reportHousekeepingMaintenanceIssue(roomId);
      toast({
        title: 'Maintenance request created',
        description: `Room ${room?.roomNumber || ''} was escalated to maintenance.`,
      });
      await fetchData();
      router.push('/dashboard/platform/maintenance');
    } catch (error) {
      console.error('Failed to report maintenance issue:', error);
      toast({
        title: 'Error',
        description: 'Unable to escalate room to maintenance.',
        variant: 'destructive',
      });
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

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">Housekeeping</h1>
      <p className="text-muted-foreground">Live room status and task management</p>
    </div>
  );

  const breadcrumbs = [
    { type: 'page' as const, label: 'Dashboard', path: '/dashboard' },
    { type: 'page' as const, label: 'Housekeeping' },
  ];

  return (
    <PageContainer title="Housekeeping" header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-4 p-4 md:p-6">
        {error ? <WorkspaceError message={error} onRetry={fetchData} /> : null}
        {loading && !metrics ? <WorkspaceLoading label="Loading housekeeping readiness" /> : null}
        <StayServiceDesk rooms={rooms} staff={staff} />
        <RoomOutageControls rooms={rooms} />
        <HousekeepingDispatch tasks={tasks} staff={staff} onRefresh={fetchData} />
        {metrics && (
          <HousekeepingDashboard
            rooms={rooms}
            tasks={tasks}
            staff={staff}
            metrics={metrics}
            onUpdateTaskStatus={handleUpdateTaskStatus}
            onReportIssue={handleReportIssue}
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
      </div>
    </PageContainer>
  );
}
