import { useEffect, useRef, useState } from 'react';
import { TASK_MAP_URL } from '@/services/api';
import type { DriverTaskMapProps } from '@/types/task';

const mapUrl = TASK_MAP_URL;
const mapOrigin = new URL(mapUrl).origin;

export function DriverTaskMap({ payload, onSelectTask, onDestinationAction }: DriverTaskMapProps) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(payload);
  latest.current = payload;
  const select = useRef(onSelectTask);
  select.current = onSelectTask;
  const action = useRef(onDestinationAction);
  action.current = onDestinationAction;
  useEffect(() => { if (ready) iframe.current?.contentWindow?.postMessage(payload, mapOrigin); }, [payload, ready]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== mapOrigin || event.source !== iframe.current?.contentWindow) return;
      if (event.data?.type === 'delivery:task-map-ready') { setReady(true); setFailed(false); iframe.current?.contentWindow?.postMessage(latest.current, mapOrigin); }
      if (event.data?.type === 'delivery:task-selected' && latest.current.tasks.some((task) => task.id === event.data.id)) select.current(event.data.id);
      if (event.data?.type === 'delivery:task-action' && ['neshan', 'share', 'save'].includes(event.data.action)
        && latest.current.tasks.some(task => task.id === event.data.id)) action.current(event.data.id, event.data.action);
    };
    window.addEventListener('message', receive);
    const timeout = window.setTimeout(() => setFailed(true), 12_000);
    return () => { window.removeEventListener('message', receive); window.clearTimeout(timeout); };
  }, [attempt]);
  return <div style={{ position: 'relative', height: 310, borderRadius: 17, overflow: 'hidden', background: '#eaf1ed' }}>
    <iframe key={attempt} ref={iframe} src={mapUrl} title="نقشهٔ مقصدهای وظایف" style={{ width: '100%', height: '100%', border: 0 }} />
    {failed && !ready && <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center', background: '#f1f6f2ee', color: '#64748b', fontFamily: 'Tahoma, sans-serif', fontSize: 12, gap: 15 }}>
      <span>نقشه در دسترس نیست؛ اتصال اینترنت را بررسی کنید.</span><button type="button" style={{ border: 0, background: 'transparent', color: '#0f9475', cursor: 'pointer' }} onClick={() => { setReady(false); setFailed(false); setAttempt((value) => value + 1); }}>تلاش مجدد</button>
    </div>}
  </div>;
}
