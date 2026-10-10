export type RiskLevel = "low" | "medium" | "high"
export type PipelineStatus = "idle" | "active" | "done"

export interface TranscriptSegment {
  id: number
  time: string
  text: string
  highlight?: string
  tactic?: TacticName
  speaker?: string
}

export type TacticName =
  | "Authority"
  | "Threat"
  | "Secrecy"
  | "OTP Request"
  | "Urgency"
  | "Emotional Trick"

export interface TacticScore {
  name: string
  shortName: TacticName
  score: number
  evidence?: string
}

export interface CallAnalysis {
  score: number
  level: RiskLevel
  firstWarningMs: number
  transcript: TranscriptSegment[]
  tactics: TacticScore[]
  warning: string
  explanation: string
  matchedPhrases?: string[]
}

export type DemoScenario = "scam" | "genuine"

