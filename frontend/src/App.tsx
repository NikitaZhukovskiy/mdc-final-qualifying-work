import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import {
  clearSession,
  getSession,
  hasPermission,
  roleLabel,
  saveSession,
  type SessionUser,
} from "./auth";
import { BrandLogo } from "./components/BrandLogo";
import { UserAvatar } from "./components/UserAvatar";
import { EquipmentDetail } from "./pages/EquipmentDetail";
import { EquipmentList } from "./pages/EquipmentList";
import { LoginPage } from "./pages/LoginPage";
import { OperatorApp } from "./pages/operator/OperatorApp";
import { OperatorLogin } from "./pages/operator/OperatorLogin";
import { RealTimeMonitoring } from "./pages/RealTimeMonitoring";
import { RealtimeCncMonitoring } from "./pages/RealtimeCncMonitoring";
import { RealtimeFurnaceMonitoring } from "./pages/RealtimeFurnaceMonitoring";
import { RegisterPage } from "./pages/RegisterPage";
import { AdminDashboard } from "./pages/AdminDashboard";
import { ThermoBatchCreate } from "./pages/ThermoBatchCreate";
import { ThermoBatchDetail } from "./pages/ThermoBatchDetail";
import { ThermoProcessing } from "./pages/ThermoProcessing";
import { ReportsDashboard } from "./pages/ReportsDashboard";
import { CncReports } from "./pages/CncReports";
import { CncEfficiencyReport } from "./pages/CncEfficiencyReport";
import { CncOeeReport } from "./pages/CncOeeReport";
import { ThermoReports } from "./pages/ThermoReports";
import { ThermoTimeReport } from "./pages/ThermoTimeReport";

type ThemeMode = "dark" | "light";

