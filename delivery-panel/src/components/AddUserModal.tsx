import { FormEvent, useState } from 'react';
import { LoaderCircle, UserPlus, X } from 'lucide-react';
import { api } from '../api';
import type { User, UserRole } from '../types';

interface Props {
  token: string;
  onClose: () => void;
  onCreated: (user: User) => void;
}

export function AddUserModal({ token, onClose, onCreated }: Props) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('DRIVER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await api.createUser(token, { fullName: fullName.trim(), phone: phone.trim(), password, role });
      onCreated(user);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'ساخت کاربر ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header><div><span className="modal-icon"><UserPlus size={20} /></span><div><h3>افزودن کاربر جدید</h3><p>اطلاعات حساب را وارد کنید.</p></div></div>
          <button className="icon-button" onClick={onClose}><X size={20} /></button></header>
        <form onSubmit={submit}>
          <label>نام و نام خانوادگی</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="مثلاً علی رضایی" required />
          <label>شماره موبایل</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="09123456789" required />
          <label>رمز عبور</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} placeholder="حداقل ۸ کاراکتر" required />
          <label>نقش کاربر</label>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="DRIVER">پیک</option><option value="ADMIN">مدیر</option>
          </select>
          {error && <div className="form-error">{error}</div>}
          <footer><button type="button" className="secondary-button" onClick={onClose}>انصراف</button>
            <button className="primary-button" disabled={loading}>{loading ? <LoaderCircle className="spin" size={19} /> : 'ساخت حساب'}</button></footer>
        </form>
      </section>
    </div>
  );
}
