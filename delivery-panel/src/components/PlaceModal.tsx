import { useEffect, useState, type FormEvent } from 'react';
import { MapPin, RefreshCw, X } from 'lucide-react';
import { api } from '../api';
import type { SavedPlace } from '../types';

interface Props {
  token: string;
  place: SavedPlace | null;
  coordinates: { latitude: number; longitude: number };
  onClose: () => void;
  onSaved: (place: SavedPlace) => void;
}

export function PlaceModal({ token, place, coordinates, onClose, onSaved }: Props) {
  const [name, setName] = useState(place?.name ?? '');
  const [latitude, setLatitude] = useState(String(coordinates.latitude));
  const [longitude, setLongitude] = useState(String(coordinates.longitude));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { document.querySelector<HTMLInputElement>('.place-name-input')?.focus(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input = { name: name.trim(), latitude: Number(latitude), longitude: Number(longitude) };
    if (!input.name) { setError('نام مکان را وارد کنید.'); return; }
    if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90 ||
        !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
      setError('مختصات واردشده معتبر نیست.'); return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = place
        ? await api.updatePlace(token, place.id, input)
        : await api.createPlace(token, input);
      onSaved({ ...place, ...saved });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'ذخیره مکان ناموفق بود.');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="place-modal-title">
        <header><div><span className="modal-icon"><MapPin size={20} /></span><div>
          <h3 id="place-modal-title">{place ? 'ویرایش مکان' : 'افزودن مکان'}</h3>
          <p>{place ? 'نام یا مختصات پین را تغییر دهید.' : 'برای پین انتخاب‌شده یک نام ثبت کنید.'}</p>
        </div></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={19} /></button></header>
        <form onSubmit={submit}>
          <label htmlFor="place-name">نام مکان</label>
          <input id="place-name" className="place-name-input" value={name} maxLength={100}
            onChange={(event) => setName(event.target.value)} placeholder="مثلاً فروشگاه مرکزی" />
          <div className="coordinate-fields">
            <div><label htmlFor="place-latitude">عرض جغرافیایی</label><input id="place-latitude" dir="ltr"
              inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></div>
            <div><label htmlFor="place-longitude">طول جغرافیایی</label><input id="place-longitude" dir="ltr"
              inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <footer><button type="button" className="secondary-button" onClick={onClose}>انصراف</button>
            <button className="primary-button" disabled={saving}>{saving && <RefreshCw className="spin" size={16} />}{place ? 'ذخیره تغییرات' : 'ثبت مکان'}</button></footer>
        </form>
      </div>
    </div>
  );
}
