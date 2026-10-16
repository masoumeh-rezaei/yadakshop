import { History, LoaderCircle, RotateCcw } from 'lucide-react';

export type HistoryActionStatus = 'idle' | 'loading' | 'empty' | 'error';
export type HistoryRequestResult = 'success' | 'empty' | 'error' | 'cancelled';

interface Props {
  status: HistoryActionStatus;
  onClick: () => void;
  variant?: 'popup' | 'list';
}

export function HistoryActionButton({ status, onClick, variant = 'popup' }: Props) {
  const label = status === 'loading' ? 'در حال بررسی تاریخچه…' :
    status === 'empty' ? 'برای ۲۴ ساعت گذشته تاریخچه‌ای وجود ندارد' :
      status === 'error' ? 'دریافت ناموفق بود؛ تلاش مجدد' : 'نمایش تاریخچه';
  const Icon = status === 'loading' ? LoaderCircle : status === 'error' ? RotateCcw : History;

  return <button type="button" className={`history-action-button ${variant} ${status}`}
    disabled={status === 'loading' || status === 'empty'} onClick={onClick}
    aria-live="polite" title={variant === 'list' && status === 'idle' ? 'نمایش تاریخچه ۲۴ ساعت گذشته' : undefined}>
    <Icon size={variant === 'list' ? 14 : 15} className={status === 'loading' ? 'spin' : ''} />
    <span>{label}</span>
  </button>;
}
