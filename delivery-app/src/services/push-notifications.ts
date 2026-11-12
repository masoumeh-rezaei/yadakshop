/** Web has live task updates; native remote push is implemented by the .native module. */
export type PushStatus = 'ready' | 'permission' | 'unavailable' | 'error' | 'unsupported';
export async function registerTaskNotifications(_token: string, _requestPermission = false): Promise<PushStatus> { return 'unsupported'; }
export async function unregisterTaskNotifications(_token: string): Promise<void> {}
export function subscribeTaskNotifications(_refresh: () => void, _select: (taskId: number) => void, _tokenChanged?: () => void): () => void { return () => {}; }
