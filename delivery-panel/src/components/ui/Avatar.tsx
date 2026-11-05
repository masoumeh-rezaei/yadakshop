import type { ReactNode } from "react";
export function Avatar({ children }: { children: ReactNode }) {
  return (
    <span className="avatar flex-none w-[34px] h-[34px] inline-grid place-items-center text-[#fff] [background:linear-gradient(145deg,_#2f6983,_#193a5a)] rounded-[10px] text-[12px] font-extrabold">
      {children}
    </span>
  );
}