function ThemeGlyph({ theme }: { theme: ThemeMode }) {
  if (theme === "light") {
    return (
      <svg className="theme-icon-svg" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="4.1" className="theme-sun-core" />
        <polygon points="12,1.4 14.2,5.8 9.8,5.8" className="theme-sun-ray" />
        <polygon points="22.6,12 18.2,14.2 18.2,9.8" className="theme-sun-ray" />
        <polygon points="12,22.6 14.2,18.2 9.8,18.2" className="theme-sun-ray" />
        <polygon points="1.4,12 5.8,14.2 5.8,9.8" className="theme-sun-ray" />
        <polygon points="19.4,4.6 17.4,8.2 15.8,6.6" className="theme-sun-ray" />
        <polygon points="19.4,19.4 15.8,17.4 17.4,15.8" className="theme-sun-ray" />
        <polygon points="4.6,19.4 8.2,17.4 6.6,15.8" className="theme-sun-ray" />
        <polygon points="4.6,4.6 6.6,8.2 8.2,6.6" className="theme-sun-ray" />
      </svg>
    );
  }
  return (
    <svg className="theme-icon-svg" viewBox="0 0 24 24" aria-hidden>
      <path
        className="theme-moon"
        d="M15.5 2.5c-3.5.5-6.3 3.6-6.3 7.3 0 4 3.3 7.3 7.4 7.3 1.3 0 2.6-.3 3.7-.9-1.3 3.1-4.4 5.3-8 5.3-4.8 0-8.7-3.9-8.7-8.7 0-4.9 3.9-8.8 8.8-8.8 1.2 0 2.2.2 3.1.5Z"
      />
    </svg>
  );
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("mdc-theme");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mdc-theme", theme);
  }, [theme]);

  const [session, setSession] = useState<SessionUser | null>(() => getSession());
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  function onLoginMain(next: SessionUser) {
    const s: SessionUser = { ...next, entry: "main" };
    saveSession(s);
    setSession(s);
  }

  function onLogout() {
    clearSession();
    setSession(null);
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!profileRef.current || !target) return;
      if (!profileRef.current.contains(target)) setProfileOpen(false);
    }
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, []);

  if (!session) {
    return (
      <Routes>
        <Route
          path="/operator/login"
          element={<OperatorLogin onAuthed={(s) => setSession(s)} />}
        />
        <Route
          path="/login"
          element={<LoginPage onLogin={onLoginMain} alreadyLoggedIn={false} />}
        />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (session.entry === "operator") {
    return (
      <Routes>
        <Route path="/operator" element={<OperatorApp session={session} onLogout={onLogout} />} />
        <Route path="*" element={<Navigate to="/operator" replace />} />
      </Routes>
    );
  }

  const profileName = session.displayName;
  const showEquipment = hasPermission(session, "nav_equipment");
  const showRealtime = hasPermission(session, "nav_realtime");
  const showThermo =
    hasPermission(session, "nav_thermo") &&
    (session.role === "admin" || session.role === "user" || session.role === "term");
  const showReports = hasPermission(session, "nav_realtime");
  const showAdmin = session.role === "admin" && hasPermission(session, "nav_admin");

  return (
    <div className="layout">
      <header className="header">
        <NavLink to="/" className="brand">
          <BrandLogo />
          <span className="brand-text-wrap">
            <span className="brand-title">NEXA</span>
            <span className="brand-subtext">Промышленный мониторинг</span>
          </span>
        </NavLink>
        <div className="header-actions">
          <nav className="nav">
            {showEquipment && (
              <NavLink
                to="/"
                end
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              >
                Оборудование
              </NavLink>
            )}
            {showRealtime && (
              <NavLink
                to="/realtime"
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              >
                Мониторинг в реальном времени
              </NavLink>
            )}
            {showThermo && (
              <NavLink
                to="/thermo"
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              >
                Термообработка
              </NavLink>
            )}
            {showReports && (
              <NavLink
                to="/reports"
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              >
                Отчеты
              </NavLink>
            )}
          </nav>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            aria-label={theme === "light" ? "Светлая тема" : "Тёмная тема"}
          >
            <ThemeGlyph theme={theme} />
            <span className="sr-only">
              {theme === "light" ? "Светлая тема" : "Тёмная тема"}
            </span>
          </button>
          <div className="profile-wrap" ref={profileRef}>
            <button
              type="button"
              className="profile-btn"
              onClick={() => setProfileOpen((x) => !x)}
              aria-label="Открыть профиль"
            >
              <UserAvatar />
            </button>
            {profileOpen && (
              <div className="profile-popover">
                <p className="profile-line">
                  <strong>ФИО:</strong> {profileName}
                </p>
                <p className="profile-line">
                  <strong>Роль:</strong> {roleLabel(session.role)}
                </p>
                <button type="button" className="logout-btn" onClick={onLogout}>
                  Выйти
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {showAdmin && (
        <div className="admin-entry-row">
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              isActive ? "admin-entry-link admin-entry-link--active" : "admin-entry-link"
            }
          >
            Администрирование
          </NavLink>
        </div>
      )}
      <main className="main">
        <Routes>
          <Route
            path="/operator/login"
            element={
              session.entry === "operator" ? (
                <Navigate to="/operator" replace />
              ) : (
                <OperatorLogin onAuthed={(s) => setSession(s)} />
              )
            }
          />
          <Route path="/operator" element={<Navigate to="/operator/login" replace />} />
          <Route path="/" element={<EquipmentList role={session.role} />} />
          <Route path="/realtime" element={<RealTimeMonitoring role={session.role} />} />
          <Route path="/realtime/cnc" element={<RealtimeCncMonitoring role={session.role} />} />
          <Route path="/realtime/furnaces" element={<RealtimeFurnaceMonitoring role={session.role} />} />
          <Route path="/thermo" element={<ThermoProcessing session={session} />} />
          <Route path="/thermo/new/:furnaceId" element={<ThermoBatchCreate role={session.role} />} />
          <Route path="/thermo/batch/:batchId" element={<ThermoBatchDetail role={session.role} />} />
          <Route path="/reports" element={showReports ? <ReportsDashboard /> : <Navigate to="/" replace />} />
          <Route path="/reports/cnc" element={showReports ? <CncReports /> : <Navigate to="/" replace />} />
          <Route
            path="/reports/cnc/efficiency"
            element={showReports ? <CncEfficiencyReport /> : <Navigate to="/" replace />}
          />
          <Route path="/reports/cnc/oee" element={showReports ? <CncOeeReport /> : <Navigate to="/" replace />} />
          <Route path="/reports/thermo" element={showReports ? <ThermoReports /> : <Navigate to="/" replace />} />
          <Route path="/reports/thermo/time" element={showReports ? <ThermoTimeReport /> : <Navigate to="/" replace />} />
          <Route path="/equipment/:id" element={<EquipmentDetail role={session.role} />} />
          <Route
            path="/admin"
            element={showAdmin ? <AdminDashboard /> : <Navigate to="/" replace />}
          />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
