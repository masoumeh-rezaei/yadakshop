import type { ComponentProps } from "react";

const controlClasses =
  "w-full h-[50px] p-[0_14px] text-[#182033] [background:#fbfcfe] [border:1px_solid_#dfe4ec] rounded-[11px] outline-none [transition:.2s] focus:[border-color:#138c81] focus:[box-shadow:0_0_0_3px_rgba(19,140,129,.1)]";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${controlClasses} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select className={`${controlClasses} ${className}`} {...props} />;
}

export function Label({ className = "", ...props }: ComponentProps<"label">) {
  return (
    <label
      className={`block m-[0_0_8px] text-[#364152] text-[13px] font-bold ${className}`}
      {...props}
    />
  );
}
