"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays,
  CarFront, Check, ChevronDown, CircleHelp, Clock3, Command, Compass, CreditCard,
  LayoutDashboard, LogOut, MapPin, Menu, ParkingSquare,
  Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles,
  Wifi, WifiOff, X,
} from "lucide-react";

type User = { id: number; name: string; email: string; role: "Admin" | "User" };
type Lot = { lotId: number; name: string; location: string; capacity: number; occupied: number; available: number; maintenance: number; slots: { slotId: number; number: string; status: string }[] };
type Sensor = { sensorId: string; slotId: number; lotId: number; status: string; vehicleDetected: boolean; timestamp: string };
type Reservation = { reservationId: number; lotName: string; location: string; slot: string; start: string; end: string; status: string; vehicle: string; customer: string; hourlyRate: number; estimatedCharge: number; amount?: number; paymentStatus?: string };
type Dashboard = { stats: { available: number; occupied: number; capacity: number; reservations: number; revenue: number; occupancy: number }; lots: Lot[]; sensors: Sensor[]; reservations: Reservation[]; sensorConnection: boolean; sensorConflicts: number; ratePerHour: number; remindersEnabled: boolean };

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const preciseMoney = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dateLabel = (value: string) => new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [menu, setMenu] = useState("Overview");
  const [query, setQuery] = useState("");
  const [lotFilter, setLotFilter] = useState("All locations");
  const [showBooking, setShowBooking] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [updatingSlot, setUpdatingSlot] = useState<number | null>(null);
  const [cancellingReservation, setCancellingReservation] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (response.status === 401) { setUser(null); setDashboard(null); return; }
    if (!response.ok) throw new Error("Could not load the parking dashboard.");
    const data = await response.json();
    setUser(data.user);
    setDashboard(data.dashboard);
  }, []);

  useEffect(() => {
    refresh().catch(() => setNotice("Connect your databases to load the live dashboard."))
      .finally(() => setLoading(false));
  }, [refresh]);

  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setAuthError(""); setAuthBusy(true);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch(`/api/auth/${authMode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign in failed.");
      setUser(result.user); setLoading(true); await refresh();
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Something went wrong."); }
    finally { setAuthBusy(false); setLoading(false); }
  };

  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); setDashboard(null); };

  const filteredLots = useMemo(() => (dashboard?.lots ?? []).filter((lot) => {
    const matchQuery = `${lot.name} ${lot.location}`.toLowerCase().includes(query.toLowerCase());
    return matchQuery && (lotFilter === "All locations" || lot.name === lotFilter);
  }), [dashboard, query, lotFilter]);

  const createReservation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBookingBusy(true); setBookingMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not reserve this slot.");
      setBookingMessage("Your space is reserved. It is now listed in your upcoming stays.");
      await refresh();
      window.setTimeout(() => { setShowBooking(false); setBookingMessage(""); }, 1300);
    } catch (error) { setBookingMessage(error instanceof Error ? error.message : "Could not create reservation."); }
    finally { setBookingBusy(false); }
  };

  const updateSlot = async (slotId: number, status: "Available" | "Maintenance") => {
    setUpdatingSlot(slotId);
    try {
      const response = await fetch(`/api/admin/slots/${slotId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update this space.");
      await refresh();
      setNotice(`Space status changed to ${status.toLowerCase()}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not update this space."); }
    finally { setUpdatingSlot(null); }
  };

  const cancelReservation = async (reservationId: number) => {
    if (!window.confirm("Cancel this reservation? This cannot be undone.")) return;
    setCancellingReservation(reservationId);
    try {
      const response = await fetch("/api/reservations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not cancel this reservation.");
      await refresh();
      setNotice("Reservation cancelled. The space is available again.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not cancel this reservation.");
    } finally {
      setCancellingReservation(null);
    }
  };

  if (loading) return <div className="loading-screen"><span className="brand-mark"><ParkingSquare size={23} /></span><span>Loading ParkWise</span></div>;
  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={submitAuth} error={authError} busy={authBusy} />;
  if (!dashboard) return <div className="loading-screen"><span className="brand-mark"><ParkingSquare size={23} /></span><span>{notice || "Connecting to ParkWise…"}</span><button className="button button-dark" onClick={() => refresh().catch(() => setNotice("Check your MySQL settings and try again."))}>Try again</button></div>;

  const firstName = user.name.split(" ")[0];
  const navItems = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Lots & spaces", icon: ParkingSquare },
    { label: "Reservations", icon: CalendarDays },
    ...(user.role === "Admin" ? [{ label: "Operations", icon: SlidersHorizontal }] : []),
  ];
  const visibleReservations = dashboard.reservations.filter((item) => `${item.customer} ${item.lotName} ${item.slot} ${item.vehicle}`.toLowerCase().includes(query.toLowerCase()));
  const navTo = (label: string) => { setMenu(label); setMobileNav(false); document.getElementById(label === "Lots & spaces" ? "lots" : label === "Reservations" ? "reservations" : label === "Operations" ? "operations" : "top")?.scrollIntoView({ behavior: "smooth" }); };

  return <main id="top" className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><span className="brand-mark"><ParkingSquare size={21} strokeWidth={2.4} /></span><span>parkwise<span className="brand-period">.</span></span><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={19} /></button></div>
      <div className="workspace-switch"><span className="workspace-avatar">P</span><span className="workspace-copy"><b>ParkWise Central</b><small>Workspace</small></span></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="nav-list">{navItems.map(({ label, icon: Icon }) => <button key={label} className={`nav-link ${menu === label ? "active" : ""}`} onClick={() => navTo(label)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === "Reservations" && <span className="nav-count">{dashboard.stats.reservations}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon"><CircleHelp size={17} /></span><b>Need a hand?</b><p>For setup help, see the README in your project folder.</p></div><div className="profile-row"><div className="profile-avatar">{initials(user.name)}</div><div className="profile-copy"><b>{user.name}</b><small>{user.role} account</small></div></div></div>
    </aside>

    <section className="main-column">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20} /></button><span>Workspace</span><span className="crumb-slash">/</span><b>{menu}</b></div><div className="topbar-actions"><button className="top-search" onClick={() => document.getElementById("global-search")?.focus()}><Search size={16} /><span>Search anything</span></button><span className="topbar-divider" /><button className="top-profile" onClick={signOut} title="Sign out" aria-label="Sign out"><span className="profile-avatar profile-avatar-small">{initials(user.name)}</span><LogOut size={14} /></button></div></header>
      {notice && <div className="notice-bar"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
      <div className="content-wrap">
        <div className="welcome-row"><div><div className="eyebrow"><span className="live-dot" /> {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()}</div><h1>{new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening"}, {firstName}<span className="wave">✦</span></h1><p className="welcome-subtitle">Here’s what’s happening across your parking network today.</p></div><div className="welcome-actions"><button className="button button-light" onClick={() => { setNotice("Dashboard data refreshed from MySQL and MongoDB."); refresh(); }}><Activity size={16} /> Refresh data</button><button className="button button-dark" onClick={() => { setShowBooking(true); setBookingMessage(""); }}><Plus size={17} /> Reserve a space</button></div></div>

        <div className="metric-grid">
          <MetricCard label="Available spaces" value={dashboard.stats.available.toString().padStart(2, "0")} note={`${dashboard.stats.capacity} total spaces`} icon={<ParkingSquare size={18} />} trend={dashboard.stats.capacity ? `${Math.round(dashboard.stats.occupancy)}% occupied` : "No spaces yet"} good />
          <MetricCard label="Active reservations" value={dashboard.stats.reservations.toString().padStart(2, "0")} note="Across all locations" icon={<CalendarDays size={18} />} trend="Live from MySQL" />
          <MetricCard label="Collected revenue" value={money.format(dashboard.stats.revenue)} note="Paid parking sessions" icon={<CreditCard size={18} />} trend="From completed payments" />
          <MetricCard label="Sensor network" value={dashboard.sensorConnection ? `${dashboard.sensors.length.toString().padStart(2, "0")}` : "—"} note={dashboard.sensorConnection ? "Devices in latest feed" : "Feed unavailable"} icon={<Activity size={18} />} trend={dashboard.sensorConnection ? `${dashboard.sensors.filter((s) => s.status.toLowerCase() === "working").length} online · ${dashboard.sensors.filter((s) => s.status.toLowerCase() !== "working").length} offline` : "Check MongoDB connection"} alert={dashboard.sensorConnection && dashboard.sensors.some((s) => s.status.toLowerCase() !== "working")} />
        </div>

        <div className="section-heading"><div><div className="section-kicker">YOUR NETWORK</div><h2>Parking locations</h2></div><button className="text-button" onClick={() => navTo("Lots & spaces")}>View all locations <ArrowRight size={15} /></button></div>
        <div className="lot-toolbar"><div className="field-search"><Search size={16} /><input id="global-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search locations, vehicles, reservations…" /></div><label className="select-wrap"><Compass size={15} /><select value={lotFilter} onChange={(event) => setLotFilter(event.target.value)}><option>All locations</option>{dashboard.lots.map((lot) => <option key={lot.lotId}>{lot.name}</option>)}</select><ChevronDown size={14} /></label></div>

        <div id="lots" className="lot-grid">{filteredLots.length ? filteredLots.map((lot, index) => <LotCard key={lot.lotId} lot={lot} accent={index % 3} ratePerHour={dashboard.ratePerHour} onBook={() => { setShowBooking(true); setBookingMessage(""); }} />) : <div className="empty-state">No parking locations match that search.</div>}</div>

        {user.role === "Admin" && <section id="operations" className="operations-panel"><div className="section-heading"><div><div className="section-kicker">ADMIN TOOLS</div><h2>Space management</h2></div><span className="admin-chip"><ShieldCheck size={13} /> ADMIN</span></div><p className="operations-description">Temporarily take an available space out of service, or return it to the lot. Occupied and reserved spaces stay protected.</p><div className="slot-management-grid">{dashboard.lots.flatMap((lot) => lot.slots.map((slot) => <div className="managed-slot" key={slot.slotId}><div><b>{slot.number}</b><small>{lot.name}</small></div><span className={`slot-state state-${slot.status.toLowerCase()}`}>{slot.status}</span>{slot.status !== "Occupied" && <button disabled={updatingSlot === slot.slotId} onClick={() => updateSlot(slot.slotId, slot.status === "Maintenance" ? "Available" : "Maintenance")}>{updatingSlot === slot.slotId ? "Saving…" : slot.status === "Maintenance" ? "Return to service" : "Set maintenance"}</button>}</div>))}</div></section>}

        <div className="content-split">
          <section id="reservations" className="panel reservation-panel"><div className="panel-heading"><div><div className="section-kicker">KEEP THINGS MOVING</div><h2>{user.role === "Admin" ? "Recent reservations" : "Your reservations"}</h2><p className="reminder-status">{dashboard.remindersEnabled ? "Email reminder scheduled 1 hour before each reservation." : "Add Resend email settings to .env.local to enable reminders."}</p></div></div><div className="table-wrap"><table className="reservation-table"><thead><tr><th>DRIVER</th><th>LOCATION</th><th>TIME</th><th>ESTIMATED CHARGE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{visibleReservations.slice(0, 5).map((reservation) => <tr key={reservation.reservationId}><td><div className="driver-cell"><span className="driver-avatar">{initials(reservation.customer)}</span><span><b>{reservation.customer}</b><small>{reservation.vehicle}</small></span></div></td><td><div className="location-cell"><b>{reservation.lotName}</b><small>Space {reservation.slot}</small></div></td><td><div className="time-cell"><b>{time(reservation.start)}</b><small>{dateLabel(reservation.start)} · {time(reservation.end)}</small></div></td><td><div className="time-cell"><b>{preciseMoney.format(reservation.estimatedCharge)}</b><small>{preciseMoney.format(reservation.hourlyRate)} / hour</small></div></td><td><StatusPill status={reservation.status} /></td><td>{reservation.status === "Active" ? <button className="cancel-reservation" onClick={() => cancelReservation(reservation.reservationId)} disabled={cancellingReservation === reservation.reservationId}>{cancellingReservation === reservation.reservationId ? "Cancelling…" : "Cancel"}</button> : <span className="no-action">—</span>}</td></tr>)}</tbody></table>{visibleReservations.length === 0 && <div className="empty-table">No reservations to show yet.</div>}</div></section>
          <section id="sensors" className="panel sensors-panel"><div className="panel-heading"><div><div className="section-kicker">LATEST SENSOR READINGS</div><h2>Sensor activity</h2></div><span className={`connection-pill ${dashboard.sensorConnection ? "connected" : "disconnected"}`}>{dashboard.sensorConnection ? <><span className="live-dot" /> CONNECTED</> : <><WifiOff size={12} /> OFFLINE</>}</span></div><div className="sensor-summary"><div className="sensor-summary-icon"><Wifi size={18} /></div><div><b>{dashboard.sensorConnection ? "Your sensor network" : "Sensor data not connected"}</b><small>{dashboard.sensorConnection ? `${dashboard.sensors.length} devices in the latest feed` : "Add MongoDB settings to .env.local"}</small></div><button className="icon-button" onClick={() => refresh()} aria-label="Refresh sensors"><Activity size={16} /></button></div><div className="sensor-list">{dashboard.sensors.slice(0, 5).map((sensor) => <div className="sensor-row" key={`${sensor.sensorId}-${sensor.timestamp}`}><span className={`sensor-indicator ${sensor.status.toLowerCase() === "working" ? "sensor-ok" : "sensor-down"}`}><Activity size={13} /></span><span className="sensor-detail"><b>{sensor.sensorId}</b><small>Lot {sensor.lotId} · space {sensor.slotId} · {sensor.vehicleDetected ? "vehicle detected" : "space clear"}</small></span><span className="sensor-time">{dateLabel(sensor.timestamp)} · {time(sensor.timestamp)}</span></div>)}{dashboard.sensors.length === 0 && <div className="empty-sensors">{dashboard.sensorConnection ? "No readings yet. Import the supplied sensor JSON." : "Sensor readings will appear when MongoDB is connected."}</div>}</div>{dashboard.sensorConflicts > 0 && <div className="sensor-warning"><Sparkles size={15} /><span>{dashboard.sensorConflicts} sensor reading{dashboard.sensorConflicts > 1 ? "s" : ""} differ from the database slot status.</span></div>}</section>
        </div>
        <footer className="page-footer"><span>© {new Date().getFullYear()} ParkWise</span><span><span className="footer-status" /> MySQL connected</span><span>v1.0.0</span></footer>
      </div>
    </section>

    {showBooking && <BookingModal lots={dashboard.lots} ratePerHour={dashboard.ratePerHour} onClose={() => setShowBooking(false)} onSubmit={createReservation} busy={bookingBusy} message={bookingMessage} />}
  </main>;
}

function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase(); }

function AuthScreen({ mode, setMode, onSubmit, error, busy }: { mode: "login" | "register"; setMode: (mode: "login" | "register") => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; error: string; busy: boolean }) {
  return <main className="auth-shell"><div className="auth-visual"><div className="auth-brand"><span className="brand-mark"><ParkingSquare size={22} /></span>parkwise<span className="brand-period">.</span></div><div className="auth-copy"><span className="auth-label"><span className="live-dot" /> PARKING, WITH A LITTLE MORE CLARITY</span><h1>Your space.<br />Your time.<br /><em>ParkWise.</em></h1><p>One calm place to find a spot, plan your day, and keep every parking space moving.</p></div><div className="auth-orbit"><div className="orbit-ring orbit-one" /><div className="orbit-ring orbit-two" /><span className="orbit-center"><ParkingSquare size={31} /></span><span className="orbit-chip chip-a"><span className="orbit-dot" /> Space availability</span><span className="orbit-chip chip-b"><MapPin size={14} /> Central Mall</span><span className="orbit-chip chip-c"><Activity size={15} /> Sensor insights</span></div><div className="auth-bottom"><span>Designed for a smoother arrival.</span><span>01 — 03</span></div></div><div className="auth-form-side"><div className="auth-form-top"><span>{mode === "login" ? "Need an account?" : "Already have an account?"}</span><button onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Create account" : "Sign in"}</button></div><form className="auth-card" onSubmit={onSubmit}><span className="auth-mini-icon"><Command size={17} /></span><div className="auth-welcome">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</div><h2>{mode === "login" ? "Sign in to ParkWise" : "Create your account"}</h2><p>{mode === "login" ? "Your parking network is just a moment away." : "Join your parking network in a few easy steps."}</p>{mode === "register" && <><label className="form-field"><span>Full name</span><input name="name" placeholder="e.g. Alex Morgan" autoComplete="name" required minLength={2} /></label><label className="form-field"><span>Phone number</span><input name="phone" type="tel" placeholder="e.g. +91 98765 43210" autoComplete="tel" required minLength={7} /></label><label className="form-field"><span>Vehicle number</span><input name="vehicleNumber" placeholder="e.g. KA01AB1234" autoComplete="off" required minLength={3} /></label></>}<label className="form-field"><span>Email address</span><input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label><label className="form-field"><span>Password</span><input name="password" type="password" placeholder={mode === "register" ? "At least 8 characters" : "Enter your password"} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : 1} /></label>{error && <div className="form-error">{error}</div>}<button className="button button-dark auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? <>Sign in <ArrowRight size={16} /></> : <>Create account <ArrowRight size={16} /></>}</button><div className="auth-legal">Your account details are used only to manage parking reservations.</div></form><div className="auth-footnote"><ShieldCheck size={15} /> Your information stays protected and encrypted.</div></div></main>;
}

function MetricCard({ label, value, note, icon, trend, good, alert }: { label: string; value: string; note: string; icon: React.ReactNode; trend: string; good?: boolean; alert?: boolean }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-number">{value}</div><div className="metric-bottom"><span>{note}</span><span className={`metric-trend ${good ? "trend-good" : alert ? "trend-alert" : ""}`}>{good ? <ArrowUpRight size={13} /> : alert ? <ArrowDownRight size={13} /> : <span className="trend-dot" />}{trend}</span></div></div>;
}

function LotCard({ lot, accent, ratePerHour, onBook }: { lot: Lot; accent: number; ratePerHour: number; onBook: () => void }) {
  const percent = lot.capacity ? Math.round((lot.occupied / lot.capacity) * 100) : 0;
  return <article className={`lot-card lot-accent-${accent}`}><div className="lot-art"><div className="lot-art-grid" /><div className="lot-art-shape" /><span className="lot-art-label"><MapPin size={12} /> {lot.location || "Location details"}</span><span className="lot-open-badge"><i /> {lot.available} open</span><div className="parking-glyph"><span>P</span><span className="parking-stripe" /></div><button className="lot-arrow" aria-label={`Reserve at ${lot.name}`} onClick={onBook}><ArrowUpRight size={17} /></button></div><div className="lot-card-body"><div className="lot-title-row"><h3>{lot.name}</h3><span className="lot-rate">{preciseMoney.format(ratePerHour)} / hour</span></div><div className="lot-subtitle"><span><CarFront size={14} /> {lot.capacity} total spaces</span><span className="space-count"><span className="rate-dot" /> {lot.available} spaces open</span></div><div className="occupancy-row"><span>Occupancy</span><b>{percent}%</b></div><div className="progress-track"><span style={{ width: `${percent}%` }} /></div><div className="lot-card-bottom"><span>{lot.occupied} occupied <span className="subtle-dot">·</span> {lot.available} available</span><button onClick={onBook}>Reserve <ArrowRight size={13} /></button></div></div></article>;
}

function StatusPill({ status }: { status: string }) { const state = status.toLowerCase(); return <span className={`status-pill ${state}`}><i />{status}</span>; }

function BookingModal({ lots, ratePerHour, onClose, onSubmit, busy, message }: { lots: Lot[]; ratePerHour: number; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; busy: boolean; message: string }) {
  const defaultStart = new Date(Date.now() + 15 * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const defaultEnd = new Date(Date.now() + 75 * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const durationHours = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 3_600_000;
  const estimatedCharge = durationHours > 0 ? Math.round(ratePerHour * durationHours * 100) / 100 : null;
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="booking-modal"><div className="modal-heading"><div><div className="section-kicker">MAKE IT YOURS</div><h2>Reserve a space</h2><p>Pick a location and vehicle to get started.</p></div><button className="icon-button" onClick={onClose} aria-label="Close reservation form"><X size={19} /></button></div><form onSubmit={onSubmit}><label className="form-field"><span>Parking location</span><select name="lotId" required defaultValue=""><option value="" disabled>Choose a location</option>{lots.map((lot) => <option key={lot.lotId} value={lot.lotId} disabled={lot.available === 0}>{lot.name} · {lot.available} open</option>)}</select></label><label className="form-field"><span>Your vehicle number</span><input name="vehicleNumber" placeholder="e.g. KA01AB1234" required minLength={3} /></label><div className="modal-time-grid"><label className="form-field"><span>Start time</span><input name="startTime" type="datetime-local" required value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label className="form-field"><span>End time</span><input name="endTime" type="datetime-local" required value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div><div className="price-estimate"><span>{preciseMoney.format(ratePerHour)} per hour</span><b>{estimatedCharge === null ? "Choose an end time after the start" : `Estimated total: ${preciseMoney.format(estimatedCharge)}`}</b></div>{message && <div className={message.startsWith("Your space") ? "form-success" : "form-error"}>{message.startsWith("Your space") && <Check size={15} />}{message}</div>}<div className="modal-note"><Clock3 size={15} /> Estimate is based on your selected reservation duration.</div><button className="button button-dark auth-submit" disabled={busy || lots.length === 0}>{busy ? "Reserving…" : <>Confirm reservation <ArrowRight size={16} /></>}</button></form></section></div>;
}
