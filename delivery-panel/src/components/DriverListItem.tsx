import type { DriverLocation, User } from '../types';
import { HistoryActionButton, type HistoryActionStatus } from './HistoryActionButton';

interface Props {
  driver: User;
  location?: DriverLocation;
  selected: boolean;
  historyStatus: HistoryActionStatus;
  onSelect: (id: number) => void;
  onHistoryRequest: (id: number) => void;
  formatLocationTime: (date: string) => string;
  isOnline: (date: string) => boolean;
}

export function DriverListItem({ driver, location, selected, historyStatus, onSelect,
  onHistoryRequest, formatLocationTime, isOnline }: Props) {
  const displayName = driver.fullName || 'بدون نام';

  return <div className={`driver-item ${selected ? 'selected' : ''}`}>
    <button type="button" className="driver-item-main" onClick={() => onSelect(driver.id)}>
      <span className="avatar">{displayName.slice(0, 1)}</span>
      <span className="driver-info">
        <b>{displayName}</b>
        <small>{location ? formatLocationTime(location.recordedAt) : 'موقعیتی ثبت نشده'}</small>
      </span>
      <span className={`presence ${location && isOnline(location.recordedAt) ? 'online' : ''}`} />
    </button>
    <HistoryActionButton variant="list" status={historyStatus}
      onClick={() => onHistoryRequest(driver.id)} />
  </div>;
}
