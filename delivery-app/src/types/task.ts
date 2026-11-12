export interface DriverTask {
  id: number;
  driverId: number;
  driverName: string | null;
  driverPhone: string;
  placeId: number;
  placeName: string;
  description: string | null;
  latitude: number | string;
  longitude: number | string;
  status: 'pending' | 'completed' | 'cancelled';
  revision: number;
  assignedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface TaskMapPayload {
  type: 'delivery:tasks-map';
  tasks: { id: number; placeName: string; latitude: number; longitude: number }[];
  selectedTaskId: number | null;
  focusRequest: number;
  locationFocusRequest?: number;
  currentLocation: { latitude: number; longitude: number } | null;
}

export interface DriverTaskMapProps {
  payload: TaskMapPayload;
  onSelectTask: (id: number) => void;
  onDestinationAction: (id: number, action: 'neshan' | 'share' | 'save') => void;
}
