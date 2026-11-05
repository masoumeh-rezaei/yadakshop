import { CalendarDays, Check, Clock3, History, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { scrollToMapSection } from '../utils/mapMotion';
import type { HistoryDay } from '../types';
import { formatHistoryDay, formatHistoryTime, historyDayDate, type TimeRange } from '../utils/historyTime';

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
  useEffect(() => {
    scrollToMapSection(panelRef.current);
  }, [props.driverName, selectedDay]);
  const startPercent = ((range[0] - 720) / 720) * 100;
  const endPercent = ((range[1] - 720) / 720) * 100;
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
        <div className={`history-range ${disabled ? 'disabled' : ''}`} dir="ltr">
          <div className="history-range-track" />
          <div className="history-range-selection" style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }} />
          <input type="range" min={720} max={1440} step={1} value={range[0]} disabled={disabled}
            aria-valuemax={range[1] - 1}
            aria-label="ساعت شروع مسیر" aria-valuetext={`${formatHistoryTime(range[0])} به وقت تهران`}
            onChange={(event) => props.onRangeChange([Math.min(Number(event.target.value), range[1] - 1), range[1]])} />
          <input type="range" min={720} max={1440} step={1} value={range[1]} disabled={disabled}
            aria-valuemin={range[0] + 1}
            aria-label="ساعت پایان مسیر" aria-valuetext={`${formatHistoryTime(range[1])} به وقت تهران`}
            onChange={(event) => props.onRangeChange([range[0], Math.max(Number(event.target.value), range[0] + 1)])} />
        </div>
        <div className="history-range-ticks" dir="ltr">
          {[720, 900, 1080, 1260, 1440].map((minute) => <span key={minute}>{formatHistoryTime(minute)}</span>)}
        </div>
        <div className="history-range-footer">
          {dayLoading ? <span role="status"><LoaderCircle className="animate-spin" size={14} /> در حال دریافت موقعیت‌های این روز…</span>
            : dayError ? <span role="alert" className="history-range-error">{dayError} <button type="button" onClick={() => props.onSelectDay(selectedDay)}>تلاش مجدد</button></span>
            : !rangeActive ? <span>با تغییر بازه، مسیر این روز روی نقشه نمایش داده می‌شود.</span>
            : <span role="status">{props.pointCount ? 'مسیر بازهٔ انتخاب‌شده روی نقشه نمایش داده می‌شود.' : 'در این بازهٔ زمانی موقعیتی ثبت نشده است.'}</span>}
          {!rangeActive && !disabled && <button type="button" className="history-apply" onClick={() => props.onRangeChange([...range])}>نمایش این بازه</button>}
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
