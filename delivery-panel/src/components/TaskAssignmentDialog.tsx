import { CircleAlert, ClipboardList, FileText, LoaderCircle, MapPin, Truck, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

export interface TaskAssignmentSelection {
  driverId: number;
  placeId: number;
  assigned: boolean;
  revision?: number;
}

interface Props {
  selection: TaskAssignmentSelection;
  driverName: string;
  placeName: string;
  error: string;
  descriptionsAvailable: boolean;
  onConfirm: (description: string) => Promise<boolean>;
  onClose: () => void;
}

export function TaskAssignmentDialog({ selection, driverName, placeName, error, descriptionsAvailable, onConfirm, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const fieldId = useId();
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const creating = selection.assigned;

  useEffect(() => {
    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => { element.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setAttempted(false);
    try {
      if (await onConfirm(description.trim())) onClose();
      else setAttempted(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return <dialog ref={dialog} className={`task-dialog ${creating ? '' : 'task-dialog-cancel'}`} dir="rtl"
    aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy}
    onCancel={(event) => { event.preventDefault(); if (!submitting.current) onClose(); }}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled)');
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onPointerDown={(event) => {
      if (event.target !== event.currentTarget || submitting.current) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <form onSubmit={(event) => { void submit(event); }}>
      <header className="task-dialog-heading">
        <span className="task-dialog-icon">{creating ? <ClipboardList size={25} /> : <CircleAlert size={25} />}</span>
        <button type="button" className="task-dialog-close" disabled={busy} aria-label="بستن" onClick={onClose}><X size={19} /></button>
        <h2 id={titleId}>{creating ? 'ثبت وظیفهٔ جدید' : 'غیرفعال‌کردن وظیفه'}</h2>
        <p id={descriptionId}>{creating ? descriptionsAvailable ? 'جزئیات را بررسی کنید و در صورت نیاز، توضیحی برای پیک بنویسید.' : 'پیک و مقصد را بررسی کنید و ثبت وظیفه را تأیید کنید.' : 'آیا مطمئنید می‌خواهید این وظیفه را غیرفعال کنید؟'}</p>
      </header>
      <div className="task-dialog-body">
        <div className="task-dialog-details"><div><Truck size={17} /><span>پیک</span><b>{driverName}</b></div><div><MapPin size={17} /><span>مقصد</span><b>{placeName}</b></div></div>
        {creating ? <div className="task-dialog-field">
          <label htmlFor={fieldId}><FileText size={16} /> توضیحات وظیفه <span>اختیاری</span></label>
          <textarea id={fieldId} rows={5} maxLength={2000} value={description} disabled={busy || !descriptionsAvailable} autoFocus={descriptionsAvailable}
            onChange={(event) => setDescription(event.target.value)} placeholder="مثلاً: بسته را از نگهبانی دریافت کنید و قبل از رسیدن تماس بگیرید." />
          <div className="task-dialog-hint"><span>{descriptionsAvailable ? 'در گوشی پیک نمایش داده می‌شود؛ می‌توانید خالی بگذارید.' : 'ثبت توضیحات فعلاً در دسترس نیست؛ وظیفه بدون توضیحات ثبت می‌شود.'}</span><span dir="ltr">{description.length.toLocaleString('fa-IR')} / ۲۰۰۰</span></div>
        </div> : <p className="task-dialog-warning">این مقصد از وظایف فعال پیک حذف می‌شود. در صورت نیاز می‌توانید دوباره آن را تخصیص دهید.</p>}
        {attempted && <p className="task-dialog-error" role="alert">{error || 'ثبت تغییر ناموفق بود؛ دوباره تلاش کنید.'}</p>}
      </div>
      <footer className="task-dialog-actions">
        <button type="button" className="task-dialog-back" disabled={busy} autoFocus={!creating || !descriptionsAvailable} onClick={onClose}>{creating ? 'انصراف' : 'بازگشت'}</button>
        <button type="submit" className="task-dialog-confirm" disabled={busy}>{busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? 'در حال ثبت…' : creating ? 'ثبت وظیفه' : 'بله، غیرفعال شود'}</button>
      </footer>
    </form>
  </dialog>;
}
