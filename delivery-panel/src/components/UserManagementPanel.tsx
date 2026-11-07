import { MapPin, Plus, Power, Search, ShieldCheck, Trash2, Truck } from 'lucide-react';
import { useMemo } from 'react';
import type { DriverLocation, User } from '../types';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Input } from './ui/FormControls';

interface Props {
  users: User[];
  locations: ReadonlyMap<number, DriverLocation>;
  adminId?: number;
  selectedId: number | null;
  search: string;
  deletingIds: number[];
  updatingIds: number[];
  onSearch: (value: string) => void;
  onAdd: () => void;
  onSelect: (id: number) => void;
  onToggleStatus: (user: User) => void;
  onDelete: (user: User) => void;
}

export function UserManagementPanel(props: Props) {
  const filteredUsers = useMemo(() => {
    const phrase = props.search.trim().toLocaleLowerCase('fa-IR');
    return props.users.filter((user) => `${user.fullName || ''} ${user.phone}`.toLocaleLowerCase('fa-IR').includes(phrase));
  }, [props.users, props.search]);

  return <aside className="user-management-panel" aria-label="کاربران سامانه">
    <div className="user-management-heading">
      <div><h2>کاربران سامانه <span>{props.users.length.toLocaleString('fa-IR')}</span></h2>
        <p>برای دیدن موقعیت پیک، نام او را انتخاب کنید.</p></div>
      <Button variant="primary" className="user-add-button [&&]:min-h-[34px] [&&]:p-[0_10px] [&&]:gap-[4px] [&&]:rounded-[8px] [&&]:text-[11px] [&&]:[box-shadow:none]" onClick={props.onAdd}><Plus size={15} /> افزودن</Button>
    </div>
    <label className="user-management-search [&_input]:h-[38px] [&_input]:p-0 [&_input]:bg-transparent [&_input]:[border:0] [&_input]:[box-shadow:none] [&_input]:text-[11px]">
      <Search size={16} />
      <Input aria-label="جست‌وجوی کاربر" value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="جست‌وجوی نام یا شماره موبایل" />
    </label>
    <div className="user-management-table-wrap">
      <table className="user-management-table" aria-label="جدول کاربران سامانه">
        <thead><tr><th scope="col">کاربر</th><th scope="col">حساب</th><th scope="col">عملیات</th></tr></thead>
        <tbody>{filteredUsers.map((user) => {
          const isDriver = user.role === 'DRIVER';
          const selected = isDriver && user.id === props.selectedId;
          const active = user.isActive === true || user.isActive === 1;
          const busy = props.deletingIds.includes(user.id) || props.updatingIds.includes(user.id);
          const name = user.fullName || 'بدون نام';
          const identity = <><Avatar>{name.slice(0, 1)}</Avatar><span className="user-identity"><b>{name}</b><small dir="ltr">{user.phone}</small>
            {isDriver && !props.locations.has(user.id) && <em>موقعیتی ثبت نشده</em>}</span>
            {isDriver && props.locations.has(user.id) && <MapPin className="user-location-icon" size={14} />}</>;
          return <tr key={user.id} className={selected ? 'selected' : ''}>
            <td>{isDriver ? <button type="button" className="user-select-button" aria-pressed={selected} aria-label={`نمایش ${name} روی نقشه`} onClick={() => props.onSelect(user.id)}>{identity}</button>
              : <div className="user-select-button admin">{identity}</div>}</td>
            <td><span className={`user-role ${isDriver ? '' : 'admin'}`}>{isDriver ? <Truck size={12} /> : <ShieldCheck size={12} />}{isDriver ? 'پیک' : 'مدیر'}</span>
              <span className={`user-account-status ${active ? 'active' : ''}`}><i />{active ? 'فعال' : 'غیرفعال'}</span></td>
            <td><div className="user-row-actions">
              <button type="button" className={active ? 'deactivate' : 'activate'} disabled={user.id === props.adminId || busy}
                title={active ? 'غیرفعال‌سازی حساب' : 'فعال‌سازی حساب'} aria-label={`${active ? 'غیرفعال‌سازی' : 'فعال‌سازی'} ${name}`} onClick={() => props.onToggleStatus(user)}><Power size={15} /></button>
              {isDriver && <button type="button" className="delete" disabled={busy} title="حذف پیک" aria-label={`حذف ${name}`} onClick={() => props.onDelete(user)}><Trash2 size={15} /></button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
      {!filteredUsers.length && <p className="user-management-empty" role="status">کاربری با این مشخصات پیدا نشد.</p>}
    </div>
    <div className="user-management-footer"><MapPin size={14} /> روی نقشه فقط موقعیت پیک‌ها نمایش داده می‌شود.</div>
  </aside>;
}
