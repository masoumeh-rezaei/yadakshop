import type { ReactNode } from "react";
interface Props {
  icon: ReactNode;
  label: string;
  value: number;
  tone: "blue" | "green" | "amber";
}
export function StatCard({ icon, label, value, tone }: Props) {
  return (
    <article>
      <span
        className={`stat-icon w-[46px] h-[46px] grid place-items-center rounded-[12px] [&_svg]:w-[21px] [&.blue]:text-[#2868c7] [&.blue]:[background:#edf4ff] [&.green]:text-[#0c9374] [&.green]:[background:#eaf9f4] [&.amber]:text-[#c26c19] [&.amber]:[background:#fff4e7] ${tone}`}
      >
        {icon}
      </span>
      <div>
        <small>{label}</small>
        <strong>{value.toLocaleString("fa-IR")}</strong>
      </div>
    </article>
  );
}
