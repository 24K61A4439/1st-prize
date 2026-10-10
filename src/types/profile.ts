export type Language =
  | "English"
  | "Hindi"
  | "Marathi"
  | "Telugu"
  | "Tamil"
  | "Bengali"

export interface UserProfile {
  name: string
  phone: string
  email: string
  age: number
  language: Language
  memberSince: string
  saveAnalysis: boolean
}

export interface TrustedContact {
  name: string
  relationship: string
  phone: string
}

export interface AccountData {
  profile: UserProfile
  trustedContact: TrustedContact | null
  analyses: SavedAnalysis[]
  alerts: unknown[]
}

export interface SavedAnalysis {
  id: string
  createdAt: string
  score: number
  level: "low" | "medium" | "high"
  firstWarningMs: number
  tactics: string[]
  redactedSnippet: string
}
