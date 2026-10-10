import { projectId, publicAnonKey, publishableKey } from "../../utils/supabase/info"
import { supabase } from "./supabase"
import type { AccountData, TrustedContact, UserProfile } from "@/types/profile"
import type { CallAnalysis } from "@/types/call"

const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-409a16ab`

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Please log in again.")
  const isFormData = init?.body instanceof FormData
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      apikey: publishableKey || publicAnonKey,
      ...init?.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(
      typeof body.error === "string" ? body.error : "Something went wrong.",
    )
  return body as T
}

export const accountApi = {
  get: () => request<AccountData>("/account"),
  verifyCallAccess: () =>
    request<{ authorized: boolean; message?: string }>(
      "/account/verify-call-access",
    ),
  updateProfile: (profile: UserProfile) =>
    request<{ profile: UserProfile }>("/account/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    }),
  saveContact: (contact: TrustedContact) =>
    request<{ trustedContact: TrustedContact }>("/account/trusted-contact", {
      method: "PUT",
      body: JSON.stringify(contact),
    }),
  deleteContact: () =>
    request<{ trustedContact: null }>("/account/trusted-contact", {
      method: "DELETE",
    }),
  saveAnalysis: (analysis: CallAnalysis) =>
    request<{ saved: boolean; reason?: string }>("/account/analyses", {
      method: "POST",
      body: JSON.stringify({
        score: analysis.score,
        level: analysis.level,
        firstWarningMs: analysis.firstWarningMs,
        tactics: analysis.tactics
          .filter((tactic) => tactic.score > 0)
          .map((tactic) => tactic.shortName),
        redactedSnippet: analysis.transcript.at(-1)?.text ?? "",
      }),
    }),
  alertFamily: (riskLevel: CallAnalysis["level"]) =>
    request<{ message: string }>("/account/family-alerts", {
      method: "POST",
      body: JSON.stringify({ riskLevel }),
    }),
  deleteData: () =>
    request<{ deleted: boolean }>("/account/data", { method: "DELETE" }),
  transcribeAudio: (file: File) => {
    const form = new FormData()
    form.append("audio", file)
    return request<{
      transcript: string
      semantic: {
        score: number
        level: "low" | "medium" | "high"
        explanation: string
        warning: string
        tactics: Record<string, number>
      }
    }>("/account/transcribe", { method: "POST", body: form })
  },
}
