import {
  ArrowRight,
  Check,
  FileAudio,
  ScanText,
  ShieldCheck,
} from "lucide-react"
import type { PipelineStatus } from "@/types/call"

const steps = [
  { label: "Speech → Text", icon: FileAudio, latency: "640 ms" },
  { label: "Scam AI", icon: ScanText, latency: "720 ms" },
  { label: "Risk Engine", icon: ShieldCheck, latency: "440 ms" },
]

export default function Pipeline({ statuses }: { statuses: PipelineStatus[] }) {
  return (
    <div className="pipeline-wrap">
      <div className="pipeline">
        {steps.map(({ label, icon: Icon, latency }, index) => (
          <div className="pipeline-pair" key={label}>
            <div className={`pipeline-step ${statuses[index]}`}>
              <span className="step-icon">
                {statuses[index] === "done" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Icon aria-hidden="true" />
                )}
              </span>
              <span>
                <strong>{label}</strong>
                <small>
                  {statuses[index] === "idle" ? "Waiting" : latency}
                </small>
              </span>
            </div>
            {index < steps.length - 1 && (
              <ArrowRight className="pipeline-arrow" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
