import { History, LoaderCircle, RotateCcw } from "lucide-react";

export type HistoryActionStatus = "idle" | "loading" | "empty" | "error";
export type HistoryRequestResult = "success" | "empty" | "error" | "cancelled";

interface Props {
  status: HistoryActionStatus;
  onClick: () => void;
  variant?: "popup" | "list";
}

export function HistoryActionButton({
  status,
  onClick,
  variant = "popup",
}: Props) {
  const label =
    status === "loading"
      ? "در حال بررسی تاریخچه…"
      : status === "empty"
        ? "هنوز تاریخچه‌ای ثبت نشده"
        : status === "error"
          ? "دریافت ناموفق بود؛ تلاش مجدد"
          : "نمایش تاریخچه";
  const Icon =
    status === "loading"
      ? LoaderCircle
      : status === "error"
        ? RotateCcw
        : History;

  return (
    <button
      type="button"
      className={`history-action-button inline-flex items-center justify-center gap-[5px] [border:0] rounded-[8px] font-sans font-bold [transition:background_.18s_ease,_box-shadow_.18s_ease,_transform_.18s_ease] [&.popup]:w-full [&.popup]:min-h-[36px] [&.popup]:mt-[9px] [&.popup]:p-[7px_10px] [&.popup]:text-[#fff] [&.popup]:[background:linear-gradient(135deg,_#2563eb,_#4f46e5)] [&.popup]:[box-shadow:0_4px_12px_rgba(37,99,235,.24)] [&.popup]:text-[10px] [&.list]:min-h-[30px] [&.list]:p-[6px_8px] [&.list]:text-[#1d4ed8] [&.list]:[background:#eff6ff] [&.list]:[border:1px_solid_#bfdbfe] [&.list]:text-[9px] [&.list]:whitespace-nowrap [&:hover:not(:disabled)]:[box-shadow:0_5px_12px_rgba(37,99,235,.2)] [&:hover:not(:disabled)]:[transform:translateY(-1px)] [&.loading.loading]:text-[#475569] [&.loading.loading]:[background:#f1f5f9] [&.loading.loading]:[border-color:#cbd5e1] [&.loading.loading]:[box-shadow:none] [&.loading.loading]:cursor-wait [&.empty.empty]:[grid-column:1_/_-1] [&.empty.empty]:text-[#92400e] [&.empty.empty]:[background:#fffbeb] [&.empty.empty]:[border:1px_solid_#fcd34d] [&.empty.empty]:[box-shadow:none] [&.empty.empty]:cursor-default [&.empty.empty]:whitespace-normal [&.error.error]:text-[#b91c1c] [&.error.error]:[background:#fef2f2] [&.error.error]:[border:1px_solid_#fca5a5] [&.error.error]:[box-shadow:none] [&.list.empty]:w-full [&.list.empty]:m-[2px_0] [&.list.empty]:p-[6px] [&_svg]:flex-none ${variant} ${status}`}
      disabled={status === "loading"}
      onClick={onClick}
      aria-live="polite"
      title={
        variant === "list" && status === "idle"
          ? "نمایش روزها و تاریخچه مسیر"
          : undefined
      }
    >
      <Icon
        size={variant === "list" ? 14 : 15}
        className={status === "loading" ? "animate-spin" : ""}
      />
      <span>{label}</span>
    </button>
  );
}
