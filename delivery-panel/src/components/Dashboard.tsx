import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, CircleUserRound, LayoutDashboard, LogOut, Map, Menu, Navigation,
  Plus, RefreshCw, Search, Truck, UserCog, Users, Wifi, WifiOff, X,
} from 'lucide-react';
import { io } from 'socket.io-client';
import { api, API_URL, ApiError } from '../api';
import { useAuth } from '../auth';
import type { DriverLocation, User } from '../types';
import { AddUserModal } from './AddUserModal';
import { LiveMap } from './LiveMap';

type View = 'map' | 'users';
type ConnectionState = 'connecting' | 'connected' | 'disconnected';

const locationTime = (date: string) => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return `${seconds} ثانیه پیش`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} دقیقه پیش`;
  return new Date(date).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
};

const online = (date: string) => Date.now() - new Date(date).getTime() < 2 * 60 * 1000;

export function Dashboard() {
  const { token, user: admin, logout } = useAuth();
  const [view, setView] = useState<View>('map');
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleError = useCallback((requestError: unknown) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      logout();
      return;
    }
    setError(requestError instanceof Error ? requestError.message : 'دریافت اطلاعات ناموفق بود.');
  }, [logout]);

  const loadData = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const [allUsers, latest] = await Promise.all([api.users(token), api.latestLocations(token)]);
      setUsers(allUsers);
      setLocations(latest);
      setSelectedId((current) => current ?? latest[0]?.userId ?? null);
    } catch (requestError) {
      handleError(requestError);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, handleError]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
    socket.on('connect', () => setConnection('connected'));
    socket.on('disconnect', () => setConnection('disconnected'));
    socket.on('connect_error', () => setConnection('disconnected'));
    socket.on('location:update', (location: DriverLocation) => {
      setLocations((current) => [location, ...current.filter((item) => item.userId !== location.userId)]);
    });
    const connectTimer = window.setTimeout(() => socket.connect(), 0);
    return () => {
      window.clearTimeout(connectTimer);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    const timer = window.setInterval(() => loadData(true), 30_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const drivers = useMemo(() => users.filter((item) => item.role === 'DRIVER'), [users]);
  const visibleDrivers = useMemo(() => {
    const phrase = search.trim().toLowerCase();
    if (!phrase) return drivers;
    return drivers.filter((item) => `${item.fullName || ''} ${item.phone}`.toLowerCase().includes(phrase));
  }, [drivers, search]);
  const filteredLocations = useMemo(() => locations.filter((location) =>
    visibleDrivers.some((driver) => driver.id === location.userId)), [locations, visibleDrivers]);
  const onlineCount = locations.filter((item) => online(item.recordedAt)).length;
  const selected = locations.find((item) => item.userId === selectedId);

  const changeView = (next: View) => { setView(next); setSidebarOpen(false); };

  const toggleStatus = async (target: User) => {
    if (!token) return;
    const nextStatus = !(target.isActive === true || target.isActive === 1);
    try {
      await api.setUserStatus(token, target.id, nextStatus);
      setUsers((current) => current.map((item) => item.id === target.id ? { ...item, isActive: nextStatus } : item));
    } catch (requestError) { handleError(requestError); }
  };

  return (
    <div className="dashboard-shell">
      <button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={22} /></button>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
        <div className="sidebar-brand"><span><Navigation size={22} /></span><div><b>راه‌نگار</b><small>مرکز کنترل ارسال</small></div></div>
        <nav>
          <button className={view === 'map' ? 'active' : ''} onClick={() => changeView('map')}><Map size={19} /><span>نقشه زنده</span></button>
          <button className={view === 'users' ? 'active' : ''} onClick={() => changeView('users')}><Users size={19} /><span>مدیریت کاربران</span></button>
        </nav>
        <div className="sidebar-system"><span className={connection === 'connected' ? 'ok' : ''} />
          <div><b>{connection === 'connected' ? 'سامانه متصل است' : 'در حال اتصال...'}</b><small>به‌روزرسانی لحظه‌ای</small></div></div>
        <div className="sidebar-user"><CircleUserRound size={34} /><div><b>{admin?.fullName || 'مدیر سیستم'}</b><small>{admin?.phone}</small></div>
          <button onClick={logout} title="خروج"><LogOut size={18} /></button></div>
      </aside>

      <main className="dashboard-main">
        <header className="topbar">
          <div><p>مرکز عملیات</p><h1>{view === 'map' ? 'نقشه زنده پیک‌ها' : 'مدیریت کاربران'}</h1></div>
          <div className={`connection-badge ${connection}`}>
            {connection === 'connected' ? <Wifi size={16} /> : <WifiOff size={16} />}
            {connection === 'connected' ? 'ارتباط زنده' : 'ارتباط قطع است'}
          </div>
        </header>

        {error && <div className="page-error"><span>{error}</span><button onClick={() => loadData()}>تلاش مجدد</button></div>}
        {loading ? <div className="content-loader"><RefreshCw className="spin" /><span>در حال دریافت اطلاعات...</span></div> : view === 'map' ? (
          <>
            <section className="stats-grid">
              <article><span className="stat-icon blue"><Truck /></span><div><small>کل پیک‌ها</small><strong>{drivers.length.toLocaleString('fa-IR')}</strong></div></article>
              <article><span className="stat-icon green"><Activity /></span><div><small>آنلاین</small><strong>{onlineCount.toLocaleString('fa-IR')}</strong></div></article>
              <article><span className="stat-icon amber"><Map /></span><div><small>دارای موقعیت</small><strong>{locations.length.toLocaleString('fa-IR')}</strong></div></article>
            </section>
            <section className="map-card">
              <div className="map-panel">
                <LiveMap locations={filteredLocations} selectedId={selectedId} onSelect={setSelectedId} />
                <div className="map-legend"><span><i className="green-dot" /> آنلاین</span><span><i /> غیرفعال</span></div>
              </div>
              <aside className="driver-panel">
                <div className="panel-heading"><div><h2>پیک‌ها</h2><span>{visibleDrivers.length.toLocaleString('fa-IR')} نفر</span></div>
                  <button className="icon-button" onClick={() => loadData()}><RefreshCw size={17} /></button></div>
                <div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجوی نام یا شماره" /></div>
                <div className="driver-list">
                  {visibleDrivers.map((driver) => {
                    const location = locations.find((item) => item.userId === driver.id);
                    return <button key={driver.id} className={`driver-item ${selectedId === driver.id ? 'selected' : ''}`} onClick={() => setSelectedId(driver.id)}>
                      <span className="avatar">{(driver.fullName || 'پ').slice(0, 1)}</span>
                      <span className="driver-info"><b>{driver.fullName || 'بدون نام'}</b><small>{location ? locationTime(location.recordedAt) : 'موقعیتی ثبت نشده'}</small></span>
                      <span className={`presence ${location && online(location.recordedAt) ? 'online' : ''}`} />
                    </button>;
                  })}
                  {!visibleDrivers.length && <div className="empty-state">پیکی با این مشخصات پیدا نشد.</div>}
                </div>
                {selected && <div className="selected-driver"><span>مختصات انتخاب‌شده</span><b dir="ltr">{Number(selected.latitude).toFixed(5)}, {Number(selected.longitude).toFixed(5)}</b>
                  <small>دقت تقریبی: {Math.round(Number(selected.accuracy || 0))} متر</small></div>}
              </aside>
            </section>
          </>
        ) : (
          <section className="users-card">
            <div className="users-toolbar"><div><h2>کاربران سامانه</h2><p>حساب مدیران و پیک‌ها را مدیریت کنید.</p></div>
              <button className="primary-button" onClick={() => setShowAddUser(true)}><Plus size={18} /> افزودن کاربر</button></div>
            <div className="table-search search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجوی کاربر" /></div>
            <div className="users-table-wrap"><table><thead><tr><th>کاربر</th><th>شماره موبایل</th><th>نقش</th><th>وضعیت</th><th>عملیات</th></tr></thead>
              <tbody>{users.filter((item) => `${item.fullName || ''} ${item.phone}`.includes(search.trim())).map((item) => {
                const active = item.isActive === true || item.isActive === 1;
                return <tr key={item.id}><td><div className="table-user"><span className="avatar">{(item.fullName || 'ک').slice(0, 1)}</span><b>{item.fullName || 'بدون نام'}</b></div></td>
                  <td dir="ltr">{item.phone}</td><td><span className={`role-badge ${item.role.toLowerCase()}`}>{item.role === 'ADMIN' ? <UserCog size={14} /> : <Truck size={14} />}{item.role === 'ADMIN' ? 'مدیر' : 'پیک'}</span></td>
                  <td><span className={`status-badge ${active ? 'active' : ''}`}><i />{active ? 'فعال' : 'غیرفعال'}</span></td>
                  <td><button className="text-button" disabled={item.id === admin?.id} onClick={() => toggleStatus(item)}>{active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</button></td></tr>;
              })}</tbody></table></div>
          </section>
        )}
      </main>
      {showAddUser && token && <AddUserModal token={token} onClose={() => setShowAddUser(false)} onCreated={(newUser) => { setUsers((current) => [newUser, ...current]); setShowAddUser(false); }} />}
    </div>
  );
}
