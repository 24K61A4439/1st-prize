import {
  ArrowLeft,
  BellRing,
  Building2,
  Check,
  CreditCard,
  EyeOff,
  HeartCrack,
  KeyRound,
  PhoneCall,
  ShieldAlert,
  Timer,
  TriangleAlert,
  X,
} from "lucide-react"
import { useNavigate } from "react-router"
import Button from "@/components/ui/Button"
import Card from "@/components/ui/Card"
import Toast from "@/components/ui/Toast"
import { useCallAnalysis } from "@/context/CallAnalysisContext"
import { accountApi } from "@/lib/api"
import { useState } from "react"

const icons = [Building2, TriangleAlert, EyeOff, KeyRound, Timer, HeartCrack]

export default function RiskPage() {
  const navigate = useNavigate()
  const { analysis, mode } = useCallAnalysis()
  const [toast, setToast] = useState("")

  const alertFamily = async () => {
    try {
      const result = await accountApi.alertFamily(analysis.level)
      setToast(result.message)
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Could not alert your contact.",
      )
    }
    window.setTimeout(() => setToast(""), 4200)
  }

  return (
    <div className="page risk-page">
      <button
        className="back-link"
        onClick={() => navigate(mode === "live" ? "/app/live" : "/app/home")}
      >
        <ArrowLeft aria-hidden="true" /> Back to {mode === "live" ? "Live call" : "Audio call"}
      </button>
      <header className="risk-header">
        <div>
          <div className="section-kicker">CALL EXPLANATION</div>
          <h1>Why this call is {analysis.level === "high" ? "high risk" : analysis.level === "medium" ? "caution" : "low risk"}</h1>
          <p>Six signals explain the warning with verifiable transcript evidence.</p>
        </div>
        <span className={`large-risk-badge risk-${analysis.level}`}>
          <ShieldAlert aria-hidden="true" /> <strong>{analysis.score}%</strong>{" "}
          RISK
        </span>
      </header>

      <section className="risk-layout">
        <Card className="breakdown-card">
          <div className="section-heading">
            <span className="section-icon">
              <ShieldAlert aria-hidden="true" />
            </span>
            <div>
              <h2>Risk breakdown & Transcript Evidence</h2>
              <p>Strength and verified evidence for each manipulation signal</p>
            </div>
          </div>
          <div className="risk-bars">
            {analysis.tactics.map((tactic, index) => {
              const Icon = icons[index]
              const severity =
                tactic.score >= 70
                  ? "high"
                  : tactic.score >= 40
                    ? "medium"
                    : "low"
              return (
                <div className="risk-bar-row" key={tactic.name}>
                  <div className="bar-label">
                    <Icon aria-hidden="true" />
                    <span>{tactic.name}</span>
                    <strong>{tactic.score}%</strong>
                  </div>
                  <div className="bar-track">
                    <span
                      className={`bar-fill ${severity}`}
                      style={{
                        width: `${tactic.score}%`,
                        animationDelay: `${index * 90}ms`,
                      }}
                    />
                  </div>
                  {tactic.evidence ? (
                    <div className="evidence-snippet">
                      <span className="evidence-badge">TRANSCRIPT EVIDENCE</span>
                      <p>"{tactic.evidence}"</p>
                    </div>
                  ) : (
                    <div className="evidence-snippet empty">
                      <span>No suspicious evidence found in this factor.</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="score-note">
            Overall risk is a weighted score driven by compounding dangerous signals,
            not a simple average or isolated keyword.
          </p>
        </Card>
        <div className="risk-side">
          <Card className="explanation-card">
            <span className="card-label">AI EXPLANATION</span>
            <p>{analysis.explanation}</p>
          </Card>
          <Card className="recommendation-card">
            <span className="card-label">
              <TriangleAlert aria-hidden="true" /> RECOMMENDED NOW
            </span>
            <h2>Do NOT share OTP, PIN, bank details or transfer money.</h2>
            <div className="stacked-actions">
              <Button variant="danger" icon={<PhoneCall aria-hidden="true" />}>
                Call the number on my card
              </Button>
              <Button
                variant="secondary"
                icon={<BellRing aria-hidden="true" />}
                onClick={() => void alertFamily()}
              >
                Alert family
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <Card className="comparison-card">
        <div className="comparison-heading">
          <div>
            <span className="section-kicker">FALSE-ALARM CHECK</span>
            <h2>Why this is not a genuine bank call</h2>
          </div>
          <p>Urgency alone does not make a scam. The dangerous requests do.</p>
        </div>
        <div className="comparison-grid">
          <div className="comparison-column genuine">
            <h3>
              <Check aria-hidden="true" /> Genuine bank OTP call
            </h3>
            <ul>
              <li>
                <Check aria-hidden="true" /> May ask you to confirm whether a
                transaction is yours
              </li>
              <li>
                <Check aria-hidden="true" /> Tells you to use the number printed
                on your card
              </li>
              <li>
                <X aria-hidden="true" /> Never asks you to read out an OTP or
                PIN
              </li>
              <li>
                <X aria-hidden="true" /> Never demands secrecy or threatens
                arrest
              </li>
            </ul>
          </div>
          <div className="comparison-column suspicious">
            <h3>
              <ShieldAlert aria-hidden="true" /> This call
            </h3>
            <ul>
              <li>
                <X aria-hidden="true" /> Claims authority without safe
                verification
              </li>
              <li>
                <X aria-hidden="true" /> Threatens to block your account today
              </li>
              <li>
                <X aria-hidden="true" /> Tells you not to speak with family
              </li>
              <li>
                <X aria-hidden="true" /> Asks you to read out a six-digit OTP
              </li>
            </ul>
          </div>
        </div>
      </Card>
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  )
}
