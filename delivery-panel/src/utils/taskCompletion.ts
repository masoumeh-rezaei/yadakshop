export interface TaskCompletionNotice {
  id: number; revision: number; driverName: string | null; driverPhone: string;
  placeName: string; completedAt: string;
}
export const completionKey = (notice: Pick<TaskCompletionNotice, 'id' | 'revision'>) => `${notice.id}:${notice.revision}`;
export function readCompletionNotice(value: unknown): TaskCompletionNotice | null {
  const task = value as Partial<TaskCompletionNotice> | null;
  return task && Number.isSafeInteger(task.id) && Number(task.id) > 0 && Number.isSafeInteger(task.revision) && Number(task.revision) > 0
    && typeof task.placeName === 'string' && typeof task.driverPhone === 'string'
    && (typeof task.driverName === 'string' || task.driverName === null)
    && typeof task.completedAt === 'string' && Number.isFinite(Date.parse(task.completedAt))
    ? task as TaskCompletionNotice : null;
}
