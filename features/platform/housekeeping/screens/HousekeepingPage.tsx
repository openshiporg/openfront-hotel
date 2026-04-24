'use client';

import React from 'react';
import { request } from 'graphql-request';
import { 
  HousekeepingDashboard, 
  HousekeepingRoom, 
  HousekeepingTask, 
  StaffMember, 
  HousekeepingMetrics 
} from '@/features/platform/housekeeping/components/HousekeepingDashboard';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { useToast } from '@/components/ui/use-toast';
import { GET_HOUSEKEEPING_DATA, UPDATE_HOUSEKEEPING_TASK, UPDATE_ROOM_STATUS } from '@/features/platform/housekeeping/queries';
import { useSearchParams, useRouter } from 'next/navigation';

export function HousekeepingPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [rooms, setRooms] = React.useState<HousekeepingRoom[]>([]);
  const [tasks, setTasks] = React.useState<HousekeepingTask[]>([]);
  const [staff, setStaff] = React.useState<StaffMember[]>([]);
  const [metrics, setMetrics] = React.useState<HousekeepingMetrics | null>(null);

  const selectedFloor = searchParams?.get('floor') || 'all';
  const selectedStatus = searchParams?.get('status') || 'all';
  const selectedStaff = searchParams?.get('staff') || 'all';

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/api/graphql';
      const data: any = await request(endpoint, GET_HOUSEKEEPING_DATA);

      const mappedRooms: HousekeepingRoom[] = (data.rooms || []).map((r: any) => ({
        id: r.id,
        roomNumber: r.roomNumber,
        floor: r.floor || 1,
        status: r.status as any,
        roomType: r.roomType?.name,
      }));

      const mappedTasks: HousekeepingTask[] = (data.housekeepingTasks || []).map((t: any) => ({
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
        notes: t.notes,
      }));

      const mappedStaff: StaffMember[] = (data.users || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        assignedRooms: mappedTasks.filter(t => t.assignedTo?.id === u.id).length,
        completedToday: 0, // Would need a separate query for completed tasks today
        status: 'available',
      }));

      const cleanRooms = mappedRooms.filter(r => r.status === 'vacant').length;
      const metrics: HousekeepingMetrics = {
        totalRooms: mappedRooms.length,
        cleanRooms,
        dirtyRooms: mappedRooms.filter(r => r.status === 'cleaning').length,
        inProgress: mappedTasks.filter(t => t.status === 'in_progress').length,
        inspectionNeeded: mappedTasks.filter(t => t.status === 'inspection_needed').length,
        maintenance: mappedRooms.filter(r => r.status === 'maintenance').length,
        averageCleanTime: 25,
        completedToday: 0,
        pendingTasks: mappedTasks.filter(t => t.status === 'pending').length,
      };

      setRooms(mappedRooms);
      setTasks(mappedTasks);
      setStaff(mappedStaff);
      setMetrics(metrics);
    } catch (error) {
      console.error('Failed to load housekeeping data:', error);
      toast({
        title: 'Error',
        description: 'Unable to load housekeeping data.',
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
      const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/api/graphql';
      
      const updateData: any = { status };
      if (status === 'in_progress') updateData.startedAt = new Date().toISOString();
      if (status === 'completed') updateData.completedAt = new Date().toISOString();

      await request(endpoint, UPDATE_HOUSEKEEPING_TASK, {
        id: taskId,
        data: updateData
      });

      // If task is completed, we often want to update the room status too
      if (status === 'completed') {
        const task = tasks.find(t => t.id === taskId);
        if (task?.room?.id) {
          await request(endpoint, UPDATE_ROOM_STATUS, {
            id: task.room.id,
            status: 'vacant' // Assuming it becomes vacant/clean
          });
        }
      }

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

  const handleReportIssue = (roomId: string) => {
    router.push(`/dashboard/Room/${roomId}`);
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
      <div className="w-full p-4 md:p-6">
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
