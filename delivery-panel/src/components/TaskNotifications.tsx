import { Bell, CheckCheck, X } from 'lucide-react';
import { completionKey, type TaskCompletionNotice } from '../hooks/useTaskNotifications';
import { formatTaskTimestamp } from '../utils/taskTime';

export function TaskNotifications({ notices, onDismiss, onOpen, onClose }: {
  notices: TaskCompletionNotice[]; onDismiss: (notice: TaskCompletionNotice) => void;
  onOpen: (taskId: number) => void; onClose: () => void;
}) {
  return <aside className="task-notifications" aria-label="اعلان وظایف">
    <header><b><Bell size={16} /> اعلان وظایف</b><button type="button" onClick={onClose} aria-label="بستن اعلان‌ها"><X size={17} /></button></header>
    {!notices.length && <p className="task-notifications-empty">انجام‌شدن وظایف پیک‌ها در اینجا نمایش داده می‌شود.</p>}
    <div className="task-notifications-list" aria-live="polite">{notices.map(notice => <article key={completionKey(notice)}>
      <span className="task-notification-icon"><CheckCheck size={20} /></span>
      <button type="button" className="task-notification-content" onClick={() => onOpen(notice.id)}><b>وظیفه انجام شد</b><span>{notice.driverName || notice.driverPhone} وظیفهٔ «{notice.placeName}» را انجام داد.</span><time dateTime={notice.completedAt}>{formatTaskTimestamp(notice.completedAt)}</time></button>
      <button type="button" className="task-notification-dismiss" onClick={() => onDismiss(notice)} aria-label={`بستن اعلان ${notice.placeName}`}><X size={14} /></button>
    </article>)}</div>
  </aside>;
}
