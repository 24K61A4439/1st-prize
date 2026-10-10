import { CheckCircle2, ShieldAlert, TriangleAlert } from "lucide-react"
import type { RiskLevel } from "@/types/call"

const levelCopy: Record<RiskLevel, string> = {
  high: "HIGH RISK",
  medium: "CAUTION",
  low: "LOOKS SAFE",
}

export default function RiskGauge({
  score,
  level,
}: {
  score: number
  level: RiskLevel
}) {
  const Icon =
    level === "high"
      ? ShieldAlert
      : level === "medium"
        ? TriangleAlert
        : CheckCircle2
  return (
    <div
      className={`risk-gauge risk-${level}`}
      style={{ "--score": score } as React.CSSProperties}
    >
      <div className="gauge-ring">
        <div className="gauge-center">
          <span>RISK</span>
          <strong>{score}%</strong>
        </div>
      </div>
      <span className="risk-label">
        <Icon aria-hidden="true" /> {levelCopy[level]}
      </span>
    </div>
  )
}
