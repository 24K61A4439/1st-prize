import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Copy,
  ExternalLink,
  Info,
  KeyRound,
  Lock,
  LogOut,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  Play,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Timer,
  Volume2,
} from "lucide-react"
import { useNavigate, useSearchParams } from "react-router"
import Pipeline from "@/components/call/Pipeline"
import RiskGauge from "@/components/call/RiskGauge"
import Transcript from "@/components/call/Transcript"
import Button from "@/components/ui/Button"
import Card from "@/components/ui/Card"
import Toast from "@/components/ui/Toast"
import { DEMO_OTP_MODE } from "@/config"
import { useCallAnalysis } from "@/context/CallAnalysisContext"
import { accountApi } from "@/lib/api"
import {
  clearDemoPhoneSession,
  checkPhoneCallAuthorization,
  isAuthorizedPhoneHash,
  sendPhoneOtp,
  verifyPhoneOtp,
} from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { analyzeTranscript } from "@/lib/riskEngine"
import { WebRtcCallSession, type WebRtcStatus } from "@/lib/webrtcService"

interface ConversationTurn {
  id: number
  speaker: string
  text: string
  time: string
}

const safetyDemoTurns = [
  {
    speaker: "Bank caller (impersonator)",
    text: "Hello, I am calling from your bank's KYC department.",
  },
  {
    speaker: "Older woman",
    text: "I did not expect this call. What should I do?",
  },
  {
    speaker: "Bank caller (impersonator)",
    text: "Your account will be blocked today unless we verify it right now.",
  },
  {
    speaker: "Older woman",
    text: "Can I call the number printed on my bank card to check?",
  },
  {
    speaker: "Bank caller (impersonator)",
    text: "Do not tell anyone or disconnect. Read the OTP sent to your phone.",
  },
  {
    speaker: "Older woman",
    text: "I will not share any OTP. I am ending this call and contacting my bank using its official number.",
  },
]

type AuthStage = "checking" | "phone_input" | "otp_input" | "verified" | "denied"

