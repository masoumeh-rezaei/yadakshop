import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import type { DriverLocation, SavedPlace } from "../types";
import { Building2, Plus } from 'lucide-react';

const placeColors = [
  "[--place-color:#7c3aed]",
  "[--place-color:#db2777]",
  "[--place-color:#2563eb]",
  "[--place-color:#0891b2]",
  "[--place-color:#059669]",
  "[--place-color:#ca8a04]",
  "[--place-color:#ea580c]",
  "[--place-color:#dc2626]",
  "[--place-color:#4f46e5]",
];
function PlaceMarker({
  name,
  selected = false,
  draft = false,
  color = "",
}: {
  name: string;
  selected?: boolean;
  draft?: boolean;
  color?: string;
}) {
  return (
    <div
      className={`place-marker-card  w-[140px] h-[62px] relative flex flex-col items-center justify-end [filter:drop-shadow(0_5px_7px_rgba(15,23,42,.2))] [transform-origin:50%_100%] [transition:transform_.18s_ease,_filter_.18s_ease] [&:hover]:z-[2] [&:hover]:[filter:drop-shadow(0_8px_10px_rgba(15,23,42,.28))] [&:hover]:[transform:translateY(-3px)_scale(1.07)] [&.selected.selected]:z-[2] [&.selected.selected]:[filter:drop-shadow(0_8px_10px_rgba(15,23,42,.28))] [&.selected.selected]:[transform:translateY(-3px)_scale(1.07)] [&.selected.selected_.place-marker-label]:text-[#fff] [&.selected.selected_.place-marker-label]:[background:var(--place-color)] [&.selected.selected_.place-marker-label]:[border-color:var(--place-color)] [&.selected.selected_.place-marker-label::after]:[background:var(--place-color)] [&.selected.selected_.place-marker-label::after]:[border-color:var(--place-color)] [&.selected.selected_.place-marker-pin]:[box-shadow:0_0_0_5px_color-mix(in_srgb,_var(--place-color)_20%,_transparent),_0_5px_12px_rgba(15,23,42,.26)] [&.draft]:[--place-color:#0f766e] [&.draft]:animate-marker-pulse [&.draft_.place-marker-label]:text-[#0f766e] [&.draft_.place-marker-label]:[border-style:dashed] [&.draft_.place-marker-pin_span]:text-[20px] [&.draft_.place-marker-pin_span]:font-normal ${color} ${selected ? "selected" : ""} ${draft ? "draft" : ""}`}
    >
      <div className="place-marker-label max-w-[132px] h-[25px] absolute top-[0] flex items-center p-[0_10px] text-[#253047] [background:rgba(255,255,255,.96)] [border:1px_solid_color-mix(in_srgb,_var(--place-color)_28%,_#e3e7ee)] rounded-[8px] [box-shadow:0_3px_9px_rgba(15,23,42,.1)] [font:700_10px/1_'PeydaWebFaNum',_Tahoma,_Arial,_sans-serif] whitespace-nowrap [&_>_span]:block [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&::after]:w-[7px] [&::after]:h-[7px] [&::after]:absolute [&::after]:right-[7px] [&::after]:bottom-[-5px] [&::after]:[content:''] [&::after]:[background:#fff] [&::after]:[border-right:1px_solid_color-mix(in_srgb,_var(--place-color)_28%,_#e3e7ee)] [&::after]:[border-bottom:1px_solid_color-mix(in_srgb,_var(--place-color)_28%,_#e3e7ee)] [&::after]:[transform:rotate(45deg)]">
        <span>{name}</span>
      </div>
      <div className="place-marker-pin w-[36px] h-[36px] absolute bottom-[6px] grid place-items-center text-[#fff] [background:var(--place-color)] [border:3px_solid_#fff] rounded-[11px] [box-shadow:0_4px_10px_color-mix(in_srgb,_var(--place-color)_40%,_transparent)]">
        {draft ? <Plus size={20} /> : <Building2 size={21} strokeWidth={2.2} />}
      </div>
      <div className="place-marker-shadow w-[18px] h-[5px] absolute bottom-[0] [background:rgba(15,23,42,.2)] rounded-[50%] [filter:blur(2px)]" />
    </div>
  );
}

export function driverIcon(location: DriverLocation, selected: boolean) {
  const name = location.fullName?.trim() || location.phone || "پیک بدون نام";
  const online =
    Date.now() - new Date(location.recordedAt).getTime() < 2 * 60 * 1000;
  return L.divIcon({
    className: "driver-marker-wrapper bg-transparent [border:0]",
    html: renderToStaticMarkup(
      <div
        className={`driver-marker-card [--driver-color:#8994a6] relative w-[150px] h-[62px] pointer-events-none [&.online]:[--driver-color:#129476] [&.selected.selected]:[--driver-color:#ef7a32] [&.selected.selected_.driver-marker-label]:text-[#a7440b] [&.selected.selected_.driver-marker-label]:[border-color:#f4b28c] [&.selected.selected_.driver-marker-pin]:[box-shadow:0_0_0_6px_rgba(239,122,50,.18),_0_5px_15px_rgba(15,23,42,.3)] ${online ? "online" : "offline"} ${selected ? "selected" : ""}`}
      >
        <div
          className="driver-marker-label absolute top-[0] left-[50%] max-w-[138px] p-[5px_9px] overflow-hidden text-[#253247] [background:rgba(255,255,255,.96)] [border:1px_solid_color-mix(in_srgb,_var(--driver-color)_24%,_#dce2ea)] rounded-[7px] [box-shadow:0_3px_10px_rgba(15,23,42,.13)] text-[10px] font-bold leading-[1.2] whitespace-nowrap text-ellipsis [transform:translateX(-50%)]"
          title={name}
        >
          <span>{name}</span>
        </div>
        <div className="driver-marker-pin absolute bottom-[5px] left-[50%] w-[32px] h-[32px] grid place-items-center [background:var(--driver-color)] [border:3px_solid_#fff] rounded-[50%_50%_50%_8px] [box-shadow:0_4px_12px_rgba(15,23,42,.3)] [transform:translateX(-50%)_rotate(-45deg)] [&_span]:w-[8px] [&_span]:h-[8px] [&_span]:[background:#fff] [&_span]:rounded-[50%]">
          <span />
        </div>
        <div className="driver-marker-shadow absolute bottom-[0] left-[50%] w-[24px] h-[6px] [background:rgba(15,23,42,.18)] rounded-[50%] [filter:blur(2px)] [transform:translateX(-50%)]" />
      </div>,
    ),
    iconSize: [150, 62],
    iconAnchor: [75, 58],
    popupAnchor: [0, -56],
  });
}

export function placeIcon(place: SavedPlace, selected: boolean) {
  return L.divIcon({
    className: "place-marker-wrapper bg-transparent [border:0]",
    html: renderToStaticMarkup(
      <PlaceMarker
        name={place.name}
        selected={selected}
        color={placeColors[Math.abs(Number(place.id)) % placeColors.length]}
      />,
    ),
    iconSize: [140, 62],
    iconAnchor: [70, 58],
    popupAnchor: [0, -56],
  });
}

export const draftIcon = L.divIcon({
  className: "place-marker-wrapper bg-transparent [border:0]",
  html: renderToStaticMarkup(<PlaceMarker name="مکان جدید" draft />),
  iconSize: [140, 62],
  iconAnchor: [70, 58],
  popupAnchor: [0, -56],
});
