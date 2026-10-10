import { useEffect, useState } from "react"
import {
  Clock3,
  History,
  LockKeyhole,
  LogOut,
  Mail,
  ShieldAlert,
  User,
} from "lucide-react"
import { useNavigate } from "react-router"
import Button from "@/components/ui/Button"
import Card from "@/components/ui/Card"
import { accountApi } from "@/lib/api"
import { signOut } from "@/lib/auth"
import type { SavedAnalysis } from "@/types/profile"

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Recent analysis"
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [history, setHistory] = useState<SavedAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    let active = true
    void accountApi
      .get()
      .then((account) => {
        if (!active) return
        setEmail(account.profile.email)
        setHistory(account.analyses)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load your account.",
        )
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const logout = async () => {
    setLoggingOut(true)
    setError("")
    try {
      await signOut()
      navigate("/login")
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not log you out.",
      )
      setLoggingOut(false)
    }
  }

  return (
    <div className="page profile-page">
      <header className="page-header">
        <div>
          <div className="section-kicker">YOUR ACCOUNT</div>
          <h1>
            <span className="title-icon">
              <User aria-hidden="true" />
            </span>{" "}
            User details
          </h1>
          <p>Only the details used to log in are shown here.</p>
        </div>
      </header>

      <Card className="account-card">
        {loading ? (
          <div className="profile-loading">Loading your secure account...</div>
        ) : (
          <div className="account-details">
            <div className="account-detail">
              <span className="account-detail-icon">
                <Mail aria-hidden="true" />
              </span>
              <div>
                <span>Email or username</span>
                <strong>{email || "Not available"}</strong>
              </div>
            </div>
            <div className="account-detail">
              <span className="account-detail-icon">
                <LockKeyhole aria-hidden="true" />
              </span>
              <div>
                <span>Password</span>
                <strong>Protected and never displayed</strong>
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="inline-error account-error" role="alert">
            {error}
          </div>
        )}
        <div className="account-logout">
          <p>Sign out of Falcon AI on this device.</p>
          <Button
            variant="danger"
            icon={<LogOut aria-hidden="true" />}
            onClick={() => void logout()}
            disabled={loggingOut}
          >
            {loggingOut ? "Logging out..." : "Log out"}
          </Button>
        </div>
      </Card>

      <section className="history-section" aria-labelledby="history-title">
        <div className="history-heading">
          <div>
            <div className="section-kicker">RECENT ACTIVITY</div>
            <h2 id="history-title">
              <History aria-hidden="true" /> Analysis history
            </h2>
          </div>
          <span>{history.length} saved</span>
        </div>

        <Card className="history-card">
          {!loading && history.length === 0 ? (
            <div className="history-empty">
              <History aria-hidden="true" />
              <h3>No saved history yet</h3>
              <p>
                Saved call analyses will appear here after you analyze a call.
              </p>
            </div>
          ) : (
            <div className="history-list">
              {history.map((item) => (
                <article
                  className={`history-item risk-${item.level}`}
                  key={item.id}
                >
                  <span className={`history-score risk-${item.level}`}>
                    {item.score}
                  </span>
                  <div className="history-copy">
                    <div className="history-meta">
                      <strong>{item.level} risk</strong>
                      <span>
                        <Clock3 aria-hidden="true" />
                        {formatDate(item.createdAt)}
                      </span>
                    </div>
                    <p>
                      {item.redactedSnippet ||
                        "No transcript preview was saved for this analysis."}
                    </p>
                    {item.tactics.length > 0 && (
                      <div className="history-tactics">
                        <ShieldAlert aria-hidden="true" />
                        {item.tactics.join(" · ")}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  )
}
