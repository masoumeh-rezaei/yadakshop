import type { ComponentProps } from "react";

type Props = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "icon" | "text";
};
const variants = {
  primary:
    "primary-button min-h-[45px] inline-flex items-center justify-center gap-[9px] p-[0_18px] [border:0] rounded-[10px] font-bold text-[#fff] [background:#0f766e] [box-shadow:0_7px_20px_rgba(15,118,110,.18)] [&:hover]:[background:#0b665f] [&:disabled]:opacity-[.6] [&:disabled]:cursor-not-allowed",
  secondary:
    "secondary-button min-h-[45px] inline-flex items-center justify-center gap-[9px] p-[0_18px] [border:0] rounded-[10px] font-bold text-[#475569] [background:#f1f5f9]",
  icon: "icon-button w-[36px] h-[36px] p-0 inline-grid place-items-center text-[#748096] bg-transparent [border:0] rounded-[9px] [&:hover]:text-[#0f766e] [&:hover]:[background:#eef8f6]",
  text: "text-button p-[6px_8px] text-[#b54708] bg-transparent [border:0] rounded-[6px] text-[10px] [&:hover]:[background:#fff4e8] [&:disabled]:text-[#aab1bd] [&:disabled]:cursor-not-allowed",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: Props) {
  return <button className={`${variants[variant]} ${className}`} {...props} />;
}
