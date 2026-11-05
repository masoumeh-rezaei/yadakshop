import { Building2, Check, CheckCheck, ClipboardList, Clock3, LoaderCircle, MapPin, RefreshCw, Search, Truck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DriverTask } from '../types';
import { assignmentKey } from '../hooks/useTasks';

interface Props {
  tasks: DriverTask[];
  loading: boolean;
  error: string;
  pending: ReadonlySet<string>;
  onRefresh: () => void;
  onComplete: (task: DriverTask) => void;
  onCancel: (task: DriverTask) => void;
  onShowPlace: (task: DriverTask) => void;
}

export function TasksPage(props: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const remaining = props.tasks.filter((task) => task.status === 'pending').length;
  const visible = useMemo(() => props.tasks.filter((task) => (filter === 'all' || task.status === filter) &&
    `${task.driverName || ''} ${task.driverPhone} ${task.placeName}`.toLocaleLowerCase('fa-IR').includes(search.trim().toLocaleLowerCase('fa-IR'))), [props.tasks, filter, search]);
  return <section className="tasks-page" aria-label="مدیریت وظایف">
    <div className="tasks-summary"><span className="tasks-summary-icon"><ClipboardList size={25} /></span><div><h2>وظایف پیک‌ها</h2><p>تخصیص‌ها را از روی پین پیک یا مکان روی نقشه مدیریت کنید.</p></div><b>{remaining.toLocaleString('fa-IR')} <small>در انتظار انجام</small></b></div>
    <div className="tasks-toolbar"><div className="task-filters" role="group" aria-label="وضعیت وظایف">{(['pending', 'completed', 'all'] as const).map((value) => <button type="button" key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'pending' ? 'در انتظار' : value === 'completed' ? 'انجام‌شده' : 'همه'}</button>)}</div>
      <label className="tasks-search"><Search size={17} /><input aria-label="جست‌وجوی وظایف" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجوی پیک یا مکان" /></label>
      <button type="button" className="tasks-refresh" onClick={props.onRefresh} aria-label="به‌روزرسانی وظایف"><RefreshCw size={17} /></button></div>
    {props.error && <div className="task-page-error" role="alert">{props.error}<button type="button" onClick={props.onRefresh}>تلاش مجدد</button></div>}
    {props.loading ? <div className="tasks-empty" role="status"><LoaderCircle className="animate-spin" /> در حال دریافت وظایف…</div>
      : !visible.length ? <div className="tasks-empty"><ClipboardList size={35} /><b>وظیفه‌ای برای نمایش نیست</b><p>روی پین یک مکان یا پیک کلیک کنید و انتخاب‌های موردنظر را ثبت کنید.</p></div>
      : <div className="tasks-grid">{visible.map((task) => {
        const done = task.status === 'completed';
        const busy = props.pending.has(assignmentKey(task.driverId, task.placeId));
        return <article key={task.id} className={`task-card ${done ? 'completed' : ''}`}>
          <div className="task-card-top"><span className="task-place-icon"><Building2 size={22} /></span><div><h3>{task.placeName}</h3><span className={`task-status ${done ? 'done' : ''}`}>{done ? <CheckCheck size={13} /> : <Clock3 size={13} />}{done ? 'انجام‌شده' : 'در انتظار انجام'}</span></div></div>
          <div className="task-driver"><Truck size={16} /><b>{task.driverName || 'پیک بدون نام'}</b><span dir="ltr">{task.driverPhone}</span></div>
          <div className="task-assigned-at">{done ? 'انجام: ' : 'تخصیص: '}{new Date(done ? task.completedAt || task.updatedAt : task.assignedAt).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          <div className="task-actions"><button type="button" onClick={() => props.onShowPlace(task)}><MapPin size={14} /> نمایش مکان</button>{!done && <><button type="button" className="task-complete" disabled={busy} onClick={() => props.onComplete(task)}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} انجام شد</button><button type="button" className="task-cancel" disabled={busy} aria-label={`لغو وظیفه ${task.placeName} برای ${task.driverName || task.driverPhone}`} onClick={() => props.onCancel(task)}><X size={14} /></button></>}</div>
        </article>;
      })}</div>}
  </section>;
}
