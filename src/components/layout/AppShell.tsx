import { ShieldCheck } from "lucide-react"
import { NavLink, Outlet } from "react-router"
import { APP_NAME, DEMO_MODE } from "@/config"
import VideoBackground from "@/components/VideoBackground"
import PhoenixMark from "@/components/ui/PhoenixMark"

const navItems = [
  { to: "/app/home", label: "Home" },
  { to: "/app/live", label: "Live" },
  { to: "/app/risk", label: "Explanation" },
  { to: "/app/profile", label: "Profile" },
]

export default function AppShell() {
  return (
    <div className="app-shell">
      <VideoBackground />
      <header className="topbar">
        <NavLink
          to="/app/home"
          className="brand"
          aria-label={`${APP_NAME} home`}
        >
          <span className="brand-mark">
            <PhoenixMark />
          </span>
          <span>{APP_NAME}</span>
        </NavLink>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="status-group">
          {DEMO_MODE && <span className="demo-pill">Demo mode</span>}
          <span className="protected-pill">
            <ShieldCheck aria-hidden="true" /> Protected
          </span>
        </div>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  )
}
