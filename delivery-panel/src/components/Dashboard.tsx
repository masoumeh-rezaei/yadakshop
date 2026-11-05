import { Input } from "./ui/FormControls";
import { StatCard } from "./ui/StatCard";
import { Button } from "./ui/Button";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CircleUserRound,
  LogOut,
  Map,
  MapPinned,
  Menu,
  MousePointer2,
  Navigation,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { io } from "socket.io-client";
import { api, API_URL, ApiError } from "../api";
import { useAuth } from "../auth";
import type { DriverLocation, SavedPlace, User } from "../types";
import { AddUserModal } from "./AddUserModal";
import { DriverListItem } from "./DriverListItem";
import { HistoryTimeline } from "./HistoryTimeline";
import { useDriverHistory } from "../hooks/useDriverHistory";
import { LiveMap } from "./LiveMap";
import { PlaceModal } from "./PlaceModal";
import { MapLegend } from "./MapLegend";
import { UserManagementPanel } from "./UserManagementPanel";

type View = "map" | "places" | "users";
type ConnectionState = "connecting" | "connected" | "disconnected";

const locationTime = (date: string) => {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds} ثانیه پیش`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} دقیقه پیش`;
  return new Date(date).toLocaleString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
};
const online = (date: string) =>
  Date.now() - new Date(date).getTime() < 2 * 60 * 1000;

