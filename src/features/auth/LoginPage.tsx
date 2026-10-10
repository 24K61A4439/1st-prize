import { useState, useEffect, type FormEvent } from "react"
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Radio,
  ShieldAlert,
  Smartphone,
} from "lucide-react"
import { useNavigate } from "react-router"
import VideoBackground from "@/components/VideoBackground"
import Button from "@/components/ui/Button"
import PhoenixMark from "@/components/ui/PhoenixMark"
import { APP_NAME, DEMO_MODE, DEMO_OTP_MODE } from "@/config"
import {
  resetPassword,
  sendPhoneOtp,
  signIn,
  signUp,
  verifyPhoneOtp,
} from "@/lib/auth"

export default function LoginPage() {
  const navigate = useNavigate()
  const [authMethod, setAuthMethod] = useState<"phone" | "email">("phone")

  // Email form state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState("")

  // Phone OTP form state
  const [phone, setPhone] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [phoneStage, setPhoneStage] = useState<"input" | "otp">("input")
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [phoneError, setPhoneError] = useState("")
  const [phoneSuccess, setPhoneSuccess] = useState("")
  const [providerDisabled, setProviderDisabled] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [demoOtpCode, setDemoOtpCode] = useState("")

  // Resend OTP countdown timer
  useEffect(() => {
    if (resendTimer <= 0) return
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [resendTimer])

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!email.trim()) nextErrors.email = "Enter your email or username."
    else if (email.includes("@") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      nextErrors.email = "Enter a valid email."
    if (!password) nextErrors.password = "Enter your password."
    else if (password.length < 6)
      nextErrors.password = "Password must be at least 6 characters."
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setLoading(true)
    const result =
      mode === "login"
        ? await signIn({ email, password })
        : await signUp({ email, password })
    setLoading(false)
    if (result.ok && result.session) {
      setSuccess(result.message ?? "Ready. Opening your protected dashboard...")
      window.setTimeout(() => navigate("/app/home"), 450)
    } else if (result.ok) setSuccess(result.message ?? "Check your email.")
    else if (DEMO_MODE) navigate("/app/home")
    else setErrors({ form: result.message })
  }

  const forgotPassword = async () => {
    if (!email) {
      setErrors({
        email: "Enter your email first, then select Forgot Password.",
      })
      return
    }
    const result = await resetPassword(email)
    if (result.ok)
      setSuccess(result.message ?? "Password reset instructions sent.")
    else setErrors({ form: result.message })
  }

  const handlePhoneSend = async (e: FormEvent) => {
    e.preventDefault()
    setPhoneError("")
    setProviderDisabled(false)

    if (!phone.trim()) {
      setPhoneError("Enter your 10-digit mobile phone number.")
      return
    }

    setPhoneLoading(true)
    const res = await sendPhoneOtp(phone)
    setPhoneLoading(false)

    if (res.ok) {
      setPhoneStage("otp")
      setDemoOtpCode(res.demoOtp || "")
      setPhoneSuccess(res.message)
      setResendTimer(45)
    } else {
      setPhoneError(res.message)
      if (res.providerDisabled) {
        setProviderDisabled(true)
      }
    }
  }

  const handlePhoneVerify = async (e: FormEvent) => {
    e.preventDefault()
    setPhoneError("")

    if (!otpCode.trim() || otpCode.trim().length < 6) {
      setPhoneError("Enter the complete 6-digit OTP code.")
      return
    }

    setPhoneLoading(true)
    const res = await verifyPhoneOtp(phone, otpCode)
    setPhoneLoading(false)

    if (res.ok && res.authorized) {
      setPhoneSuccess("Authorized team member confirmed! Opening Live Call...")
      setTimeout(() => navigate("/app/live"), 400)
    } else if (res.ok && !res.authorized) {
      setPhoneError(
        res.error ||
          "ACCESS DENIED: This verified phone number is not on the authorized team member allowlist.",
      )
    } else {
      setPhoneError(res.message)
    }
  }

  return (
    <div className="login-page">
      <VideoBackground />
      <main className="login-layout">
        <section className="login-hero" aria-labelledby="login-headline">
          <div className="hero-eyebrow">
            <PhoenixMark className="login-phoenix" /> {APP_NAME}
          </div>
          <h1 id="login-headline">
            <span className="headline-mask">
              <span>
                Think <strong>Twice,</strong>
              </span>
            </span>
            <span className="headline-mask">
              <span>
                <strong className="green-text">Transfer Once.</strong>
              </span>
            </span>
          </h1>
          <p>
            Real-time call analysis that spots manipulation in what is said, not
            who is calling.
          </p>
          <div className="trust-chips">
            <span>
              <Radio aria-hidden="true" /> Works on spoofed numbers
            </span>
            <span>
              <LockKeyhole aria-hidden="true" /> Private by design
            </span>
            <span>
              <BellRing aria-hidden="true" /> Alerts family instantly
            </span>
          </div>
        </section>

        <section className="login-card" aria-labelledby="login-title">
          {(DEMO_MODE || DEMO_OTP_MODE) && (
            <div className="demo-banner">
              <span>Demo mode</span>
              {DEMO_OTP_MODE
                ? "Local demo OTP only; no SMS will be sent."
                : "No real account is required"}
            </div>
          )}
          <h2 id="login-title">
            {authMethod === "phone"
              ? "Phone Verification"
              : mode === "login"
                ? "Log in"
                : "Sign up"}
          </h2>
          <p className="login-intro">
            {authMethod === "phone"
              ? DEMO_OTP_MODE
                ? "Use either authorized team number and the displayed local demo code."
                : "Authorized team members must verify via SMS OTP."
              : "Stay protected during suspicious calls."}
          </p>

          {/* Auth Method Switcher */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              marginBottom: "24px",
              padding: "4px",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.05)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setAuthMethod("phone")
                setPhoneError("")
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "8px 12px",
                fontSize: "13px",
                fontWeight: 700,
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: authMethod === "phone" ? "#fff" : "var(--muted)",
                background:
                  authMethod === "phone" ? "var(--violet)" : "transparent",
                transition: "all 150ms",
              }}
            >
              <Smartphone style={{ width: 15, height: 15 }} />{" "}
              {DEMO_OTP_MODE ? "Demo Phone Code" : "Phone OTP"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMethod("email")
                setErrors({})
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "8px 12px",
                fontSize: "13px",
                fontWeight: 700,
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: authMethod === "email" ? "#fff" : "var(--muted)",
                background:
                  authMethod === "email" ? "var(--violet)" : "transparent",
                transition: "all 150ms",
              }}
            >
              <LockKeyhole style={{ width: 15, height: 15 }} /> Email
            </button>
          </div>

          {authMethod === "phone" ? (
            phoneStage === "input" ? (
              <form onSubmit={handlePhoneSend} noValidate>
                <label htmlFor="login-phone">Team Mobile Number</label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    border: "1px solid rgba(255, 255, 255, 0.14)",
                    borderRadius: "5px",
                    background: "rgba(255, 255, 255, 0.055)",
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      padding: "0 12px",
                      fontWeight: 700,
                      fontSize: "14px",
                      color: "var(--violet-light)",
                      borderRight: "1px solid rgba(255, 255, 255, 0.1)",
                      lineHeight: "43px",
                    }}
                  >
                    +91
                  </span>
                  <input
                    id="login-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="Enter 10-digit mobile number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{
                      flex: 1,
                      height: "43px",
                      border: "none",
                      background: "transparent",
                      padding: "0 12px",
                      color: "#fff",
                      fontSize: "15px",
                      outline: "none",
                    }}
                    disabled={phoneLoading}
                  />
                </div>

                {phoneError && (
                  <div
                    className="form-error"
                    style={{ marginTop: 14 }}
                    role="alert"
                  >
                    <AlertTriangle
                      style={{
                        width: 16,
                        height: 16,
                        display: "inline",
                        verticalAlign: "middle",
                        marginRight: 6,
                      }}
                    />
                    {phoneError}
                  </div>
                )}

                {providerDisabled && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: "12px",
                      borderRadius: "6px",
                      background: "rgba(180, 35, 24, 0.15)",
                      border: "1px solid rgba(180, 35, 24, 0.35)",
                      fontSize: "12px",
                      lineHeight: 1.5,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: "#ffccd0",
                        marginBottom: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <ShieldAlert style={{ width: 16, height: 16 }} /> Supabase
                      Phone Auth Not Enabled
                    </div>
                    <p style={{ margin: "0 0 6px", color: "#dedede" }}>
                      Enable Phone Provider in your Supabase Dashboard:
                    </p>
                    <ol
                      style={{
                        margin: "0 0 6px",
                        paddingLeft: 18,
                        color: "#dedede",
                      }}
                    >
                      <li>
                        Dashboard &rarr; Authentication &rarr; Providers &rarr;
                        Phone
                      </li>
                      <li>Toggle "Enable Phone Provider" to ON</li>
                      <li>
                        Configure SMS Provider (e.g., Twilio, MessageBird)
                      </li>
                    </ol>
                  </div>
                )}

                <Button
                  type="submit"
                  className="login-button"
                  style={{ marginTop: 18 }}
                  disabled={phoneLoading}
                >
                  {phoneLoading
                    ? "Preparing..."
                    : DEMO_OTP_MODE
                      ? "Show Demo OTP"
                      : "Send SMS OTP"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handlePhoneVerify} noValidate>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                    color: "#a8a29e",
                    marginBottom: 10,
                  }}
                >
                  <span>
                    {DEMO_OTP_MODE
                      ? `Demo OTP for +91 ${phone}: ${demoOtpCode}`
                      : `Code sent to +91 ${phone}`}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setPhoneStage("input")
                      setOtpCode("")
                      setPhoneError("")
                    }}
                  >
                    Change
                  </button>
                </div>

                <label htmlFor="login-otp">
                  Enter 6-Digit {DEMO_OTP_MODE ? "Demo Code" : "SMS OTP"}
                </label>
                <input
                  id="login-otp"
                  type="text"
                  maxLength={6}
                  autoFocus
                  placeholder="0 0 0 0 0 0"
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, ""))
                  }
                  style={{
                    height: "48px",
                    letterSpacing: "0.25em",
                    textAlign: "center",
                    fontSize: "20px",
                    fontWeight: 800,
                  }}
                  disabled={phoneLoading}
                />

                {phoneError && (
                  <div
                    className="form-error"
                    style={{ marginTop: 14 }}
                    role="alert"
                  >
                    <AlertTriangle
                      style={{
                        width: 16,
                        height: 16,
                        display: "inline",
                        verticalAlign: "middle",
                        marginRight: 6,
                      }}
                    />
                    {phoneError}
                  </div>
                )}

                {phoneSuccess && (
                  <div
                    className="form-success"
                    style={{ marginTop: 14 }}
                    role="status"
                  >
                    {phoneSuccess}
                  </div>
                )}

                <Button
                  type="submit"
                  className="login-button"
                  style={{ marginTop: 18 }}
                  disabled={phoneLoading || otpCode.length < 6}
                >
                  {phoneLoading ? "Verifying..." : "Verify & Unlock Access"}
                </Button>

                <div
                  style={{
                    textAlign: "center",
                    marginTop: 14,
                    fontSize: "12px",
                  }}
                >
                  {resendTimer > 0 ? (
                    <span style={{ color: "#a8a29e" }}>
                      Resend OTP in {resendTimer}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="text-button"
                      onClick={(e) => void handlePhoneSend(e)}
                      disabled={phoneLoading}
                    >
                      {DEMO_OTP_MODE ? "Show Demo OTP Again" : "Resend SMS OTP"}
                    </button>
                  )}
                </div>
              </form>
            )
          ) : (
            <form onSubmit={submitEmail} noValidate>
              <label htmlFor="email">Email or username</label>
              <input
                id="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
                autoComplete="username"
              />
              {errors.email && (
                <span className="field-error" id="email-error">
                  {errors.email}
                </span>
              )}
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? "password-error" : undefined
                  }
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.password && (
                <span className="field-error" id="password-error">
                  {errors.password}
                </span>
              )}
              <div className="form-options">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={forgotPassword}
                >
                  Forgot Password
                </button>
              </div>
              {errors.form && (
                <div className="form-error" role="alert">
                  {errors.form}
                </div>
              )}
              {success && (
                <div className="form-success" role="status">
                  {success}
                </div>
              )}
              <Button type="submit" className="login-button" disabled={loading}>
                {loading
                  ? "Checking..."
                  : DEMO_MODE
                    ? "Enter demo"
                    : mode === "login"
                      ? "Login"
                      : "Create account"}
              </Button>

              <p className="signup-copy">
                <button
                  type="button"
                  onClick={() => {
                    setMode((current) =>
                      current === "login" ? "signup" : "login",
                    )
                    setErrors({})
                  }}
                >
                  {mode === "login" ? "Sign Up" : "Log in"}
                </button>{" "}
                {mode === "login"
                  ? "if you don't have an account"
                  : "if you already have an account"}
              </p>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
