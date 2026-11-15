import { Bell, CheckCheck, Play, Volume2, VolumeX, X } from 'lucide-react';
import { completionKey, type TaskCompletionNotice } from '../utils/taskCompletion';
import { formatTaskTimestamp } from '../utils/taskTime';

export function TaskNotifications({ notices, onDismiss, onOpen, onClose, permission, soundEnabled, soundReady, feedback, onEnable, onToggleSound, onTest }: {
  notices: TaskCompletionNotice[]; onDismiss: (notice: TaskCompletionNotice) => void;
  onOpen: (taskId: number) => void; onClose: () => void;
  permission: NotificationPermission | 'unsupported'; soundEnabled: boolean; soundReady: boolean; feedback: string;
  onEnable: () => Promise<void>; onToggleSound: () => Promise<void>; onTest: () => Promise<void>;
}) {
  return <aside className="task-notifications" aria-label="اعلان وظایف">
    <header><b><Bell size={16} /> اعلان وظایف</b><button type="button" onClick={onClose} aria-label="بستن اعلان‌ها"><X size={17} /></button></header>
    <div className="task-alert-settings">
      <p>با انجام وظیفه، نام پیک و مقصد همراه هشدار نمایش داده می‌شود؛ تب پنل را باز نگه دارید.</p>
      <div className="task-alert-controls">
        <button type="button" className={soundEnabled ? 'enabled' : ''} aria-pressed={soundEnabled}
          aria-label={soundEnabled ? 'بی‌صدا کردن اعلان‌ها' : 'فعال‌سازی صدای اعلان‌ها'} onClick={() => { void onToggleSound(); }}>
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}{soundEnabled ? 'صدا روشن' : 'صدا خاموش'}
        </button>
        <button type="button" onClick={() => { void onTest(); }}><Play size={15} /> آزمایش اعلان</button>
        {(permission === 'default' || (soundEnabled && !soundReady)) && <button type="button" className="enabled" onClick={() => { void onEnable(); }}>فعال‌سازی اعلان و صدا</button>}
      </div>
      {permission === 'denied' && <p className="task-alert-help">اعلان دسکتاپ مسدود است؛ در تنظیمات سایت مرورگر، Notifications را روی Allow بگذارید. صدای پنل جداگانه فعال می‌شود.</p>}
      {feedback && <p className="task-alert-feedback" role="status">{feedback}</p>}
    </div>
    {!notices.length && <p className="task-notifications-empty">انجام‌شدن وظایف پیک‌ها در اینجا نمایش داده می‌شود.</p>}
    <div className="task-notifications-list" aria-live="polite">{notices.map(notice => <article key={completionKey(notice)}>
      <span className="task-notification-icon"><CheckCheck size={20} /></span>
      <button type="button" className="task-notification-content" onClick={() => onOpen(notice.id)}><b>وظیفه انجام شد</b><span>{notice.driverName || notice.driverPhone} وظیفهٔ «{notice.placeName}» را انجام داد.</span><time dateTime={notice.completedAt}>{formatTaskTimestamp(notice.completedAt)}</time></button>
      <button type="button" className="task-notification-dismiss" onClick={() => onDismiss(notice)} aria-label={`بستن اعلان ${notice.placeName}`}><X size={14} /></button>
    </article>)}</div>
  </aside>;
}
