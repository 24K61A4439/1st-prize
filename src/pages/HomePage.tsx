import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react"
import {
  BellRing,
  CircleStop,
  Clock3,
  FolderUp,
  Info,
  Mic,
  PhoneOff,
  Play,
  ShieldAlert,
  Sparkles,
} from "lucide-react"
import { useNavigate } from "react-router"
import Button from "@/components/ui/Button"
import Card from "@/components/ui/Card"
import Toast from "@/components/ui/Toast"
import Pipeline from "@/components/call/Pipeline"
import RiskGauge from "@/components/call/RiskGauge"
import Transcript from "@/components/call/Transcript"
import { useCallAnalysis } from "@/context/CallAnalysisContext"
import { accountApi } from "@/lib/api"
import type { DemoScenario } from "@/types/call"

interface HomePageProps {
  mode?: "upload" | "live"
}

const acceptedTypes = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
]

export default function HomePage({ mode = "upload" }: HomePageProps) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    analysis,
    visibleTranscript,
    running,
    pipeline,
    runDemo,
    analyzeFile,
    analyzeLiveText,
    resetLiveAnalysis,
  } = useCallAnalysis(mode)
  const [scenario, setScenario] = useState<DemoScenario>("scam")
  const [recording, setRecording] = useState(false)
  const [fileName, setFileName] = useState("")
  const [fileError, setFileError] = useState("")
  const [micError, setMicError] = useState("")
  const [toast, setToast] = useState("")
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const keepListeningRef = useRef(false)
  const micStartedAtRef = useRef(0)
  const workspaceUsed =
    running ||
    visibleTranscript.length > 0 ||
    pipeline.some((status) => status !== "idle")

  const processFile = async (file?: File) => {
    if (!file) return
    const extensionOkay = /\.(mp3|wav|m4a|mp4|mpeg|mpga|ogg|webm|flac)$/i.test(
      file.name,
    )
    if (!acceptedTypes.includes(file.type) && !extensionOkay) {
      setFileError(
        "Unsupported file. Choose an MP3, WAV, M4A, MP4, OGG, WebM, or FLAC recording.",
      )
      return
    }
    setFileError("")
    setFileName(file.name)
    try {
      await analyzeFile(file)
    } catch (error) {
      setFileError(
        error instanceof Error ? error.message : "Audio analysis failed.",
      )
    }
  }

  const fileChange = (event: ChangeEvent<HTMLInputElement>) =>
    void processFile(event.target.files?.[0])
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    void processFile(event.dataTransfer.files[0])
  }

  const notifyFamily = async () => {
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

  const startMicrophone = async () => {
    setMicError("")
    if (!window.isSecureContext) {
      setMicError(
        "Microphone access requires a secure HTTPS page. Open Falcon AI from the Preview panel's full-page or new-tab option.",
      )
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError(
        "This browser cannot access a microphone here. Open Falcon AI in current Chrome or Edge.",
      )
      return
    }
    const policyDocument = document as Document & {
      permissionsPolicy?: { allowsFeature: (feature: string) => boolean }
      featurePolicy?: { allowsFeature: (feature: string) => boolean }
    }
    const microphoneAllowed =
      policyDocument.permissionsPolicy?.allowsFeature("microphone") ??
      policyDocument.featurePolicy?.allowsFeature("microphone") ??
      true
    if (!microphoneAllowed) {
      setMicError(
        "The embedded preview blocks microphone access. Use the Preview panel's Open in new tab button, then allow Microphone for that site.",
      )
      return
    }
    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      setMicError(
        "Live speech recognition is not supported in this browser. Use current Chrome or Edge, or upload an audio file.",
      )
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      const recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = "en-IN"
      recognition.onresult = (event) => {
        let text = ""
        for (let index = 0; index < event.results.length; index += 1)
          text += `${event.results[index][0].transcript} `
        analyzeLiveText(text.trim(), performance.now() - micStartedAtRef.current)
      }
      recognition.onerror = (event) => {
        keepListeningRef.current = false
        setRecording(false)
        setMicError(
          event.error === "not-allowed"
            ? "Microphone permission was denied. Allow microphone access and try again."
            : `Microphone recognition stopped: ${event.error}.`,
        )
      }
      recognition.onend = () => {
        if (keepListeningRef.current) {
          try {
            recognition.start()
          } catch {
            keepListeningRef.current = false
            setRecording(false)
          }
        }
      }
      recognitionRef.current = recognition
      keepListeningRef.current = true
      micStartedAtRef.current = performance.now()
      resetLiveAnalysis()
      recognition.start()
      setRecording(true)
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ""
      if (name === "NotAllowedError" || name === "SecurityError")
        setMicError(
          "Microphone access is blocked. Open the browser site controls, set Microphone to Allow, reload Falcon AI, and try again.",
        )
      else if (name === "NotFoundError")
        setMicError(
          "No microphone was found. Connect or enable a microphone, then try again.",
        )
      else if (name === "NotReadableError")
        setMicError(
          "Your microphone is busy in another app. Close other calling or recording apps and try again.",
        )
      else
        setMicError(
          "The microphone could not start. Open Falcon AI in a full browser tab and check the browser and system microphone settings.",
        )
    }
  }

  const stopMicrophone = () => {
    keepListeningRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setRecording(false)
    if (analysis.transcript.length)
      void accountApi.saveAnalysis(analysis).catch(() => undefined)
  }

  useEffect(
    () => () => {
      keepListeningRef.current = false
      recognitionRef.current?.stop()
      recognitionRef.current = null
    },
    [],
  )

  return (
    <div className="page home-page">
      <header className="page-header">
        <div>
          <div className="section-kicker">
            {mode === "upload" ? "AUDIO ANALYSIS" : "REAL-TIME PROTECTION"}
          </div>
          <h1>{mode === "upload" ? "Analyze Recording" : "Live Call"}</h1>
          <p>
            {mode === "upload"
              ? "Upload a recording and review every detected risk signal."
              : "Hear the warning before money or personal information changes hands."}
          </p>
        </div>
        <button
          className="how-link"
          onClick={() => navigate("/app/profile#privacy-architecture")}
        >
          <Info aria-hidden="true" /> How it works
        </button>
      </header>

      <section
        className="input-grid single-source"
        aria-label={mode === "upload" ? "Upload audio" : "Analyze a live call"}
      >
        {mode === "upload" ? (
          <Card
            className="input-card upload-card"
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <span className="big-card-icon">
              <FolderUp aria-hidden="true" />
            </span>
            <div>
              <h2>Upload Audio</h2>
              <p>Drop a recording here or choose a file</p>
            </div>
            <span className="file-types">MP3 · WAV · M4A · MP4 · WEBM</span>
            <input
              ref={inputRef}
              type="file"
              accept=".mp3,.wav,.m4a,.mp4,.ogg,.webm,.flac,audio/*"
              onChange={fileChange}
              aria-label="Choose an audio recording"
            />
            {fileName && (
              <div className="file-progress">
                <span>{fileName}</span>
                <i>
                  <b />
                </i>
                <small>Analysis complete</small>
              </div>
            )}
            {fileError && (
              <div className="inline-error" role="alert">
                {fileError}
              </div>
            )}
          </Card>
        ) : (
          <Card className="input-card mic-card">
            <span className={`mic-orb ${recording ? "recording" : ""}`}>
              <Mic aria-hidden="true" />
            </span>
            <div>
              <h2>Start Live Mic</h2>
              <p>Listen for risky language as the call happens</p>
            </div>
            {!recording ? (
              <Button
                icon={<Mic aria-hidden="true" />}
                onClick={() => void startMicrophone()}
              >
                Start listening
              </Button>
            ) : (
              <Button
                variant="danger"
                icon={<CircleStop aria-hidden="true" />}
                onClick={stopMicrophone}
              >
                Stop listening
              </Button>
            )}
            <small className="privacy-line">
              <ShieldAlert aria-hidden="true" /> Live speech is processed by your
              browser and is not stored by Falcon AI unless you opt in.
            </small>
            {micError && (
              <div className="inline-error" role="alert">
                {micError}
              </div>
            )}
            {workspaceUsed && (
              <div
                className={`live-risk-summary risk-${analysis.level}`}
                aria-live="polite"
              >
                <span>
                  {recording ? "Analyzing live speech" : "Live session paused"}
                </span>
                <strong>{analysis.score}% risk</strong>
              </div>
            )}
          </Card>
        )}
      </section>

      {mode === "upload" && (
        <Card className="demo-control">
          <div>
            <span className="demo-icon">
              <Sparkles aria-hidden="true" />
            </span>
            <div>
              <strong>Demo simulation</strong>
              <p>Watch Falcon AI catch a scripted call in real time.</p>
            </div>
          </div>
          <label className="scenario-toggle">
            <input
              type="checkbox"
              checked={scenario === "genuine"}
              onChange={(event) =>
                setScenario(event.target.checked ? "genuine" : "scam")
              }
            />
            <span />
            Genuine bank OTP call
          </label>
          <Button
            variant="secondary"
            icon={<Play aria-hidden="true" />}
            onClick={() => void runDemo(scenario)}
            disabled={running}
          >
            {running
              ? "Analyzing call..."
              : scenario === "genuine"
                ? "Play genuine call demo"
                : "Play demo scam call"}
          </Button>
        </Card>
      )}

      <section className="analysis-dashboard">
            <Card className="pipeline-card">
              <div className="metric-row">
                <div>
                  <span>TIME TO FIRST WARNING</span>
                  <strong>
                    {(analysis.firstWarningMs / 1000).toFixed(1)}
                    <small>s</small>
                  </strong>
                </div>
                <Clock3 aria-hidden="true" />
              </div>
              <Pipeline statuses={pipeline} />
            </Card>
            <Card className="gauge-card">
              <RiskGauge score={analysis.score} level={analysis.level} />
            </Card>
      </section>

      <div className="home-detail-grid">
            <Transcript
              segments={visibleTranscript}
              running={running || recording}
              emptyMessage={
                mode === "live"
                  ? recording
                    ? "Listening now. Speak naturally and your words will appear here as they are analyzed."
                    : workspaceUsed
                      ? "Start listening again to continue live transcription."
                      : "Click Start listening and speak to see the live transcript here."
                  : "Start the demo or upload audio to see the conversation appear here."
              }
            />
            <div className="tactics-column">
              <Card className="tactics-card">
                <div className="section-heading compact">
                  <span className="section-icon">
                    <ShieldAlert aria-hidden="true" />
                  </span>
                  <div>
                    <h2>Detected tactics</h2>
                    <p>Signals found in this call</p>
                  </div>
                </div>
                <div className="tactic-chips">
                  {(visibleTranscript.length
                    ? analysis.tactics.filter((tactic) => tactic.score > 0)
                    : []
                  ).map((tactic, index) => (
                    <span
                      className={`tactic-chip severity-${
                        tactic.score >= 75
                          ? "high"
                          : tactic.score >= 40
                            ? "medium"
                            : "low"
                      }`}
                      style={{ animationDelay: `${index * 80}ms` }}
                      key={tactic.name}
                    >
                      <ShieldAlert aria-hidden="true" /> {tactic.shortName}
                    </span>
                  ))}
                  {!visibleTranscript.length && (
                    <p className="muted-copy">No tactics detected yet.</p>
                  )}
                </div>
              </Card>
            </div>
      </div>

      {visibleTranscript.length > 0 && (
        <section
          className={`warning-banner warning-${analysis.level}`}
          aria-live="assertive"
        >
          <div className="warning-main">
            <ShieldAlert aria-hidden="true" />
            <div>
              <span>CURRENT WARNING</span>
              <strong>{analysis.warning}</strong>
              <p>
                {analysis.level === "high"
                  ? "Hang up. Call your bank using the number printed on your card."
                  : "This call has no dangerous combination of requests."}
              </p>
            </div>
          </div>
          <div className="warning-actions">
            {analysis.level === "high" && (
              <Button
                variant="danger"
                icon={<PhoneOff aria-hidden="true" />}
              >
                Hang up guidance
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<BellRing aria-hidden="true" />}
              onClick={() => void notifyFamily()}
            >
              Notify my family
            </Button>
          </div>
        </section>
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  )
}
