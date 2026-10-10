import {
  BrainCircuit,
  ChevronRight,
  HardDrive,
  Mic2,
  Send,
  ShieldCheck,
  Smartphone,
} from "lucide-react"
import Card from "@/components/ui/Card"

const architecture = [
  {
    number: "01",
    title: "Audio capture",
    icon: Mic2,
    text: "Microphone or speakerphone audio is streamed in short 2–3 second chunks. You can also upload a recording.",
  },
  {
    number: "02",
    title: "Hybrid classifier",
    icon: BrainCircuit,
    text: "Fast on-device speech recognition finds tactics, while a semantic model catches new wording. The risk engine weighs combinations, not single words.",
  },
  {
    number: "03",
    title: "Careful alerts",
    icon: ShieldCheck,
    text: "We favor catching OTP or payment requests combined with secrecy or fear. Loud red warnings need several signals, reducing false alarms.",
  },
]

export default function PrivacyPanel() {
  return (
    <section
      id="privacy-architecture"
      className="privacy-panel"
      aria-labelledby="privacy-title"
    >
      <div className="section-kicker">PRIVACY &amp; ARCHITECTURE</div>
      <h2 id="privacy-title">Fast enough to help. Private by default.</h2>
      <p className="section-lead">
        The demo mirrors a privacy-first production architecture designed for
        low latency, strong catch rates, and fewer false alarms.
      </p>
      <div className="architecture-flow">
        {architecture.map(({ number, title, icon: Icon, text }, index) => (
          <div className="architecture-item" key={title}>
            <span className="architecture-number">{number}</span>
            <Icon aria-hidden="true" />
            <h3>{title}</h3>
            <p>{text}</p>
            {index < architecture.length - 1 && (
              <ChevronRight className="architecture-arrow" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
      <Card className="data-card">
        <div className="data-column">
          <Smartphone aria-hidden="true" />
          <h3>What stays on your phone</h3>
          <p>
            Raw audio is processed on-device and discarded immediately after
            analysis.
          </p>
        </div>
        <div className="data-column">
          <Send aria-hidden="true" />
          <h3>What is sent</h3>
          <p>
            Family alerts only say “high-risk call detected.” Audio is never
            included.
          </p>
        </div>
        <div className="data-column">
          <HardDrive aria-hidden="true" />
          <h3>What is kept</h3>
          <p>
            Only opted-in risk labels, score, and a short redacted snippet.
            Delete it all in one tap.
          </p>
        </div>
      </Card>
    </section>
  )
}
