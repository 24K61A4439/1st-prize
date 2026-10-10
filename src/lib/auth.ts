import { accountApi } from "./api"
import { supabase } from "./supabase"
import { DEMO_OTP_CODE, DEMO_OTP_MODE } from "@/config"

const DEMO_PHONE_SESSION_KEY = "falcon-demo-phone-hash"

export interface AuthCredentials {
  email: string
  password: string
}

export interface AuthSession {
  userId: string
  email: string
  phone?: string
  expiresAt: string
}

export type AuthResult =
  | { ok: true; session: AuthSession | null; message?: string }
  | {
      ok: false
      code: "AUTH_ERROR"
      message: string
    }

const toSession = (
  session:
    | {
        user: { id: string; email?: string; phone?: string }
        expires_at?: number
      }
    | null,
): AuthSession | null => {
  if (!session?.user) return null
  if (!session.user.email && !session.user.phone) return null
  return {
    userId: session.user.id,
    email: session.user.email || session.user.phone || "",
    phone: session.user.phone,
    expiresAt: new Date((session.expires_at ?? 0) * 1000).toISOString(),
  }
}

export async function signIn(
  credentials: AuthCredentials,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword(credentials)
  if (error) return { ok: false, code: "AUTH_ERROR", message: error.message }
  return { ok: true, session: toSession(data.session) }
}

export async function signUp(
  credentials: AuthCredentials,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp(credentials)
  if (error) return { ok: false, code: "AUTH_ERROR", message: error.message }
  return {
    ok: true,
    session: toSession(data.session),
    message: data.session
      ? "Your account is ready."
      : "Check your email to confirm your account, then log in.",
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function getSession(): Promise<AuthSession | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  return toSession(data.session)
}

export async function resetPassword(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  })
  if (error) return { ok: false, code: "AUTH_ERROR", message: error.message }
  return {
    ok: true,
    session: null,
    message: "Password reset instructions were sent to your email.",
  }
}

// SHA-256 hashes of the authorized team phone numbers (last 10 digits)
// Never exposes phone numbers in plaintext in frontend code, UI, or logs
export const AUTHORIZED_PHONE_HASHES = [
  "0001942723507f043509e3cb58412d1bfbb8b6f6d2bb8d3839b3200c86b65ef4",
  "dddee5fba01d2eaed2296433848061c46057fc07072de770d1f2a69d90acce69",
]

export function isAuthorizedPhoneHash(hash: string): boolean {
  return AUTHORIZED_PHONE_HASHES.includes(hash)
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (phone.startsWith("+")) return `+${digits}`
  if (digits.length === 10) return `+91${digits}`
  return `+${digits}`
}