export function Dashboard() {
  const { token, user: admin, logout } = useAuth();
  const [view, setView] = useState<View>("map");
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const history = useDriverHistory(token, logout);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mapFocusRequest, setMapFocusRequest] = useState(0);
  const [mapFocusTarget, setMapFocusTarget] = useState<"driver" | "history">("driver");
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);
  const [placeFocusRequest, setPlaceFocusRequest] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [deletingUserIds, setDeletingUserIds] = useState<number[]>([]);
  const [updatingUserIds, setUpdatingUserIds] = useState<number[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const [draftCoordinates, setDraftCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const handleError = useCallback(
    (requestError: unknown) => {
      if (requestError instanceof ApiError && requestError.status === 401) {
        logout();
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "دریافت اطلاعات ناموفق بود.",
      );
    },
    [logout],
  );

  const loadData = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setLoading(true);
      setError("");
      try {
        const [allUsers, latest, savedPlaces] = await Promise.all([
          api.users(token),
          api.latestLocations(token),
          api.places(token),
        ]);
        setUsers(allUsers);
        setLocations(latest);
        setPlaces(savedPlaces);
        setSelectedId((current) => current ?? latest[0]?.userId ?? null);
      } catch (requestError) {
        handleError(requestError);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, handleError],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);
  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      autoConnect: false,
    });
    socket.on("connect", () => setConnection("connected"));
    socket.on("disconnect", () => setConnection("disconnected"));
    socket.on("connect_error", () => setConnection("disconnected"));
    socket.on("location:update", (location: DriverLocation) => {
      setLocations((current) => [
        location,
        ...current.filter((item) => item.userId !== location.userId),
      ]);
      history.appendLocation(location);
    });
    const connectTimer = window.setTimeout(() => socket.connect(), 0);
    return () => {
      window.clearTimeout(connectTimer);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, history.appendLocation]);
  useEffect(() => {
    const timer = window.setInterval(() => loadData(true), 30_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const drivers = useMemo(
    () => users.filter((item) => item.role === "DRIVER"),
    [users],
  );
  const visibleDrivers = useMemo(() => {
    const phrase = search.trim().toLowerCase();
    return phrase
      ? drivers.filter((item) =>
          `${item.fullName || ""} ${item.phone}`.toLowerCase().includes(phrase),
        )
      : drivers;
  }, [drivers, search]);
  const driverLocations = useMemo(() => {
    const ids = new Set(drivers.map((driver) => driver.id));
    return locations.filter((location) => ids.has(location.userId));
  }, [drivers, locations]);
  const visibleDriverIds = useMemo(
    () => new Set(visibleDrivers.map((driver) => driver.id)),
    [visibleDrivers],
  );
  const filteredLocations = useMemo(
    () => locations.filter((location) => visibleDriverIds.has(location.userId)),
    [locations, visibleDriverIds],
  );
  const locationsByDriverId = useMemo(
    () =>
      new globalThis.Map(
        locations.map((location) => [location.userId, location] as const),
      ),
    [locations],
  );
  const visiblePlaces = useMemo(() => {
    const phrase = search.trim().toLowerCase();
    return phrase
      ? places.filter((item) => item.name.toLowerCase().includes(phrase))
      : places;
  }, [places, search]);
  const onlineCount = locations.filter((item) =>
    online(item.recordedAt),
  ).length;
  const selectedPlace =
    places.find((item) => item.id === selectedPlaceId) ?? null;
  const fetchHistory = useCallback(async (id: number) => {
    setSelectedId(id);
    setSelectedPlaceId(null);
    setMapFocusTarget("history");
    setMapFocusRequest((current) => current + 1);
    return history.open(id);
  }, [history.open]);
  const selectDriver = useCallback((id: number) => {
    setSelectedId(id);
    setSelectedPlaceId(null);
    setMapFocusTarget("driver");
    setMapFocusRequest((current) => current + 1);
    void history.open(id);
  }, [history.open]);
  const selectPlace = useCallback((id: number) => {
    setSelectedPlaceId(id);
    setPlaceFocusRequest((current) => current + 1);
  }, []);
  // Reframe after a settled range change so dragging stays responsive.
  useEffect(() => {
    if (!history.rangeActive || history.dayLoading) return;
    const timer = window.setTimeout(() => {
      setMapFocusTarget("history");
      setMapFocusRequest((current) => current + 1);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [history.dayLoading, history.rangeActive, history.range]);
  const changeView = (next: View) => {
    history.close();
    setMapFocusRequest(0);
    setPlaceFocusRequest(0);
    setMapFocusTarget("driver");
    setView(next);
    setSearch("");
    setPlacementMode(false);
    setDraftCoordinates(null);
    setSidebarOpen(false);
  };
  const toggleStatus = async (target: User) => {
    if (!token || updatingUserIds.includes(target.id)) return;
    const nextStatus = !(target.isActive === true || target.isActive === 1);
    setUpdatingUserIds((current) => [...current, target.id]);
    try {
      await api.setUserStatus(token, target.id, nextStatus);
      setUsers((current) =>
        current.map((item) =>
          item.id === target.id ? { ...item, isActive: nextStatus } : item,
        ),
      );
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setUpdatingUserIds((current) => current.filter((id) => id !== target.id));
    }
  };
  const deleteUser = async (target: User) => {
    if (
      !token ||
      target.role !== "DRIVER" ||
      deletingUserIds.includes(target.id) ||
      !window.confirm(
        `حساب پیک «${target.fullName || target.phone}» و تمام سوابق موقعیتش حذف شود؟ این کار قابل بازگشت نیست.`,
      )
    )
      return;
    setDeletingUserIds((current) => [...current, target.id]);
    try {
      await api.deleteUser(token, target.id);
      setUsers((current) => current.filter((item) => item.id !== target.id));
      setLocations((current) =>
        current.filter((item) => item.userId !== target.id),
      );
      setSelectedId((current) => (current === target.id ? null : current));
      if (history.driverId === target.id) history.close();
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setDeletingUserIds((current) => current.filter((id) => id !== target.id));
    }
  };
  const startPlacement = () => {
    setDraftCoordinates(null);
    setPlacementMode(true);
    setError("");
  };
  const deletePlace = async (place: SavedPlace) => {
    if (!token || !window.confirm(`مکان «${place.name}» حذف شود؟`)) return;
    try {
      await api.deletePlace(token, place.id);
      setPlaces((current) => current.filter((item) => item.id !== place.id));
      setSelectedPlaceId((current) => (current === place.id ? null : current));
    } catch (requestError) {
      handleError(requestError);
    }
  };
  const closePlaceModal = () => {
    setDraftCoordinates(null);
    setPlacementMode(false);
  };
  const savePlace = (saved: SavedPlace) => {
    setPlaces((current) => [...current, saved]);
    selectPlace(saved.id);
    closePlaceModal();
  };

  const historyPanel = history.driverId !== null ? (
    <HistoryTimeline
      driverName={drivers.find((driver) => driver.id === history.driverId)?.fullName || "پیک بدون نام"}
      days={history.days}
      selectedDay={history.selectedDay}
      range={history.range}
      rangeActive={history.rangeActive}
      loading={history.loading}
      dayLoading={history.dayLoading}
      error={history.error}
      dayError={history.dayError}
      pointCount={history.points.length}
      onSelectDay={(day) => { void history.selectDay(day); }}
      onRangeChange={history.changeRange}
      onReset={() => {
        history.resetRange();
        setMapFocusTarget("history");
        setMapFocusRequest((current) => current + 1);
      }}
      onRetry={() => { if (history.driverId !== null) void fetchHistory(history.driverId); }}
      onClose={history.close}
    />
  ) : null;

  return (
    <div className="dashboard-shell min-h-screen [background:#f5f7fb]">
      <button
        className="mobile-menu hidden [@media(max-width:980px)]:fixed [@media(max-width:980px)]:z-[30] [@media(max-width:980px)]:top-[18px] [@media(max-width:980px)]:right-[18px] [@media(max-width:980px)]:w-[42px] [@media(max-width:980px)]:h-[42px] [@media(max-width:980px)]:grid [@media(max-width:980px)]:place-items-center [@media(max-width:980px)]:text-[#fff] [@media(max-width:980px)]:[background:#111c32] [@media(max-width:980px)]:[border:0] [@media(max-width:980px)]:rounded-[11px] [@media(max-width:980px)]:[box-shadow:0_5px_14px_rgba(15,23,42,.18)]"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu size={22} />
      </button>
      {sidebarOpen && (
        <div
          className="sidebar-overlay [@media(max-width:980px)]:fixed [@media(max-width:980px)]:z-[35] [@media(max-width:980px)]:inset-[0] [@media(max-width:980px)]:[background:rgba(15,23,42,.4)]"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`sidebar fixed z-[40] top-[0] right-[0] bottom-[0] w-[255px] flex flex-col p-[26px_18px_18px] text-[#cdd6e7] [background:#111c32] [&_nav]:mt-[26px] [&_nav]:grid [&_nav]:gap-[7px] [&_nav_button]:h-[46px] [&_nav_button]:flex [&_nav_button]:items-center [&_nav_button]:gap-[12px] [&_nav_button]:p-[0_14px] [&_nav_button]:text-[#94a2b9] [&_nav_button]:bg-transparent [&_nav_button]:[border:0] [&_nav_button]:rounded-[10px] [&_nav_button]:text-right [&_nav_button:hover]:text-[#e5ebf4] [&_nav_button:hover]:[background:rgba(255,255,255,.04)] [&_nav_button.active.active]:text-[#fff] [&_nav_button.active.active]:[background:linear-gradient(90deg,_rgba(28,150,137,.28),_rgba(28,150,137,.14))] [&_nav_button.active.active_svg]:text-[#52d8b0] [@media(max-width:980px)]:[transform:translateX(105%)] [@media(max-width:980px)]:[transition:transform_.25s_ease] [@media(max-width:980px)]:[&.open]:[transform:translateX(0)] ${sidebarOpen ? "open" : ""}`}
      >
        <button
          className="sidebar-close hidden [@media(max-width:980px)]:grid [@media(max-width:980px)]:absolute [@media(max-width:980px)]:left-[10px] [@media(max-width:980px)]:top-[10px] [@media(max-width:980px)]:text-[#b8c2d2]"
          onClick={() => setSidebarOpen(false)}
        >
          <X size={20} />
        </button>
        <div className="sidebar-brand flex items-center gap-[12px] p-[0_9px_28px] [border-bottom:1px_solid_rgba(255,255,255,.08)] [&_>_span]:w-[42px] [&_>_span]:h-[42px] [&_>_span]:grid [&_>_span]:place-items-center [&_>_span]:text-[#092c2d] [&_>_span]:[background:#53d8b0] [&_>_span]:rounded-[13px] [&_>_span]:[transform:rotate(-6deg)] [&_>_span_svg]:[transform:rotate(6deg)] [&_div]:flex [&_div]:flex-col [&_div]:gap-[4px] [&_b]:text-[#fff] [&_b]:text-[19px] [&_small]:text-[#8593ab] [&_small]:text-[10px]">
          <span>
            <Navigation size={22} />
          </span>
          <div>
            <b>راه‌نگار</b>
            <small>مرکز کنترل ارسال</small>
          </div>
        </div>
        <nav>
          <button
            className={view === "map" ? "active" : ""}
            onClick={() => changeView("map")}
          >
            <Map size={19} />
            <span>نقشه زنده</span>
          </button>
          <button
            className={view === "places" ? "active" : ""}
            onClick={() => changeView("places")}
          >
            <MapPinned size={19} />
            <span>مدیریت مکان‌ها</span>
          </button>
          <button
            className={view === "users" ? "active" : ""}
            onClick={() => changeView("users")}
          >
            <Users size={19} />
            <span>مدیریت کاربران</span>
          </button>
        </nav>
        <div className="sidebar-system mt-auto flex items-center gap-[10px] p-[14px_11px] [border:1px_solid_rgba(255,255,255,.07)] rounded-[11px] [background:rgba(255,255,255,.025)] [&_>_span]:w-[9px] [&_>_span]:h-[9px] [&_>_span]:rounded-[50%] [&_>_span]:[background:#ef8354] [&_>_span.ok]:[background:#4cdda6] [&_>_span.ok]:[box-shadow:0_0_0_5px_rgba(76,221,166,.08)] [&_div]:min-w-0 [&_div]:flex [&_div]:flex-1 [&_div]:flex-col [&_div]:gap-[4px] [&_b]:text-[#dce4f0] [&_b]:text-[11px] [&_small]:text-[#78879e] [&_small]:text-[9px]">
          <span className={connection === "connected" ? "ok" : ""} />
          <div>
            <b>
              {connection === "connected"
                ? "سامانه متصل است"
                : "در حال اتصال..."}
            </b>
            <small>به‌روزرسانی لحظه‌ای</small>
          </div>
        </div>
        <div className="sidebar-user [&_div]:min-w-0 [&_div]:flex [&_div]:flex-1 [&_div]:flex-col [&_div]:gap-[4px] [&_small]:text-[#78879e] [&_small]:text-[9px] flex items-center gap-[10px] mt-[12px] p-[14px_6px_0] [border-top:1px_solid_rgba(255,255,255,.08)] [&_b]:overflow-hidden [&_b]:text-[#eef2f8] [&_b]:text-[11px] [&_b]:whitespace-nowrap [&_b]:text-ellipsis [&_button]:text-[#8090a9] [&_button]:[background:none] [&_button]:[border:0]">
          <CircleUserRound size={34} />
          <div>
            <b>{admin?.fullName || "مدیر سیستم"}</b>
            <small>{admin?.phone}</small>
          </div>
          <button onClick={logout} title="خروج">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="dashboard-main min-h-screen mr-[255px] p-[29px_34px_40px] [@media(max-width:980px)]:mr-[0] [@media(max-width:980px)]:p-[75px_18px_28px]">
        <header className="topbar flex items-center justify-between mb-[25px] [&_p]:m-[0_0_7px] [&_p]:text-[#8590a3] [&_p]:text-[11px] [&_h1]:m-0 [&_h1]:text-[#172033] [&_h1]:text-[24px] [@media(max-width:640px)]:[&&]:items-start [@media(max-width:640px)]:[&&]:gap-[13px] [@media(max-width:640px)]:[&&]:[&_h1]:text-[20px]">
          <div>
            <p>مرکز عملیات</p>
            <h1>
              {view === "map"
                ? "نقشه زنده پیک‌ها"
                : view === "places"
                  ? "مدیریت مکان‌ها"
                  : "مدیریت کاربران"}
            </h1>
          </div>
          <div
            className={`connection-badge flex items-center gap-[8px] p-[9px_12px] text-[#b54708] [background:#fff4e5] [border:1px_solid_#fed7aa] rounded-[9px] text-[11px] [&.connected]:text-[#08785f] [&.connected]:[background:#eafaf5] [&.connected]:[border-color:#b9eedc] [@media(max-width:640px)]:[&&]:p-[8px] [@media(max-width:640px)]:[&&]:[&_svg]:hidden ${connection}`}
          >
            {connection === "connected" ? (
              <Wifi size={16} />
            ) : (
              <WifiOff size={16} />
            )}
            {connection === "connected" ? "ارتباط زنده" : "ارتباط قطع است"}
          </div>
        </header>
        {error && (
          <div className="page-error text-[#b42318] [background:#fff1f0] [border:1px_solid_#ffd4d0] rounded-[10px] flex items-center justify-between p-[12px_15px] mb-[16px] text-[12px] [&_button]:text-[#b42318] [&_button]:bg-transparent [&_button]:[border:0] [&_button]:font-bold">
            <span>{error}</span>
            <button onClick={() => loadData()}>تلاش مجدد</button>
          </div>
        )}
        {loading ? (
          <div className="content-loader min-h-[60vh] flex items-center justify-center gap-[12px] text-[#64748b]">
            <RefreshCw className="spin animate-spin" />
            <span>در حال دریافت اطلاعات...</span>
          </div>
        ) : view === "map" ? (
          <>
            <section className="stats-grid grid grid-cols-[repeat(3,_1fr)] gap-[15px] mb-[16px] [&_article]:min-h-[92px] [&_article]:flex [&_article]:items-center [&_article]:gap-[14px] [&_article]:p-[17px] [&_article]:[background:#fff] [&_article]:[border:1px_solid_#e8ebf1] [&_article]:rounded-[14px] [&_article]:[box-shadow:0_3px_10px_rgba(19,31,54,.025)] [&_article_div]:flex [&_article_div]:flex-col [&_article_div]:gap-[5px] [&_small]:text-[#8993a4] [&_small]:text-[11px] [&_strong]:text-[#172033] [&_strong]:text-[24px] [@media(max-width:640px)]:[&&]:grid-cols-[1fr]">
              <StatCard
                icon={<Truck />}
                label="کل پیک‌ها"
                value={drivers.length}
                tone="blue"
              />
              <StatCard
                icon={<Activity />}
                label="آنلاین"
                value={onlineCount}
                tone="green"
              />
              <StatCard
                icon={<Map />}
                label="دارای موقعیت"
                value={locations.length}
                tone="amber"
              />
            </section>
            {historyPanel}
            <section className="map-card h-[calc(100vh_-_209px)] min-h-[540px] grid grid-cols-[minmax(0,_1fr)_310px] overflow-hidden [background:#fff] [border:1px_solid_#e4e8ef] rounded-[16px] [box-shadow:0_8px_28px_rgba(26,39,66,.055)] [@media(max-width:980px)]:h-[auto] [@media(max-width:980px)]:min-h-0 [@media(max-width:980px)]:grid-cols-[1fr]">
              <div className="map-panel relative min-w-0 [@media(max-width:980px)]:h-[520px] [@media(max-width:640px)]:[&&]:h-[440px]">
                <LiveMap
                  key="live-map"
                  locations={filteredLocations}
                  history={history.points}
                  historyLoading={history.loading || (history.rangeActive && history.dayLoading)}
                  focusRequest={mapFocusRequest}
                  focusTarget={mapFocusTarget}
                  selectedId={selectedId}
                  onSelect={selectDriver}
                  onHistoryRequest={fetchHistory}
                  historyStatuses={history.statuses}
                  places={places}
                  selectedPlaceId={selectedPlaceId}
                  placeFocusRequest={placeFocusRequest}
                  onPlaceSelect={selectPlace}
                />
                <MapLegend />
              </div>
              <aside className="driver-panel min-w-0 min-h-0 flex flex-col [border-left:1px_solid_#e7eaf0] [@media(max-width:980px)]:h-[420px] [@media(max-width:980px)]:[border-top:1px_solid_#e7eaf0] [@media(max-width:980px)]:[border-left:0]">
                <div className="panel-heading flex items-center justify-between p-[18px_17px_11px] [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-[8px] [&_h2]:m-0 [&_h2]:text-[16px] [&_span]:p-[3px_7px] [&_span]:text-[#607086] [&_span]:[background:#edf0f5] [&_span]:rounded-[6px] [&_span]:text-[9px]">
                  <div>
                    <h2>پیک‌ها</h2>
                    <span>
                      {visibleDrivers.length.toLocaleString("fa-IR")} نفر
                    </span>
                  </div>
                  <Button variant="icon" onClick={() => loadData()}>
                    <RefreshCw size={17} />
                  </Button>
                </div>
                <div className="search-box h-[40px] flex items-center gap-[8px] m-[0_16px_12px] p-[0_11px] text-[#9ba4b3] [background:#f7f8fa] [border:1px_solid_#e7e9ee] rounded-[9px] [&_input]:h-[auto] [&_input]:p-0 [&_input]:bg-transparent [&_input]:[border:0] [&_input]:[box-shadow:none] [&_input]:text-[11px]">
                  <Search size={17} />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="جست‌وجوی نام یا شماره"
                  />
                </div>
                <div className="driver-list min-h-0 [flex:1_1_auto] overflow-y-auto overscroll-contain [scrollbar-gutter:stable] p-[0_9px]">
                  {visibleDrivers.map((driver) => (
                    <DriverListItem
                      key={driver.id}
                      driver={driver}
                      location={locationsByDriverId.get(driver.id)}
                      selected={selectedId === driver.id}
                      historyStatus={history.statuses[driver.id] ?? "idle"}
                      onSelect={selectDriver}
                      onHistoryRequest={(id) => {
                        void fetchHistory(id);
                      }}
                      formatLocationTime={locationTime}
                      isOnline={online}
                    />
                  ))}
                  {!visibleDrivers.length && (
                    <div className="empty-state p-[30px_12px] text-[#8b96a7] text-center text-[11px]">
                      پیکی با این مشخصات پیدا نشد.
                    </div>
                  )}
                </div>
              </aside>
            </section>
          </>
        ) : view === "places" ? (
          <section
            className={`map-card h-[calc(100vh_-_209px)] min-h-[540px] grid grid-cols-[minmax(0,_1fr)_310px] overflow-hidden [background:#fff] [border:1px_solid_#e4e8ef] rounded-[16px] [box-shadow:0_8px_28px_rgba(26,39,66,.055)] [@media(max-width:980px)]:h-[auto] [@media(max-width:980px)]:min-h-0 [@media(max-width:980px)]:grid-cols-[1fr] places-card [&.places-card]:h-[calc(100vh_-_123px)] [&.places-card.placing_.leaflet-container]:[cursor:crosshair] [@media(max-width:980px)]:[&.places-card]:h-[auto] ${placementMode ? "placing" : ""}`}
          >
            <div className="map-panel relative min-w-0 [@media(max-width:980px)]:h-[520px] [@media(max-width:640px)]:[&&]:h-[440px]">
              <LiveMap
                key="places-map"
                locations={[]}
                selectedId={null}
                onSelect={() => undefined}
                places={visiblePlaces}
                selectedPlaceId={selectedPlaceId}
                placeFocusRequest={placeFocusRequest}
                onPlaceSelect={selectPlace}
                placementMode={placementMode}
                draftCoordinates={draftCoordinates}
                onMapClick={(latitude, longitude) =>
                  setDraftCoordinates({ latitude, longitude })
                }
              />
              {placementMode && !draftCoordinates && (
                <div className="placement-hint absolute z-[500] top-[17px] left-[50%] flex items-center gap-[8px] p-[11px_15px] text-[#fff] [background:rgba(17,28,50,.92)] rounded-[10px] [box-shadow:0_7px_22px_rgba(15,23,42,.24)] text-[11px] [transform:translateX(-50%)] pointer-events-none [@media(max-width:640px)]:[&&]:w-[max-content] [@media(max-width:640px)]:[&&]:max-w-[calc(100%_-_32px)]">
                  <MousePointer2 size={18} /> محل موردنظر را روی نقشه انتخاب
                  کنید.
                </div>
              )}
            </div>
            <aside className="driver-panel min-w-0 min-h-0 flex flex-col [border-left:1px_solid_#e7eaf0] [@media(max-width:980px)]:h-[420px] [@media(max-width:980px)]:[border-top:1px_solid_#e7eaf0] [@media(max-width:980px)]:[border-left:0] places-panel">
              <div className="panel-heading flex items-center justify-between p-[18px_17px_11px] [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-[8px] [&_h2]:m-0 [&_h2]:text-[16px] [&_span]:p-[3px_7px] [&_span]:text-[#607086] [&_span]:[background:#edf0f5] [&_span]:rounded-[6px] [&_span]:text-[9px]">
                <div>
                  <h2>مکان‌ها</h2>
                  <span>{places.length.toLocaleString("fa-IR")} مورد</span>
                </div>
                <Button
                  variant="icon"
                  onClick={() => loadData()}
                  title="به‌روزرسانی"
                >
                  <RefreshCw size={17} />
                </Button>
              </div>
              <button
                className={`add-place-button min-h-[42px] flex items-center justify-center gap-[8px] m-[0_16px_12px] text-[#0f766e] [background:#eaf8f5] [border:1px_dashed_#79cabb] rounded-[10px] text-[11px] font-bold [&:hover]:text-[#fff] [&:hover]:[background:#0f766e] [&:hover]:[border-color:#0f766e] [&.active]:text-[#fff] [&.active]:[background:#0f766e] [&.active]:[border-color:#0f766e] ${placementMode ? "active" : ""}`}
                onClick={startPlacement}
              >
                <Plus size={17} /> افزودن مکان از روی نقشه
              </button>
              <div className="search-box h-[40px] flex items-center gap-[8px] m-[0_16px_12px] p-[0_11px] text-[#9ba4b3] [background:#f7f8fa] [border:1px_solid_#e7e9ee] rounded-[9px] [&_input]:h-[auto] [&_input]:p-0 [&_input]:bg-transparent [&_input]:[border:0] [&_input]:[box-shadow:none] [&_input]:text-[11px]">
                <Search size={17} />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="جست‌وجوی نام مکان"
                />
              </div>
              <div className="driver-list min-h-0 [flex:1_1_auto] overflow-y-auto overscroll-contain [scrollbar-gutter:stable] p-[0_9px] place-list [&.place-list]:p-[0_9px_8px]">
                {visiblePlaces.map((place) => (
                  <div
                    key={place.id}
                    className={`place-item flex items-center gap-[4px] p-[5px] [border:1px_solid_transparent] rounded-[10px] [&:hover]:[background:#f8fafc] [&.selected.selected]:[background:#f1edfb] [&.selected.selected]:[border-color:#ddd2f5] ${selectedPlaceId === place.id ? "selected" : ""}`}
                  >
                    <button
                      className="place-item-main min-w-0 flex-1 flex items-center gap-[10px] p-[5px] bg-transparent [border:0] text-right"
                      onClick={() => selectPlace(place.id)}
                    >
                      <span className="place-avatar flex-none w-[34px] h-[34px] grid place-items-center text-[#6544ba] [background:#eee9fa] rounded-[10px]">
                        <MapPinned size={17} />
                      </span>
                      <span className="driver-info min-w-0 flex flex-1 flex-col gap-[5px] [&_b]:overflow-hidden [&_b]:text-[#293448] [&_b]:text-[11px] [&_b]:whitespace-nowrap [&_b]:text-ellipsis [&_small]:text-[#8a95a6] [&_small]:text-[9px]">
                        <b>{place.name}</b>
                        <small>مکان ذخیره‌شده</small>
                      </span>
                    </button>
                    <span className="place-actions flex gap-[1px] [&_button]:w-[30px] [&_button]:h-[30px] [&_button]:grid [&_button]:place-items-center [&_button]:p-0 [&_button]:text-[#667085] [&_button]:bg-transparent [&_button]:[border:0] [&_button]:rounded-[7px] [&_button:hover]:text-[#0f766e] [&_button:hover]:[background:#eaf8f5] [&_button.danger:hover]:text-[#b42318] [&_button.danger:hover]:[background:#fff0ef]">
                      <button
                        className="danger"
                        onClick={() => deletePlace(place)}
                        title="حذف"
                      >
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </div>
                ))}
                {!visiblePlaces.length && (
                  <div className="empty-state p-[30px_12px] text-[#8b96a7] text-center text-[11px]">
                    مکانی با این نام پیدا نشد.
                  </div>
                )}
              </div>
              {selectedPlace && (
                <div className="selected-driver flex flex-col gap-[5px] m-[10px] p-[12px] text-[#526174] [background:#f7f9fc] [border:1px_solid_#e6eaf0] rounded-[10px] text-[9px] [&_b]:text-[#1c293c] [&_b]:text-[11px] [&_small]:text-[#8d97a7]">
                  <span>مکان انتخاب‌شده</span>
                  <b>{selectedPlace.name}</b>
                </div>
              )}
            </aside>
          </section>
        ) : (
          <>
            {historyPanel}
            <section className="users-map-card">
              <div className="users-map-panel">
                <LiveMap
                  key="users-map"
                  locations={driverLocations}
                  history={history.points}
                  historyLoading={history.loading || (history.rangeActive && history.dayLoading)}
                  focusRequest={mapFocusRequest}
                  focusTarget={mapFocusTarget}
                  selectedId={selectedId}
                  onSelect={selectDriver}
                  onHistoryRequest={fetchHistory}
                  historyStatuses={history.statuses}
                />
                <div className="users-map-heading"><Truck size={17} /><b>موقعیت پیک‌ها</b><span>{driverLocations.length.toLocaleString("fa-IR")} پیک دارای موقعیت</span></div>
                <MapLegend showPlaces={false} />
              </div>
              <UserManagementPanel
                users={users}
                locations={locationsByDriverId}
                adminId={admin?.id}
                selectedId={selectedId}
                search={search}
                deletingIds={deletingUserIds}
                updatingIds={updatingUserIds}
                onSearch={setSearch}
                onAdd={() => setShowAddUser(true)}
                onSelect={selectDriver}
                onToggleStatus={toggleStatus}
                onDelete={deleteUser}
              />
            </section>
          </>
        )}
      </main>
      {showAddUser && token && (
        <AddUserModal
          token={token}
          onClose={() => setShowAddUser(false)}
          onCreated={(newUser) => {
            setUsers((current) => [newUser, ...current]);
            setShowAddUser(false);
          }}
        />
      )}
      {token && draftCoordinates && (
        <PlaceModal
          token={token}
          coordinates={draftCoordinates}
          onClose={closePlaceModal}
          onSaved={savePlace}
        />
      )}
    </div>
  );
}
