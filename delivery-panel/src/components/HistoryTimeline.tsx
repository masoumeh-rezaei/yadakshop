import { CalendarDays, Check, Clock3, History, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { scrollToMapSection } from '../utils/mapMotion';
import type { HistoryDay } from '../types';
import { FULL_DAY, formatHistoryDay, formatHistoryTime, historyDayDate, nearestHistoryHandle, resizeHistoryRange, type TimeRange } from '../utils/historyTime';

interface Props {
  driverName: string;
  days: HistoryDay[];
  selectedDay: string | null;
  range: TimeRange;
  rangeActive: boolean;
  loading: boolean;
  dayLoading: boolean;
  error: string;
  dayError: string;
  pointCount: number;
  onSelectDay: (date: string) => void;
  onRangeChange: (range: TimeRange) => void;
  onRangeCommit: (range: TimeRange) => void;
  onReset: () => void;
  onRetry: () => void;
  onClose: () => void;
}

const dayNumber = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', day: 'numeric' });
const monthYear = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', month: 'long', year: 'numeric' });
const weekday = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', weekday: 'short' });
const formatMonthYear = (date: Date) => {
  const parts = monthYear.formatToParts(date);
  return `${parts.find((part) => part.type === 'month')!.value} ${parts.find((part) => part.type === 'year')!.value}`;
};

export function HistoryTimeline(props: Props) {
  const { days, selectedDay, range, rangeActive, loading, dayLoading, error, dayError } = props;
  const panelRef = useRef<HTMLElement>(null);
  const startInput = useRef<HTMLInputElement>(null);
  const endInput = useRef<HTMLInputElement>(null);
  const latestRange = useRef(range);
  const onCommit = useRef(props.onRangeCommit);
  const interaction = useRef({ pointer: false, keyboard: false, dirty: false, timer: 0 });
  const drag = useRef<{ pointerId: number; handle: 0 | 1; left: number; width: number; offset: number } | null>(null);
  latestRange.current = range;
  onCommit.current = props.onRangeCommit;
  const cancelCommit = () => window.clearTimeout(interaction.current.timer);
  const commitRange = () => {
    cancelCommit();
    if (!interaction.current.dirty) return;
    interaction.current.dirty = false;
    onCommit.current([...latestRange.current]);
  };
  const settleRange = () => {
    cancelCommit();
    interaction.current.timer = window.setTimeout(commitRange, 250);
  };
  const previewRange = (next: TimeRange) => {
    if (next[0] === latestRange.current[0] && next[1] === latestRange.current[1]) return;
    latestRange.current = next;
    interaction.current.dirty = true;
    props.onRangeChange(next);
    // Accessibility/native changes without a pointer or keyboard gesture still settle.
    if (!interaction.current.pointer && !interaction.current.keyboard) settleRange();
  };
  const finishPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    interaction.current.pointer = false;
    commitRange();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const startPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (dayLoading || dayError || drag.current || !event.isPrimary || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    // Native thumb centers travel between 11px and width - 11px (22px thumbs).
    const left = bounds.left + 11;
    const width = bounds.width - 22;
    if (width <= 0) return;
    const minute = ((event.clientX - left) / width) * FULL_DAY[1];
    const handle = nearestHistoryHandle(latestRange.current, minute);
    event.preventDefault();
    cancelCommit();
    interaction.current.pointer = true;
    interaction.current.keyboard = false;
    (handle === 0 ? startInput : endInput).current?.focus({ preventScroll: true });
    const onThumb = Math.abs(minute - latestRange.current[handle]) * width / FULL_DAY[1] <= 11;
    const offset = onThumb ? minute - latestRange.current[handle] : 0;
    drag.current = { pointerId: event.pointerId, handle, left, width, offset };
    event.currentTarget.setPointerCapture(event.pointerId);
    previewRange(resizeHistoryRange(latestRange.current, handle, minute - offset));
  };
  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const minute = ((event.clientX - current.left) / current.width) * FULL_DAY[1] - current.offset;
    previewRange(resizeHistoryRange(latestRange.current, current.handle, minute));
  };
  const inputEvents = {
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
      cancelCommit();
      interaction.current.keyboard = true;
    },
    onKeyUp: () => {
      interaction.current.keyboard = false;
      if (interaction.current.dirty) settleRange();
    },
    onBlur: () => {
      interaction.current.keyboard = false;
      if (interaction.current.dirty && !interaction.current.pointer) settleRange();
    },
  };
  useEffect(() => {
    const current = interaction.current;
    current.pointer = false;
    current.keyboard = false;
    current.dirty = false;
    drag.current = null;
    return () => window.clearTimeout(current.timer);
  }, [selectedDay, dayLoading]);
  useEffect(() => {
    scrollToMapSection(panelRef.current);
  }, [props.driverName, selectedDay]);
  const startPercent = (range[0] / FULL_DAY[1]) * 100;
  const endPercent = (range[1] / FULL_DAY[1]) * 100;
  const disabled = dayLoading || Boolean(dayError);

  return <section ref={panelRef} className="history-timeline" aria-label="تاریخچه مسیر پیک" aria-busy={loading}>
    <div className="history-timeline-heading">
      <span className="history-timeline-icon"><History size={21} /></span>
      <div className="history-timeline-title">
        <h2>تاریخچه مسیر <span>· {props.driverName}</span></h2>
        <p>۱۰ روز آخر دارای موقعیت ثبت‌شده <span>• به وقت تهران</span></p>
      </div>
      <button type="button" className={`history-recent-button ${!rangeActive ? 'active' : ''}`} onClick={props.onReset}>
        <Clock3 size={15} /> ۲۴ ساعت گذشته
      </button>
      <button type="button" className="history-close" onClick={props.onClose} aria-label="بستن تاریخچه"><X size={18} /></button>
    </div>

    {error ? <div className="history-notice error" role="alert">
      <span>{error}</span><button type="button" onClick={props.onRetry}><RotateCcw size={14} /> تلاش مجدد</button>
    </div> : <>
      <div className="history-days" role="group" aria-label="روزهای دارای تاریخچه">
        {loading ? Array.from({ length: 10 }, (_, index) => <div key={index} className="history-day-skeleton" />)
          : days.map(({ date }) => {
            const day = historyDayDate(date);
            const selected = selectedDay === date;
            return <button type="button" key={date} className={`history-day ${selected ? 'selected' : ''}`}
              aria-pressed={selected} aria-label={formatHistoryDay(date)} onClick={() => props.onSelectDay(date)}>
              <span className="history-day-weekday">{weekday.format(day)}</span>
              <strong>{dayNumber.format(day)}</strong>
              <span className="history-day-month">{formatMonthYear(day)}</span>
              {selected && <Check className="history-day-check" size={12} />}
            </button>;
          })}
      </div>
      {!loading && !days.length && <div className="history-notice"><CalendarDays size={18} /> برای این پیک هنوز موقعیتی ثبت نشده است.</div>}

      {selectedDay && <div className="history-range-section">
        <div className="history-range-heading">
          <div><CalendarDays size={16} /><b>{formatHistoryDay(selectedDay)}</b></div>
          <span className="history-range-value"><span>از</span> <b dir="ltr">{formatHistoryTime(range[0])}</b> <span>تا</span> <b dir="ltr">{formatHistoryTime(range[1])}</b></span>
        </div>
        <div className={`history-range ${disabled ? 'disabled' : ''}`} dir="ltr"
          onPointerDown={startPointer} onPointerMove={movePointer}
          onPointerUp={finishPointer} onPointerCancel={finishPointer} onLostPointerCapture={finishPointer}>
          <div className="history-range-rail" aria-hidden="true">
            <div className="history-range-track" />
            <div className="history-range-selection" style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }} />
          </div>
          <input {...inputEvents} ref={startInput} type="range" min={FULL_DAY[0]} max={FULL_DAY[1]} step={1} value={range[0]} disabled={disabled}
            aria-valuemax={range[1] - 1}
            aria-label="ساعت شروع مسیر" aria-valuetext={`${formatHistoryTime(range[0])} به وقت تهران`}
            onChange={(event) => previewRange(resizeHistoryRange(latestRange.current, 0, Number(event.target.value)))} />
          <input {...inputEvents} ref={endInput} type="range" min={FULL_DAY[0]} max={FULL_DAY[1]} step={1} value={range[1]} disabled={disabled}
            aria-valuemin={range[0] + 1}
            aria-label="ساعت پایان مسیر" aria-valuetext={`${formatHistoryTime(range[1])} به وقت تهران`}
            onChange={(event) => previewRange(resizeHistoryRange(latestRange.current, 1, Number(event.target.value)))} />
        </div>
        <div className="history-range-ticks" dir="ltr">
          {[0, 360, 720, 1080, 1440].map((minute) => <span key={minute}>{formatHistoryTime(minute)}</span>)}
        </div>
        <div className="history-range-footer">
          {dayLoading ? <span role="status"><LoaderCircle className="animate-spin" size={14} /> در حال دریافت موقعیت‌های این روز…</span>
            : dayError ? <span role="alert" className="history-range-error">{dayError} <button type="button" onClick={() => props.onSelectDay(selectedDay)}>تلاش مجدد</button></span>
            : <span role="status">{props.pointCount ? 'مسیر بازهٔ انتخاب‌شده روی نقشه نمایش داده می‌شود.' : 'در این بازهٔ زمانی موقعیتی ثبت نشده است.'}</span>}
        </div>
      </div>}

      <div className="history-timeline-footer">
        <span className="history-gradient-legend"><i /> قدیمی‌تر <span>←</span> جدیدتر</span>
        <span aria-live="polite">{loading ? 'در حال دریافت تاریخچه…' : rangeActive && selectedDay
          ? `نمایش مسیر ${formatHistoryDay(selectedDay)}`
          : props.pointCount ? 'در حال نمایش مسیر ۲۴ ساعت گذشته' : 'در ۲۴ ساعت گذشته موقعیتی ثبت نشده است'}</span>
      </div>
    </>}
  </section>;
}
