import { createBrowserRouter, Navigate, redirect } from "react-router"
import AppShell from "@/components/layout/AppShell"
import { DEMO_MODE } from "@/config"
import { CallAnalysisProvider } from "@/context/CallAnalysisContext"
import LoginPage from "@/features/auth/LoginPage"
import { getSession } from "@/lib/auth"
import HomePage from "@/pages/HomePage"
import LivePage from "@/pages/LivePage"
import ProfilePage from "@/pages/ProfilePage"
import RiskPage from "@/pages/RiskPage"

function ProtectedApp() {
  return (
    <CallAnalysisProvider>
      <AppShell />
    </CallAnalysisProvider>
  )
}

async function requireSession() {
  if (DEMO_MODE) return null
  const session = await getSession()
  if (!session) throw redirect("/login")
  return session
}

export const router = createBrowserRouter([
  { path: "/login", Component: LoginPage },
  {
    path: "/app",
    Component: ProtectedApp,
    loader: requireSession,
    children: [
      { index: true, element: <Navigate to="home" replace /> },
      { path: "home", Component: HomePage },
      { path: "live", Component: LivePage },
      { path: "risk", Component: RiskPage },
      { path: "profile", Component: ProfilePage },
    ],
  },
  { path: "*", element: <Navigate to="/login" replace /> },
])