async function hashPhone(digits10: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(digits10)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function getAuthorizedPhoneHash(phone: string): Promise<string | null> {
  const digits = phone.replace(/\D/g, "")
  const digits10 =
    digits.length === 10
      ? digits
      : digits.length === 12 && digits.startsWith("91")
        ? digits.slice(2)
        : ""

  if (!digits10) return null
  const hash = await hashPhone(digits10)
  return isAuthorizedPhoneHash(hash) ? hash : null
}

export function clearDemoPhoneSession(): void {
  if (DEMO_OTP_MODE) sessionStorage.removeItem(DEMO_PHONE_SESSION_KEY)
}

async function isAuthorizedPhone(phone: string): Promise<boolean> {
  return (await getAuthorizedPhoneHash(phone)) !== null
}

export async function sendPhoneOtp(
  phone: string,
): Promise<{
  ok: boolean
  message: string
  providerDisabled?: boolean
  demoOtp?: string
}> {
  const formatted = formatPhone(phone)
  const digits = phone.replace(/\D/g, "")
  if (
    digits.length !== 10 &&
    !(digits.length === 12 && digits.startsWith("91"))
  ) {
    return {
      ok: false,
      message: "Please enter a valid 10-digit mobile phone number.",
    }
  }

  if (!(await isAuthorizedPhone(phone))) {
    return {
      ok: false,
      message:
        "Only authorized team phone numbers can request an OTP for live calls.",
    }
  }

  if (DEMO_OTP_MODE) {
    return {
      ok: true,
      message: "Local demo OTP ready. No SMS was sent.",
      demoOtp: DEMO_OTP_CODE,
    }
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone: formatted,
  })

  if (error) {
    const errorText = error.message.toLowerCase()
    const errorCode = ((error as any).code || "").toString().toLowerCase()
    const isProviderDisabled =
      errorText.includes("unsupported phone provider") ||
      errorCode === "phone_provider_disabled" ||
      errorText.includes("phone provider is disabled") ||
      errorText.includes("provider is not enabled")

    return {
      ok: false,
      message: isProviderDisabled
        ? "Supabase Phone Auth is disabled on this project. An SMS Provider (e.g., Twilio, MessageBird) must be configured in your Supabase Dashboard."
        : error.message,
      providerDisabled: isProviderDisabled,
    }
  }

  return {
    ok: true,
    message:
      "Supabase accepted the OTP request, but SMS delivery is not confirmed. Check your phone and SMS provider delivery logs.",
  }
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<{
  ok: boolean
  message: string
  authorized?: boolean
  error?: string
  phoneMasked?: string
  userId?: string
  phoneHash?: string
}> {
  if (DEMO_OTP_MODE) {
    const phoneHash = await getAuthorizedPhoneHash(phone)
    if (!phoneHash) {
      return {
        ok: true,
        authorized: false,
        message: "Phone number is not authorized for demo call access.",
      }
    }
    if (token.trim() !== DEMO_OTP_CODE) {
      return {
        ok: false,
        message: "Incorrect demo code. Enter the demo OTP shown above.",
      }
    }

    sessionStorage.setItem(DEMO_PHONE_SESSION_KEY, phoneHash)
    const digits10 = phone.replace(/\D/g, "").slice(-10)
    return {
      ok: true,
      authorized: true,
      message: "Demo phone verified. Call access unlocked.",
      phoneMasked: `+XX-XXXXXX${digits10.slice(-4)}`,
      userId: `demo-${phoneHash.slice(0, 12)}`,
      phoneHash,
    }
  }

  const formatted = formatPhone(phone)

  const { data, error } = await supabase.auth.verifyOtp({
    phone: formatted,
    token: token.trim(),
    type: "sms",
  })

  if (error || !data.session) {
    return {
      ok: false,
      message:
        error?.message || "Invalid or expired OTP token. Please try again.",
    }
  }

  // Validate authenticated user phone against authorized allowlist via backend & cryptographic hash
  const allowResult = await checkPhoneCallAuthorization(data.session.user)
  if (!allowResult.authorized) {
    return {
      ok: true,
      authorized: false,
      message: "Phone verified, but access is denied.",
      error: allowResult.error,
    }
  }

  return {
    ok: true,
    authorized: true,
    message: "Phone verified and authorized as team member.",
    phoneMasked: allowResult.phoneMasked,
    userId: allowResult.userId,
    phoneHash: allowResult.phoneHash,
  }
}

export async function checkPhoneCallAuthorization(
  userParam?: any,
): Promise<{
  authorized: boolean
  error?: string
  phoneMasked?: string
  userId?: string
  phoneHash?: string
}> {
  if (DEMO_OTP_MODE) {
    const demoPhoneHash = sessionStorage.getItem(DEMO_PHONE_SESSION_KEY)
    if (demoPhoneHash && isAuthorizedPhoneHash(demoPhoneHash)) {
      return {
        authorized: true,
        userId: `demo-${demoPhoneHash.slice(0, 12)}`,
        phoneHash: demoPhoneHash,
        phoneMasked: "Verified Demo Team Member",
      }
    }
  }

  let user = userParam
  if (!user) {
    const { data } = await supabase.auth.getUser()
    user = data?.user
  }

  if (!user?.phone || !user?.phone_confirmed_at) {
    return {
      authorized: false,
      error: "Phone number has not been verified via SMS OTP.",
    }
  }

  const digits10 = user.phone.replace(/\D/g, "").slice(-10)
  const hashed = await hashPhone(digits10)

  // 1. Verify that cryptographic SHA-256 of verified phone matches authorized team allowlist
  if (!AUTHORIZED_PHONE_HASHES.includes(hashed)) {
    return {
      authorized: false,
      error:
        "ACCESS DENIED: This verified phone number is not on the authorized team member allowlist.",
    }
  }

  // 2. Enforce allowlist check securely on the backend using authenticated Supabase user data
  try {
    const backendResult = await accountApi.verifyCallAccess()
    if (!backendResult.authorized) {
      return {
        authorized: false,
        error:
          "ACCESS DENIED: Backend verification rejected access for this phone number.",
      }
    }
  } catch (backendErr: any) {
    return {
      authorized: false,
      error:
        backendErr?.message ||
        "ACCESS DENIED: Backend allowlist verification failed.",
    }
  }

  return {
    authorized: true,
    userId: user.id,
    phoneHash: hashed,
    phoneMasked: `+XX-XXXXXX${digits10.slice(-4)}`,
  }
}
