'use client';

import React from 'react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import {
  Bed,
  CheckCircle2,
  Clock,
  AlertCircle,
  Wrench,
  Sparkles,
  User,
  RefreshCw,
  Filter,
  ChevronRight,
  Play,
  Pause,
  Check,
  Flag,
  Loader2
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface HousekeepingRoom {
  id: string;
  roomNumber: string;
  floor: number;
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
  onUpdateTaskStatus?: (taskId: string, status: string) => void;
  onReportIssue?: (roomId: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
  selectedFloor?: string;
  onFloorChange?: (floor: string) => void;
  selectedStatus?: string;
  onStatusChange?: (status: string) => void;
  selectedStaff?: string;
  onStaffChange?: (staff: string) => void;
}

function getRoomStatusColor(status: string) {
  switch (status) {
    case 'vacant':
      return 'bg-green-500';
    case 'occupied':
      return 'bg-blue-500';
    case 'cleaning':
      return 'bg-yellow-500';
    case 'maintenance':
      return 'bg-orange-500';
    case 'out_of_order':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

function getRoomStatusBadge(status: string) {
  switch (status) {
    case 'vacant':
      return <Badge className="bg-green-100 text-green-700">Vacant</Badge>;
    case 'occupied':
      return <Badge className="bg-blue-100 text-blue-700">Occupied</Badge>;
    case 'cleaning':
      return <Badge className="bg-yellow-100 text-yellow-700">Cleaning</Badge>;
    case 'maintenance':
      return <Badge className="bg-orange-100 text-orange-700">Maintenance</Badge>;
    case 'out_of_order':
      return <Badge className="bg-red-100 text-red-700">Out of Order</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getTaskStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge className="bg-gray-100 text-gray-700">Pending</Badge>;
    case 'in_progress':
      return <Badge className="bg-blue-100 text-blue-700">In Progress</Badge>;
    case 'completed':
      return <Badge className="bg-green-100 text-green-700">Completed</Badge>;
    case 'inspection_needed':
      return <Badge className="bg-purple-100 text-purple-700">Inspection</Badge>;
    case 'on_hold':
      return <Badge className="bg-orange-100 text-orange-700">On Hold</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getTaskTypeLabel(type: string) {
  const labels: Record<string, string> = {
    checkout_clean: 'Checkout Clean',
    stayover_clean: 'Stayover Clean',
    deep_clean: 'Deep Clean',
    maintenance: 'Maintenance',
    inspection: 'Inspection',
    turn_down: 'Turn Down',
  };
  return labels[type] || type;
}

function getPriorityBadge(priority: number) {
  if (priority === 1) {
    return <Badge variant="destructive">Urgent</Badge>;
  } else if (priority === 2) {
    return <Badge className="bg-orange-100 text-orange-700">High</Badge>;
  }
  return null;
}

export function HousekeepingDashboard({
  rooms,
  tasks,
  staff,
  metrics,
  onAssignTask,
  onUpdateTaskStatus,
  onReportIssue,
  onRefresh,
  loading = false,
  selectedFloor = 'all',
  onFloorChange,
  selectedStatus = 'all',
  onStatusChange,
  selectedStaff = 'all',
  onStaffChange,
}: HousekeepingDashboardProps) {
  const floors = React.useMemo(() => {
    const uniqueFloors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
    return uniqueFloors;
  }, [rooms]);

  const filteredRooms = React.useMemo(() => {
    return rooms.filter((room) => {
      if (selectedFloor !== 'all' && room.floor !== parseInt(selectedFloor)) return false;
      if (selectedStatus !== 'all' && room.status !== selectedStatus) return false;
      return true;
    });
  }, [rooms, selectedFloor, selectedStatus]);

  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  const cleanlinessPercentage = metrics.totalRooms > 0 
    ? Math.round((metrics.cleanRooms / metrics.totalRooms) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header with Metrics */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Housekeeping Dashboard</h2>
          <p className="text-muted-foreground">Real-time room status and task management</p>
        </div>
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics.cleanRooms}</p>
                <p className="text-xs text-muted-foreground">Clean</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics.dirtyRooms}</p>
                <p className="text-xs text-muted-foreground">To Clean</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics.inProgress}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics.inspectionNeeded}</p>
                <p className="text-xs text-muted-foreground">Inspection</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <Wrench className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics.maintenance}</p>
                <p className="text-xs text-muted-foreground">Maintenance</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <Bed className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics.completedToday}</p>
                <p className="text-xs text-muted-foreground">Done Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Cleanliness</span>
            <span className="text-sm font-medium">{cleanlinessPercentage}%</span>
          </div>
          <Progress value={cleanlinessPercentage} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">
            {metrics.cleanRooms} of {metrics.totalRooms} rooms are clean and ready
          </p>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Room Grid / Floor Plan */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Room Status</CardTitle>
                <div className="flex gap-2">
                  <Select value={selectedFloor} onValueChange={onFloorChange}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Floor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Floors</SelectItem>
                      {floors.map((floor) => (
                        <SelectItem key={floor} value={String(floor)}>
                          Floor {floor}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedStatus} onValueChange={onStatusChange}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="vacant">Vacant</SelectItem>
                      <SelectItem value="occupied">Occupied</SelectItem>
                      <SelectItem value="cleaning">Cleaning</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {filteredRooms.map((room) => (
                  <button
                    key={room.id}
                    className={cn(
                      'relative p-2 rounded-lg border text-center transition-all hover:scale-105',
                      room.status === 'vacant' && 'bg-green-50 border-green-200 hover:bg-green-100',
                      room.status === 'occupied' && 'bg-blue-50 border-blue-200 hover:bg-blue-100',
                      room.status === 'cleaning' && 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100',
                      room.status === 'maintenance' && 'bg-orange-50 border-orange-200 hover:bg-orange-100',
                      room.status === 'out_of_order' && 'bg-red-50 border-red-200 hover:bg-red-100'
                    )}
                    onClick={() => onReportIssue?.(room.id)}
                  >
                    <div className={cn(
                      'absolute top-1 right-1 w-2 h-2 rounded-full',
                      getRoomStatusColor(room.status)
                    )} />
                    <p className="font-semibold text-sm">{room.roomNumber}</p>
                    {room.guestName && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {room.guestName.split(' ')[0]}
                      </p>
                    )}
                  </button>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-6 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-xs">Vacant</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-xs">Occupied</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span className="text-xs">Cleaning</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="text-xs">Maintenance</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-xs">Out of Order</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Staff Assignment */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Staff
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className={cn(
                    'p-3 rounded-lg border',
                    member.status === 'available' && 'bg-green-50 border-green-200',
                    member.status === 'busy' && 'bg-blue-50 border-blue-200',
                    member.status === 'break' && 'bg-yellow-50 border-yellow-200',
                    member.status === 'offline' && 'bg-gray-50 border-gray-200'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {member.assignedRooms} assigned • {member.completedToday} done
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {member.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Task Queue */}
      <Card>
        <CardHeader>
          <CardTitle>Task Queue</CardTitle>
          <CardDescription>Tasks sorted by priority and checkout time</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">
                Pending ({pendingTasks.length})
              </TabsTrigger>
              <TabsTrigger value="in_progress">
                In Progress ({inProgressTasks.length})
              </TabsTrigger>
              <TabsTrigger value="completed">
                Completed ({completedTasks.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-2 mt-4">
              {pendingTasks.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No pending tasks</p>
              ) : (
                pendingTasks.slice(0, 10).map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStart={() => onUpdateTaskStatus?.(task.id, 'in_progress')}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="in_progress" className="space-y-2 mt-4">
              {inProgressTasks.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No tasks in progress</p>
              ) : (
                inProgressTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={() => onUpdateTaskStatus?.(task.id, 'completed')}
                    onPause={() => onUpdateTaskStatus?.(task.id, 'on_hold')}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-2 mt-4">
              {completedTasks.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No completed tasks today</p>
              ) : (
                completedTasks.slice(0, 10).map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function TaskCard({ 
  task, 
  onStart, 
  onComplete, 
  onPause 
}: { 
  task: HousekeepingTask; 
  onStart?: () => void; 
  onComplete?: () => void;
  onPause?: () => void;
}) {
  const duration = task.startedAt && task.completedAt
    ? differenceInMinutes(parseISO(task.completedAt), parseISO(task.startedAt))
    : task.startedAt
    ? differenceInMinutes(new Date(), parseISO(task.startedAt))
    : null;

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="text-center min-w-[50px]">
          <p className="font-bold text-lg">{task.room.roomNumber}</p>
          <p className="text-xs text-muted-foreground">F{task.room.floor}</p>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{getTaskTypeLabel(task.taskType)}</p>
            {getTaskStatusBadge(task.status)}
            {getPriorityBadge(task.priority)}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {task.assignedTo && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {task.assignedTo.name}
              </span>
            )}
            {duration !== null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {duration} min
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        {task.status === 'pending' && onStart && (
          <Button size="sm" onClick={onStart}>
            <Play className="h-4 w-4 mr-1" />
            Start
          </Button>
        )}
        {task.status === 'in_progress' && (
          <>
            {onPause && (
              <Button size="sm" variant="outline" onClick={onPause}>
                <Pause className="h-4 w-4" />
              </Button>
            )}
            {onComplete && (
              <Button size="sm" onClick={onComplete}>
                <Check className="h-4 w-4 mr-1" />
                Done
              </Button>
            )}
          </>
        )}
        {task.status === 'completed' && task.completedAt && (
          <span className="text-xs text-muted-foreground">
            {format(parseISO(task.completedAt), 'h:mm a')}
          </span>
        )}
      </div>
    </div>
  );
}

export default HousekeepingDashboard;
