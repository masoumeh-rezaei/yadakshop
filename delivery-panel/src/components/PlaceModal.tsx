import { Input, Label } from "./ui/FormControls";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { useEffect, useState, type FormEvent } from "react";
import { MapPin, RefreshCw } from "lucide-react";
import { api } from "../api";
import type { SavedPlace } from "../types";

interface Props {
  token: string;
  coordinates: { latitude: number; longitude: number };
  onClose: () => void;
  onSaved: (place: SavedPlace) => void;
}

export function PlaceModal({ token, coordinates, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState(String(coordinates.latitude));
  const [longitude, setLongitude] = useState(String(coordinates.longitude));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.querySelector<HTMLInputElement>(".place-name-input")?.focus();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input = {
      name: name.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
    };
    if (!input.name) {
      setError("نام مکان را وارد کنید.");
      return;
    }
    if (
      !Number.isFinite(input.latitude) ||
      input.latitude < -90 ||
      input.latitude > 90 ||
      !Number.isFinite(input.longitude) ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      setError("مختصات واردشده معتبر نیست.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await api.createPlace(token, input);
      onSaved(saved);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "ذخیره مکان ناموفق بود.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="افزودن مکان"
      description="برای پین انتخاب‌شده یک نام ثبت کنید."
      icon={<MapPin size={20} />}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <Label htmlFor="place-name">نام مکان</Label>
        <Input
          id="place-name"
          className="place-name-input"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder="مثلاً فروشگاه مرکزی"
        />
        <div className="coordinate-fields grid grid-cols-[1fr_1fr] gap-[12px] [&_input]:text-left [@media(max-width:640px)]:[&&]:grid-cols-[1fr] [@media(max-width:640px)]:[&&]:gap-[0]">
          <div>
            <Label htmlFor="place-latitude">عرض جغرافیایی</Label>
            <Input
              id="place-latitude"
              dir="ltr"
              inputMode="decimal"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="place-longitude">طول جغرافیایی</Label>
            <Input
              id="place-longitude"
              dir="ltr"
              inputMode="decimal"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
            />
          </div>
        </div>
        {error && (
          <div className="form-error text-[#b42318] [background:#fff1f0] [border:1px_solid_#ffd4d0] rounded-[10px] p-[11px_13px] m-[2px_0_12px] text-[13px]">
            {error}
          </div>
        )}
        <footer>
          <Button type="button" variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button variant="primary" disabled={saving}>
            {saving && <RefreshCw className="spin animate-spin" size={16} />}ثبت
            مکان
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
