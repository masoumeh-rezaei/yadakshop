/** Web has live task updates; native remote push is implemented by the .native module. */
import type { PushResult } from './push-state';
export type { PushStatus, PushResult } from './push-state';
export async function registerTaskNotifications(_token: string, _requestPermission = false, _signal?: AbortSignal): Promise<PushResult> { return { status: 'unsupported', message: 'اعلان گوشی در نسخهٔ وب در دسترس نیست.' }; }
export async function testLocalTaskNotification(): Promise<PushResult> { return { status: 'unsupported', message: 'آزمایش اعلان گوشی در نسخهٔ وب در دسترس نیست.' }; }
export async function testRemoteTaskNotification(_token: string): Promise<PushResult> { return { status: 'unsupported', message: 'آزمایش اعلان گوشی در نسخهٔ وب در دسترس نیست.' }; }
export async function openTaskNotificationSettings(): Promise<void> {}
export async function unregisterTaskNotifications(_token: string): Promise<void> {}
export function subscribeTaskNotifications(_refresh: () => void, _select: (taskId: number) => void, _tokenChanged?: () => void): () => void { return () => {}; }
