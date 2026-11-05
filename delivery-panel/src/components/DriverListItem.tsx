import { Avatar } from "./ui/Avatar";
import type { DriverLocation, User } from "../types";
import {
  HistoryActionButton,
  type HistoryActionStatus,
} from "./HistoryActionButton";

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

export function DriverListItem({
  driver,
  location,
  selected,
  historyStatus,
  onSelect,
  onHistoryRequest,
  formatLocationTime,
  isOnline,
}: Props) {
  const displayName = driver.fullName || "بدون نام";

  return (
    <div
      className={`driver-item w-full grid grid-cols-[minmax(0,_1fr)_auto] items-center gap-[6px] p-[5px] bg-transparent [border:1px_solid_transparent] rounded-[10px] text-right [transition:background_.15s_ease,_border-color_.15s_ease] [&:hover]:[background:#f8fafc] [&.selected.selected]:[background:#edf9f6] [&.selected.selected]:[border-color:#c8eee4] ${selected ? "selected" : ""}`}
    >
      <button
        type="button"
        className="driver-item-main min-w-0 flex items-center gap-[9px] p-[5px_4px] bg-transparent [border:0] text-right"
        onClick={() => onSelect(driver.id)}
      >
        <Avatar>{displayName.slice(0, 1)}</Avatar>
        <span className="driver-info min-w-0 flex flex-1 flex-col gap-[5px] [&_b]:overflow-hidden [&_b]:text-[#293448] [&_b]:text-[11px] [&_b]:whitespace-nowrap [&_b]:text-ellipsis [&_small]:text-[#8a95a6] [&_small]:text-[9px]">
          <b>{displayName}</b>
          <small>
            {location
              ? formatLocationTime(location.recordedAt)
              : "موقعیتی ثبت نشده"}
          </small>
        </span>
        <span
          className={`presence w-[8px] h-[8px] rounded-[50%] [background:#b4bdc9] [&.online]:[background:#17a47e] [&.online]:[box-shadow:0_0_0_4px_rgba(23,164,126,.1)] ${location && isOnline(location.recordedAt) ? "online" : ""}`}
        />
      </button>
      <HistoryActionButton
        variant="list"
        status={historyStatus}
        onClick={() => onHistoryRequest(driver.id)}
      />
    </div>
  );
}