export default function LivePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const defaultRoom = searchParams.get("room") || "falcon-secure-demo"

  // Phone OTP Authentication state
  const [authStage, setAuthStage] = useState<AuthStage>("checking")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState("")
  const [providerDisabled, setProviderDisabled] = useState(false)
  const [verifiedPhoneMasked, setVerifiedPhoneMasked] = useState("")
  const [verifiedPhoneHash, setVerifiedPhoneHash] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [demoOtpCode, setDemoOtpCode] = useState("")
  const [safetyDemoTurn, setSafetyDemoTurn] = useState(0)
  const [isSafetyDemoPlaying, setIsSafetyDemoPlaying] = useState(false)

  // Live Call state
  const [roomId, setRoomId] = useState(defaultRoom)
  const [status, setStatus] = useState<WebRtcStatus>("idle")
  const [isMuted, setIsMuted] = useState(false)
  const [localLevel, setLocalLevel] = useState(0)
  const [remoteLevel, setRemoteLevel] = useState(0)
  const [callDuration, setCallDuration] = useState(0)
  const [errorMessage, setErrorMessage] = useState("")
  const [toast, setToast] = useState("")
  const [turns, setTurns] = useState<ConversationTurn[]>([])

  const {
    analysis,
    visibleTranscript,
    pipeline,
    updateLiveConversation,
    resetLiveAnalysis,
  } = useCallAnalysis("live")

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const sessionRef = useRef<WebRtcCallSession | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const keepListeningRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const callStartedAtRef = useRef<number>(0)
  const turnsRef = useRef<ConversationTurn[]>([])
  const transcriptChannelRef =
    useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Initial authorization check
  useEffect(() => {
    let isMounted = true
    async function checkAuth() {
      try {
        const result = await checkPhoneCallAuthorization()
        if (!isMounted) return
        if (result.authorized) {
          setAuthStage("verified")
          setVerifiedPhoneMasked(result.phoneMasked || "Verified Team Member")
          if (result.phoneHash) setVerifiedPhoneHash(result.phoneHash)
        } else {
          setAuthStage("phone_input")
        }
      } catch {
        if (isMounted) setAuthStage("phone_input")
      }
    }
    void checkAuth()
    return () => {
      isMounted = false
    }
  }, [])

  // Resend OTP countdown timer
  useEffect(() => {
    if (resendTimer <= 0) return
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [resendTimer])

  useEffect(() => {
    if (!isSafetyDemoPlaying) return
    const timer = window.setTimeout(() => {
      if (safetyDemoTurn + 1 >= safetyDemoTurns.length) {
        setIsSafetyDemoPlaying(false)
      }
      setSafetyDemoTurn((current) =>
        Math.min(current + 1, safetyDemoTurns.length),
      )
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [isSafetyDemoPlaying, safetyDemoTurn])

  // Keep turns ref synchronized
  useEffect(() => {
    turnsRef.current = turns
  }, [turns])

  // Call timer effect
  useEffect(() => {
    if (status === "connected") {
      if (!callStartedAtRef.current) {
        callStartedAtRef.current = Date.now()
      }
      timerRef.current = window.setInterval(() => {
        setCallDuration(
          Math.floor((Date.now() - callStartedAtRef.current) / 1000),
        )
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (status === "idle" || status === "ended") {
        callStartedAtRef.current = 0
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [status])

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  // Handle Requesting SMS OTP
  const handleSendOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    setAuthError("")
    setProviderDisabled(false)

    if (!phoneNumber.trim()) {
      setAuthError("Please enter your mobile phone number.")
      return
    }

    setAuthLoading(true)
    const res = await sendPhoneOtp(phoneNumber)
    setAuthLoading(false)

    if (res.ok) {
      setAuthStage("otp_input")
      setResendTimer(45)
      setDemoOtpCode(res.demoOtp || "")
      setToast(res.message)
      setTimeout(() => setToast(""), 4000)
    } else {
      setAuthError(res.message)
      if (res.providerDisabled) {
        setProviderDisabled(true)
      }
    }
  }

  // Handle Verifying SMS OTP
  const handleVerifyOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    setAuthError("")

    if (!otpCode.trim() || otpCode.trim().length < 6) {
      setAuthError("Please enter the complete 6-digit OTP code.")
      return
    }

    setAuthLoading(true)
    const res = await verifyPhoneOtp(phoneNumber, otpCode)
    setAuthLoading(false)

    if (res.ok && res.authorized) {
      setAuthStage("verified")
      setVerifiedPhoneMasked(res.phoneMasked || "Verified Team Member")
      if (res.phoneHash) setVerifiedPhoneHash(res.phoneHash)
      setToast("Authorized team member confirmed! Call controls unlocked.")
      setTimeout(() => setToast(""), 4000)
    } else if (res.ok && !res.authorized) {
      setAuthStage("denied")
      setAuthError(
        res.error ||
          "ACCESS DENIED: This verified phone number is not on the authorized team member allowlist.",
      )
    } else {
      setAuthError(res.message)
    }
  }

  // Sign out / switch phone
  const handleSwitchPhone = async () => {
    endCall()
    setAuthStage("phone_input")
    setPhoneNumber("")
    setOtpCode("")
    setAuthError("")
    setProviderDisabled(false)
    setVerifiedPhoneMasked("")
    setVerifiedPhoneHash("")
    setDemoOtpCode("")
    clearDemoPhoneSession()
  }

  // Start two-way call
  const startCall = async () => {
    if (authStage !== "verified") {
      setErrorMessage(
        "You must complete Phone OTP verification before joining a call room.",
      )
      return
    }

    // Securely re-verify allowlist status on backend before joining or creating call room
    const authCheck = await checkPhoneCallAuthorization()
    if (!authCheck.authorized) {
      setErrorMessage(
        authCheck.error ||
          "You must complete Phone OTP verification before joining a call room.",
      )
      setAuthStage("phone_input")
      return
    }
    if (authCheck.phoneHash) {
      setVerifiedPhoneHash(authCheck.phoneHash)
    }

    setErrorMessage("")
    resetLiveAnalysis()
    setTurns([])
    turnsRef.current = []
    setCallDuration(0)
    callStartedAtRef.current = 0

    const cleanRoom =
      roomId
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "") || "falcon-secure-demo"

    // Setup Transcript Sync via Supabase Realtime broadcast
    setupTranscriptChannel(cleanRoom, authCheck.phoneHash || verifiedPhoneHash)

    // Setup WebRTC Session
    const session = new WebRtcCallSession(cleanRoom, {
      onStatusChange: (nextStatus) => {
        setStatus(nextStatus)
        if (nextStatus === "connected") {
          startSpeechRecognition()
        } else if (nextStatus === "ended" || nextStatus === "failed") {
          stopSpeechRecognition()
        }
      },
      onRemoteStream: (stream) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream
          remoteAudioRef.current
            .play()
            .catch((err) => console.warn("Auto-play on mobile:", err))
        }
      },
      onLocalAudioLevel: setLocalLevel,
      onRemoteAudioLevel: setRemoteLevel,
      onError: (err) => setErrorMessage(err),
      onPeerLeft: () => {
        setToast("Remote participant ended the call.")
      },
    })

    sessionRef.current = session
    await session.start()
  }

  // End call and release all audio tracks & connections
  const endCall = () => {
    stopSpeechRecognition()
    if (sessionRef.current) {
      sessionRef.current.cleanup()
      sessionRef.current = null
    }
    if (transcriptChannelRef.current) {
      void transcriptChannelRef.current.unsubscribe()
      transcriptChannelRef.current = null
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }
    setStatus("ended")
    setLocalLevel(0)
    setRemoteLevel(0)

    if (analysis.transcript.length) {
      void accountApi.saveAnalysis(analysis).catch(() => undefined)
    }
  }

  // Toggle mute
  const toggleMute = () => {
    if (sessionRef.current) {
      const muted = sessionRef.current.toggleMute()
      setIsMuted(muted)
    }
  }

  // Setup broadcast channel for syncing transcripts between both mobile phones
  const setupTranscriptChannel = (
    roomName: string,
    activePhoneHash?: string,
  ) => {
    if (transcriptChannelRef.current) {
      void transcriptChannelRef.current.unsubscribe()
    }

    const currentHash = activePhoneHash || verifiedPhoneHash
    const channel = supabase.channel(`falcon-transcript-${roomName}`, {
      config: { broadcast: { self: false } },
    })

    channel.on("broadcast", { event: "peer-text" }, (event) => {
      const payload = event.payload as {
        text: string
        time: string
        phoneHash?: string
      }
      if (!payload?.text) return

      // Verify that transcript sender is an authorized team member
      if (!payload.phoneHash || !isAuthorizedPhoneHash(payload.phoneHash)) {
        console.warn("Ignored transcript from unverified source")
        return
      }

      addConversationTurn("Caller", payload.text, payload.time)
    })

    channel.subscribe()
    transcriptChannelRef.current = channel
  }

  // Real-time Speech-to-Text via Web Speech API
  const startSpeechRecognition = () => {
    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      setErrorMessage(
        "Live speech recognition is not supported in this browser. Try the latest Chrome on Android for real-time transcript and risk analysis.",
      )
      return
    }

    try {
      const recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = "en-IN"

      recognition.onresult = (event) => {
        let transcript = ""
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
        }

        const trimmed = transcript.trim()
        if (!trimmed) return

        const isFinal = event.results[event.results.length - 1].isFinal
        const currentTime = new Date().toISOString().slice(14, 19)

        if (isFinal) {
          addConversationTurn("You", trimmed, currentTime)
          if (transcriptChannelRef.current) {
            transcriptChannelRef.current.send({
              type: "broadcast",
              event: "peer-text",
              payload: {
                text: trimmed,
                time: currentTime,
                phoneHash: verifiedPhoneHash,
              },
            })
          }
        }
      }

      recognition.onerror = (event) => {
        if (event.error !== "no-speech") {
          setErrorMessage(
            `Speech recognition stopped (${event.error}). Check microphone permission and keep the page active.`,
          )
        }
      }

      recognition.onend = () => {
        if (keepListeningRef.current) {
          try {
            recognition.start()
          } catch {
            // retry
          }
        }
      }

      recognitionRef.current = recognition
      keepListeningRef.current = true
      recognition.start()
    } catch (e) {
      console.warn("Speech recognition initialization failed:", e)
    }
  }

  const stopSpeechRecognition = () => {
    keepListeningRef.current = false
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // already stopped
      }
      recognitionRef.current = null
    }
  }

  // Add conversation turn and analyze incrementally
  const addConversationTurn = (speaker: string, text: string, time: string) => {
    setTurns((prev) => {
      const nextTurn: ConversationTurn = {
        id: prev.length + 1,
        speaker,
        text,
        time,
      }
      const updated = [...prev, nextTurn]
      const elapsed = callStartedAtRef.current
        ? Date.now() - callStartedAtRef.current
        : 0

      updateLiveConversation(
        updated.map((u) => ({
          text: u.text,
          speaker: u.speaker,
          time: u.time,
        })),
        elapsed,
      )

      return updated
    })
  }

  const copyRoomLink = () => {
    const url = `${window.location.origin}/app/live?room=${encodeURIComponent(roomId)}`
    void navigator.clipboard.writeText(url)
    setToast("Private call link copied! Send it to the other participant.")
    setTimeout(() => setToast(""), 4000)
  }

  const alertFamily = async () => {
    try {
      const result = await accountApi.alertFamily(analysis.level)
      setToast(result.message)
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Could not alert your contact.",
      )
    }
    setTimeout(() => setToast(""), 4200)
  }

  // Clean cleanup on component unmount
  useEffect(() => {
    return () => {
      stopSpeechRecognition()
      if (sessionRef.current) {
        sessionRef.current.cleanup()
        sessionRef.current = null
      }
      if (transcriptChannelRef.current) {
        void transcriptChannelRef.current.unsubscribe()
      }
    }
  }, [])

  const isCallActive =
    status === "connected" ||
    status === "connecting" ||
    status === "waiting_for_peer"

  return (
    <div className="page live-page">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <header className="page-header">
        <div>
          <div className="section-kicker">TWO-PHONE LIVE FRAUD DETECTION</div>
          <h1>
            <span className="title-icon">
              <PhoneCall aria-hidden="true" />
            </span>{" "}
            Live Call
          </h1>
          <p>
            Real-time peer-to-peer audio call with live speech recognition and
            instant scam detection.
          </p>
        </div>
        <button
          className="how-link"
          onClick={() => navigate("/app/profile#privacy-architecture")}
        >
          <Info aria-hidden="true" /> How it works
        </button>
      </header>

      {/* =========================================================================
          STEP 1: PHONE-NUMBER OTP AUTHENTICATION & ALLOWLIST GATE
          ========================================================================= */}
      {authStage !== "verified" ? (
        <Card className="phone-auth-card">
          <div className="phone-auth-header">
            <span className="phone-auth-icon">
              <Smartphone aria-hidden="true" />
            </span>
            <div>
              <span className="section-kicker">
                {DEMO_OTP_MODE
                  ? "LOCAL DEMO VERIFICATION"
                  : "SMS OTP AUTHENTICATION"}
              </span>
              <h2>Team Participant Verification</h2>
              <p>
                {DEMO_OTP_MODE
                  ? "Use the displayed demo code with either authorized team phone number to unlock the call room."
                  : "Access to private call rooms and real-time fraud analysis requires phone OTP verification for authorized team members."}
              </p>
            </div>
          </div>

          {authStage === "checking" && (
            <div className="phone-auth-checking">
              <RefreshCw className="pulse-icon" aria-hidden="true" />
              <span>Verifying authorization status...</span>
            </div>
          )}

          {authStage === "phone_input" && (
            <form onSubmit={handleSendOtp} className="phone-auth-form">
              <label htmlFor="phone-input">Mobile Phone Number</label>
              <div className="phone-input-row">
                <span className="phone-prefix">+91</span>
                <input
                  id="phone-input"
                  type="tel"
                  autoComplete="tel"
                  placeholder="Enter 10-digit mobile number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={authLoading}
                />
              </div>

              {authError && (
                <div className="phone-auth-error" role="alert">
                  <AlertTriangle aria-hidden="true" /> {authError}
                </div>
              )}

              {providerDisabled && (
                <div className="provider-disabled-notice">
                  <div className="provider-notice-title">
                    <ShieldAlert aria-hidden="true" /> Supabase Phone Auth Not
                    Configured
                  </div>
                  <p>
                    Supabase returned <code>phone_provider_disabled</code>. To
                    send real SMS OTPs to your phone:
                  </p>
                  <ol>
                    <li>
                      Open your Supabase Dashboard for project{" "}
                      <code>yzmnywwhkyjwkjkgpoev</code>.
                    </li>
                    <li>
                      Navigate to <strong>Authentication</strong> &rarr;{" "}
                      <strong>Providers</strong> &rarr; <strong>Phone</strong>.
                    </li>
                    <li>
                      Toggle <strong>Enable Phone Provider</strong> to ON.
                    </li>
                    <li>
                      Select an SMS Provider (e.g. <strong>Twilio</strong>,{" "}
                      <strong>MessageBird</strong>, or <strong>Vonage</strong>)
                      and add your API credentials.
                    </li>
                    <li>
                      Click <strong>Save</strong>.
                    </li>
                  </ol>
                  <small>
                    Once enabled, live SMS OTP verification will deliver
                    directly to your phone.
                  </small>
                </div>
              )}

              <Button
                type="submit"
                className="btn-phone-submit"
                icon={<ArrowRight aria-hidden="true" />}
                disabled={authLoading}
              >
                {authLoading
                  ? "Preparing..."
                  : DEMO_OTP_MODE
                    ? "Show Demo OTP"
                    : "Send SMS OTP"}
              </Button>
            </form>
          )}

          {authStage === "otp_input" && (
            <form onSubmit={handleVerifyOtp} className="phone-auth-form">
              <div className="otp-sent-info">
                <span>
                  {DEMO_OTP_MODE
                    ? `Demo OTP for +91 ${phoneNumber}: ${demoOtpCode}`
                    : `OTP requested for +91 ${phoneNumber}. Delivery is not confirmed.`}
                </span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setAuthStage("phone_input")}
                >
                  Change number
                </button>
              </div>

              <label htmlFor="otp-input">
                Enter 6-Digit {DEMO_OTP_MODE ? "Demo Code" : "SMS OTP"}
              </label>
              <input
                id="otp-input"
                type="text"
                maxLength={6}
                autoFocus
                placeholder="0 0 0 0 0 0"
                className="otp-code-input"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                disabled={authLoading}
              />

              {authError && (
                <div className="phone-auth-error" role="alert">
                  <AlertTriangle aria-hidden="true" /> {authError}
                </div>
              )}

              <Button
                type="submit"
                className="btn-phone-submit"
                icon={<KeyRound aria-hidden="true" />}
                disabled={authLoading || otpCode.length < 6}
              >
                {authLoading
                  ? "Verifying Token..."
                  : "Verify & Unlock Call Room"}
              </Button>

              <div className="otp-resend-row">
                {resendTimer > 0 ? (
                  <span>Resend code in {resendTimer}s</span>
                ) : (
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => void handleSendOtp()}
                    disabled={authLoading}
                  >
                    {DEMO_OTP_MODE ? "Show Demo OTP Again" : "Resend SMS OTP"}
                  </button>
                )}
              </div>
            </form>
          )}

          {authStage === "denied" && (
            <div className="auth-denied-box">
              <ShieldAlert aria-hidden="true" />
              <div>
                <h3>Access Denied</h3>
                <p>
                  This phone number has been verified via OTP, but it is{" "}
                  <strong>not on the authorized team member allowlist</strong>{" "}
                  for live call sessions.
                </p>
                <Button
                  variant="secondary"
                  onClick={handleSwitchPhone}
                  icon={<Smartphone aria-hidden="true" />}
                >
                  Try with Authorized Team Phone
                </Button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        /* =========================================================================
           STEP 2: VERIFIED TEAM MEMBER PRIVATE CALL DASHBOARD
           ========================================================================= */
        <>
          {/* Verified Team Member Banner */}
          <div className="verified-participant-strip">
            <div className="verified-left">
              <ShieldCheck aria-hidden="true" />
              <span>
                Verified Team Participant{" "}
                <strong>({verifiedPhoneMasked})</strong>
              </span>
            </div>
            <button
              type="button"
              className="strip-action-btn"
              onClick={handleSwitchPhone}
              title="Sign in with different phone"
            >
              <LogOut aria-hidden="true" /> Switch Phone
            </button>
          </div>

          {/* POTENTIAL SCAM DETECTED URGENT WARNING BANNER */}
          {analysis.level === "high" && (
            <section
              className="fraud-alert-hero animate-pulse"
              role="alert"
              aria-live="assertive"
            >
              <div className="fraud-alert-glow" />
              <div className="fraud-alert-content">
                <div className="fraud-alert-badge">
                  <ShieldAlert aria-hidden="true" /> POTENTIAL SCAM DETECTED
                </div>
                <h2>Immediate Safety Warning</h2>
                <p className="fraud-alert-advisory">
                  <strong>CRITICAL:</strong> Do NOT disclose any OTP, UPI PIN,
                  password, or banking information. Do NOT approve any payment
                  or fund transfer request.
                </p>
                {analysis.matchedPhrases &&
                  analysis.matchedPhrases.length > 0 && (
                    <div className="fraud-detected-phrase">
                      <span>Suspicious phrase heard:</span>
                      <mark>"{analysis.matchedPhrases[0]}"</mark>
                    </div>
                  )}
                <div className="fraud-alert-meta">
                  <span>
                    Risk Classification:{" "}
                    <strong>HIGH RISK ({analysis.score}%)</strong>
                  </span>
                  <p>{analysis.explanation}</p>
                </div>
                <div className="fraud-alert-actions">
                  <Button
                    variant="danger"
                    icon={<PhoneOff aria-hidden="true" />}
                    onClick={endCall}
                  >
                    Hang up immediately
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<Info aria-hidden="true" />}
                    onClick={() => navigate("/app/risk")}
                  >
                    View full risk explanation
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<BellRing aria-hidden="true" />}
                    onClick={() => void alertFamily()}
                  >
                    Alert family
                  </Button>
                </div>
              </div>
            </section>
          )}

          {/* Main Calling Interface */}
          <section className="live-call-grid">
            <Card className="call-control-card">
              <div className="call-card-top">
                <div className="call-status-badge-wrap">
                  <span className={`live-status-pill status-${status}`}>
                    <Radio
                      aria-hidden="true"
                      className={status === "connected" ? "pulse-icon" : ""}
                    />
                    {status === "idle" && "Ready to Connect"}
                    {status === "permission_pending" &&
                      "Requesting Microphone..."}
                    {status === "waiting_for_peer" &&
                      "Waiting for Other Phone..."}
                    {status === "connecting" && "Establishing WebRTC Peer..."}
                    {status === "connected" && "Connected (Live Two-Way Audio)"}
                    {status === "disconnected" && "Connection Interrupted"}
                    {status === "failed" && "Connection Failed"}
                    {status === "ended" && "Call Ended"}
                  </span>
                  {status === "connected" && (
                    <span className="live-timer-chip">
                      <Timer aria-hidden="true" /> {formatTimer(callDuration)}
                    </span>
                  )}
                </div>

                <div className="room-id-controls">
                  <label htmlFor="room-input">Private Session Room:</label>
                  <div className="room-input-group">
                    <input
                      id="room-input"
                      type="text"
                      value={roomId}
                      disabled={isCallActive}
                      onChange={(e) => setRoomId(e.target.value)}
                      placeholder="Enter private session code"
                    />
                    <button
                      type="button"
                      className="copy-room-btn"
                      onClick={copyRoomLink}
                      title="Copy call link for second phone"
                    >
                      <Copy aria-hidden="true" /> Copy Link
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="call-actions-row">
                {!isCallActive ? (
                  <Button
                    className="btn-call-join"
                    icon={<Phone aria-hidden="true" />}
                    onClick={() => void startCall()}
                  >
                    Join Call
                  </Button>
                ) : (
                  <div className="active-call-controls">
                    <Button
                      variant={isMuted ? "danger" : "secondary"}
                      icon={
                        isMuted ? (
                          <MicOff aria-hidden="true" />
                        ) : (
                          <Mic aria-hidden="true" />
                        )
                      }
                      onClick={toggleMute}
                    >
                      {isMuted ? "Unmute Mic" : "Mute Mic"}
                    </Button>
                    <Button
                      variant="danger"
                      icon={<PhoneOff aria-hidden="true" />}
                      onClick={endCall}
                    >
                      End Call
                    </Button>
                  </div>
                )}
              </div>

              {/* Live Audio Activity Level Meters */}
              {isCallActive && (
                <div className="audio-meters-row">
                  <div className="meter-col">
                    <div className="meter-label">
                      <Mic aria-hidden="true" />
                      <span>Your Microphone</span>
                      <strong>{isMuted ? "Muted" : `${localLevel}%`}</strong>
                    </div>
                    <div className="meter-bar-track">
                      <div
                        className="meter-bar-fill local"
                        style={{ width: `${isMuted ? 0 : localLevel}%` }}
                      />
                    </div>
                  </div>

                  <div className="meter-col">
                    <div className="meter-label">
                      <Volume2 aria-hidden="true" />
                      <span>Remote Peer Audio</span>
                      <strong>
                        {status === "connected" ? `${remoteLevel}%` : "Waiting"}
                      </strong>
                    </div>
                    <div className="meter-bar-track">
                      <div
                        className="meter-bar-fill remote"
                        style={{
                          width: `${status === "connected" ? remoteLevel : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="inline-error" role="alert">
                  <AlertTriangle aria-hidden="true" /> {errorMessage}
                </div>
              )}

              <div className="call-privacy-note">
                <ShieldCheck aria-hidden="true" />
                <span>
                  Two-party WebRTC audio is transmitted directly peer-to-peer.
                  Speech is analyzed incrementally on-device to detect
                  impersonation and extortion tactics in real time.
                </span>
              </div>
            </Card>

            {/* Real-time Risk Dashboard */}
            <div className="live-metrics-wrap">
              <Card className="pipeline-card">
                <div className="metric-row">
                  <div>
                    <span>LIVE DETECTION PIPELINE</span>
                    <strong>
                      {status === "connected" ? "ACTIVE" : "STANDBY"}
                    </strong>
                  </div>
                  <ShieldCheck aria-hidden="true" />
                </div>
                <Pipeline statuses={pipeline} />
              </Card>

              <Card className="gauge-card">
                <RiskGauge score={analysis.score} level={analysis.level} />
              </Card>
            </div>
          </section>

          {/* Live Two-Way Transcript & Tactics */}
          <section className="live-detail-grid">
            <Transcript
              segments={visibleTranscript}
              running={status === "connected"}
              emptyMessage={
                status === "connected"
                  ? "Both phones are connected. Speak naturally and the conversation will be transcribed and analyzed here in real time."
                  : isCallActive
                    ? "Connecting phones... Audio and live transcription will appear once both phones join."
                    : "Join the call from both phones to begin live fraud analysis."
              }
            />

            <Card className="tactics-card">
              <div className="section-heading compact">
                <span className="section-icon">
                  <ShieldAlert aria-hidden="true" />
                </span>
                <div>
                  <h2>Detected Signals</h2>
                  <p>Contextual fraud indicators in this call</p>
                </div>
              </div>

              <div className="tactic-chips">
                {analysis.tactics
                  .filter((tactic) => tactic.score > 0)
                  .map((tactic, index) => (
                    <span
                      key={tactic.name}
                      className={`tactic-chip severity-${
                        tactic.score >= 70
                          ? "high"
                          : tactic.score >= 40
                            ? "medium"
                            : "low"
                      }`}
                      style={{ animationDelay: `${index * 80}ms` }}
                    >
                      <ShieldAlert aria-hidden="true" />
                      <strong>{tactic.shortName}</strong>
                      <small>({tactic.score}%)</small>
                    </span>
                  ))}

                {analysis.tactics.filter((t) => t.score > 0).length === 0 && (
                  <p className="muted-copy">
                    No suspicious tactics detected yet. Analysis runs
                    continuously as speech occurs.
                  </p>
                )}
              </div>

              {analysis.level !== "low" && (
                <div className={`live-warning-box risk-${analysis.level}`}>
                  <AlertTriangle aria-hidden="true" />
                  <div>
                    <strong>{analysis.warning}</strong>
                    <p>{analysis.explanation}</p>
                  </div>
                </div>
              )}
            </Card>
          </section>

          <section className="safety-demo-section" aria-labelledby="safety-demo-title">
            <Card className="tactics-card">
              <div className="section-heading compact">
                <span className="section-icon">
                  <ShieldAlert aria-hidden="true" />
                </span>
                <div>
                  <h2 id="safety-demo-title">Safety demo: suspicious bank call</h2>
                  <p>
                    A scripted example showing how pressure and OTP requests
                    trigger an alert. This does not join or record your live call.
                  </p>
                </div>
              </div>

              <div className="call-actions-row">
                <Button
                  variant="secondary"
                  icon={<Play aria-hidden="true" />}
                  onClick={() => {
                    if (isSafetyDemoPlaying) {
                      setIsSafetyDemoPlaying(false)
                    } else {
                      if (safetyDemoTurn >= safetyDemoTurns.length) {
                        setSafetyDemoTurn(0)
                      }
                      setIsSafetyDemoPlaying(true)
                    }
                  }}
                >
                  {isSafetyDemoPlaying
                    ? "Pause safety demo"
                    : safetyDemoTurn >= safetyDemoTurns.length
                      ? "Replay safety demo"
                      : "Play safety demo"}
                </Button>
                {safetyDemoTurn > 0 && !isSafetyDemoPlaying && (
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => setSafetyDemoTurn(0)}
                  >
                    Reset demo
                  </button>
                )}
              </div>

              {safetyDemoTurn > 0 && (
                <>
                  <div className="transcript-stream" aria-live="polite">
                    {safetyDemoTurns.slice(0, safetyDemoTurn).map((turn, index) => (
                      <div className="transcript-line" key={`${turn.speaker}-${index}`}>
                        <time>{`00:${String((index + 1) * 3).padStart(2, "0")}`}</time>
                        <p>
                          <strong className="transcript-speaker">
                            {turn.speaker}:{" "}
                          </strong>
                          {turn.text}
                        </p>
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const demoAnalysis = analyzeTranscript(
                      safetyDemoTurns
                        .slice(0, safetyDemoTurn)
                        .map((turn) => turn.text)
                        .join(" "),
                    )
                    return (
                      <div
                        className={`live-risk-summary risk-${demoAnalysis.level}`}
                        role="status"
                        aria-live="polite"
                      >
                        <span>
                          {demoAnalysis.level === "high"
                            ? "HIGH RISK — do not share OTPs or personal details"
                            : "Analyzing scripted conversation"}
                        </span>
                        <strong>{demoAnalysis.score}% risk</strong>
                      </div>
                    )
                  })()}
                </>
              )}
            </Card>
          </section>
        </>
      )}

      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  )
}
