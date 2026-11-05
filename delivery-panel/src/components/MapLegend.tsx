export function MapLegend({ showPlaces = true }: { showPlaces?: boolean }) {
  return <div className="map-legend absolute z-[500] left-[16px] bottom-[16px] flex flex-wrap max-w-[calc(100%_-_32px)] gap-[12px] p-[9px_12px] text-[#596579] [background:rgba(255,255,255,.94)] [border:1px_solid_#e1e6ed] rounded-[8px] [box-shadow:0_4px_12px_rgba(19,31,54,.12)] text-[10px] [&_span]:flex [&_span]:items-center [&_span]:gap-[6px] [&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-[50%] [&_i]:[background:#94a3b8] [&_i.green-dot]:[background:#16a67b] [&_i.route-line-dot]:w-[38px] [&_i.route-line-dot]:h-[5px] [&_i.route-line-dot]:[background:linear-gradient(90deg,_#bfdbfe_0%,_#93c5fd_20%,_#60a5fa_40%,_#3b82f6_60%,_#2563eb_80%,_#1d4ed8_100%)] [&_i.route-line-dot]:rounded-[99px] [&_i.place-dot]:[background:#6d4bc3]">
    <span><i className="green-dot" /> آنلاین</span>
    <span><i /> غیرفعال</span>
    <span><i className="route-line-dot" /> مسیر؛ قدیمی تا جدید</span>
    {showPlaces && <span><i className="place-dot" /> مکان ثابت</span>}
  </div>;
}
