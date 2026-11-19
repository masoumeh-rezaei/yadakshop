export type PushStatus = 'ready' | 'permission' | 'unavailable' | 'error' | 'unsupported';
export type PushStage = 'build' | 'permission' | 'channel' | 'device-token' | 'expo-token' | 'server' | 'local-test' | 'remote-test';
export interface PushResult { status: PushStatus; message: string; stage?: PushStage }

export class PushTimeout extends Error {
  constructor(readonly stage: PushStage) { super('Notification operation timed out'); }
}

export function pushOperation<T>(operation: () => Promise<T>, stage: PushStage, milliseconds: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: unknown, value?: T) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted);
      if (error) reject(error); else resolve(value as T);
    };
    const aborted = () => { const error = new Error('Cancelled'); error.name = 'AbortError'; finish(error); };
    const timer = setTimeout(() => finish(new PushTimeout(stage)), milliseconds);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) { aborted(); return; }
    Promise.resolve().then(() => { if (signal?.aborted) { const error = new Error('Cancelled'); error.name = 'AbortError'; throw error; } return operation(); }).then(value => finish(null, value), error => finish(error));
  });
}

/** Never expose native exception strings, tokens or provider request payloads in the UI. */
export function pushFailure(cause: unknown, stage: PushStage): PushResult {
  const error = cause as { status?: number; code?: string } | null;
  if (stage === 'server') {
    if (error?.status === 401) return { status: 'error', stage, message: 'نشست شما معتبر نیست؛ دوباره وارد حساب شوید.' };
    if (error?.status === 404 || error?.status === 503) return { status: 'error', stage, message: 'سرویس اعلان روی سرور آماده نیست؛ با مدیر سامانه تماس بگیرید.' };
    return { status: 'error', stage, message: 'ثبت گوشی روی سرور انجام نشد؛ اینترنت را بررسی و دوباره تلاش کنید.' };
  }
  if (stage === 'device-token') return { status: 'error', stage,
    message: cause instanceof PushTimeout ? 'دریافت شناسهٔ گوشی از Google/FCM بیش از حد طول کشید؛ اینترنت و Google Play services را بررسی کنید و دوباره بزنید.' : 'دریافت شناسهٔ اعلان از Google/FCM ناموفق بود؛ Google Play services و اتصال اینترنت گوشی را بررسی کنید.' };
  if (stage === 'expo-token') return { status: 'error', stage,
    message: 'اتصال گوشی به سرویس اعلان Expo انجام نشد؛ اینترنت گوشی را بررسی و دوباره تلاش کنید.' };
  return { status: 'error', stage, message: 'بررسی اعلان‌ها کامل نشد؛ دوباره تلاش کنید یا تنظیمات اعلان گوشی را باز کنید.' };
}
