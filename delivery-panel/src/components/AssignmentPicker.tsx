import { Building2, Check, ClipboardList, LoaderCircle, Search, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DriverTask, SavedPlace, User } from '../types';
import { assignmentKey } from '../hooks/useTasks';

export interface AssignmentControls {
  tasks: DriverTask[];
  drivers: User[];
  places: SavedPlace[];
  loading: boolean;
  error: string;
  pending: ReadonlySet<string>;
  onAssign: (driverId: number, placeId: number, assigned: boolean) => void;
}

type Target = { kind: 'driver'; id: number } | { kind: 'place'; id: number };

export function AssignmentPicker({ target, controls }: { target: Target; controls: AssignmentControls }) {
  const [search, setSearch] = useState('');
  const byPair = useMemo(() => new Map(controls.tasks.map((task) => [assignmentKey(task.driverId, task.placeId), task])), [controls.tasks]);
  const isDriver = target.kind === 'driver';
  const choices = isDriver ? controls.places.map((place) => ({ id: place.id, name: place.name, active: true }))
    : controls.drivers.map((driver) => ({ id: driver.id, name: driver.fullName || driver.phone, active: driver.isActive === true || driver.isActive === 1 }));
  const filtered = choices.filter((choice) => choice.name.toLocaleLowerCase('fa-IR').includes(search.trim().toLocaleLowerCase('fa-IR')));
  const Icon = isDriver ? Building2 : Truck;

  return <div className="assignment-picker" aria-label={isDriver ? 'انتخاب مکان‌های پیک' : 'انتخاب پیک‌های مکان'}>
    <div className="assignment-picker-heading"><ClipboardList size={16} /><b>{isDriver ? 'مقصدهای این پیک' : 'پیک‌های این مکان'}</b></div>
    <p className="assignment-picker-description">{isDriver ? 'مکان را انتخاب کنید، سپس جزئیات وظیفه را تأیید کنید.' : 'پیک را انتخاب کنید، سپس جزئیات وظیفه را تأیید کنید.'}</p>
    {choices.length > 4 && <label className="assignment-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isDriver ? 'جست‌وجوی مکان' : 'جست‌وجوی پیک'} aria-label="جست‌وجوی گزینه‌های تخصیص" /></label>}
    {controls.error && <div className="assignment-error" role="alert">{controls.error}</div>}
    {controls.loading ? <div className="assignment-empty" role="status"><LoaderCircle className="animate-spin" size={17} /> در حال دریافت وظایف…</div>
      : <div className="assignment-options">{filtered.map((choice) => {
        const driverId = isDriver ? target.id : choice.id;
        const placeId = isDriver ? choice.id : target.id;
        const key = assignmentKey(driverId, placeId);
        const task = byPair.get(key);
        const checked = task?.status === 'pending';
        const busy = controls.pending.has(key);
        return <label key={choice.id} className={`assignment-option ${checked ? 'checked' : ''} ${busy ? 'busy' : ''}`}>
          <input type="checkbox" checked={checked} disabled={Boolean(controls.error) || busy || (!choice.active && !checked)} onChange={(event) => controls.onAssign(driverId, placeId, event.target.checked)} />
          <span className="assignment-option-icon"><Icon size={16} /></span>
          <span className="assignment-option-name"><b>{choice.name}</b><small>{!choice.active ? 'حساب غیرفعال' : task?.status === 'completed' ? 'قبلاً انجام‌شده؛ قابل تخصیص مجدد' : checked ? 'وظیفهٔ فعال' : isDriver ? 'مکان ذخیره‌شده' : 'پیک'}</small></span>
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : checked && <Check size={15} className="assignment-check" />}
        </label>;
      })}{!filtered.length && <p className="assignment-empty">{choices.length ? 'نتیجه‌ای پیدا نشد.' : isDriver ? 'هنوز مکانی ذخیره نشده است.' : 'هنوز پیکی ثبت نشده است.'}</p>}</div>}
    <div className="assignment-picker-footer">انتخاب‌ها پس از ثبت، در بخش «وظایف» گوشی پیک دیده می‌شوند.</div>
  </div>;
}
