import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

interface Props {
  title: string;
  description: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, description, icon, onClose, children }: Props) {
  const titleId = useId();
  return (
    <div
      className="modal-backdrop fixed z-[1000] inset-[0] grid place-items-center p-[18px] [background:rgba(15,23,42,.55)] [backdrop-filter:blur(4px)]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal w-[min(100%,_480px)] overflow-hidden [background:#fff] rounded-[17px] [box-shadow:0_24px_70px_rgba(15,23,42,.26)] [&_header]:flex [&_header]:items-start [&_header]:justify-between [&_header]:p-[20px_22px] [&_header]:[border-bottom:1px_solid_#e8ebf0] [&_header_>_div]:flex [&_header_>_div]:gap-[11px] [&_h3]:m-[0_0_5px] [&_h3]:text-[16px] [&_header_p]:m-0 [&_header_p]:text-[#8a95a5] [&_header_p]:text-[10px] [&_form]:p-[20px_22px] [&_form_input]:mb-[15px] [&_form_select]:mb-[15px] [&_footer]:flex [&_footer]:justify-end [&_footer]:gap-[10px] [&_footer]:mt-[7px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <div>
            <span className="modal-icon w-[40px] h-[40px] grid place-items-center text-[#0f766e] [background:#e8f8f4] rounded-[11px]">
              {icon}
            </span>
            <div>
              <h3 id={titleId}>{title}</h3>
              <p>{description}</p>
            </div>
          </div>
          <Button
            variant="icon"
            type="button"
            onClick={onClose}
            aria-label="بستن"
          >
            <X size={20} />
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}
