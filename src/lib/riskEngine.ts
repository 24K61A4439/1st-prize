import type {
  CallAnalysis,
  RiskLevel,
  TacticName,
  TacticScore,
  TranscriptSegment,
} from "@/types/call"

interface PatternGroup {
  name: string
  shortName: TacticName
  patterns: RegExp[]
}

const groups: PatternGroup[] = [
  {
    name: "Authority Impersonation",
    shortName: "Authority",
    patterns: [
      /\b(?:bank|state bank|sbi|hdfc|icici|axis|police|mumbai police|delhi police|cbi|rbi|income tax|customs|narcotics|telecom|trai|government|kyc department|branch manager|cyber crime|crime branch|officer|inspector)\b/i,
      /(?:बैंक|पुलिस|सीबीआई|आरबीआई|कस्टम|क्राइम ब्रांच|अधिकारी|केवाईसी|सरकार)/i,
    ],
  },
  {
    name: "Threat / Fear",
    shortName: "Threat",
    patterns: [
      /\b(?:blocked|suspended|freeze|frozen|deactivated|arrest|digital arrest|warrant|fir|legal action|court order|jail|penalty|fine|disconnect(?:ed)? in \d+|parcel containing drugs|illegal package)\b/i,
      /(?:बंद|गिरफ्तार|डिजिटल अरेस्ट|जेल|कार्रवाई|अकाउंट ब्लॉक|सिम ब्लॉक|वारंट|एफआईआर|अवैध पार्सल)/i,
    ],
  },
  {
    name: "Secrecy",
    shortName: "Secrecy",
    patterns: [
      /\b(?:do not tell|don't tell|keep (?:this )?secret|do not discuss|without telling|confidential|do not disconnect|don't hang up|stay on (?:the )?line|stay in (?:the )?room|isolated|camera on)\b/i,
      /(?:किसी को मत बताना|गुप्त|किसी से मत कहना|फोन मत काटना|लाइन पर रहो|कमरे में रहो)/i,
    ],
  },
  {
    name: "OTP / Payment",
    shortName: "OTP Request",
    patterns: [
      /\b(?:share|tell|read|send|give|enter|verify)\b.{0,28}\b(?:otp|one time password|pin|upi pin|password|cvv|code|card number|credential)\b/i,
      /\b(?:transfer|send|pay|deposit)\b.{0,28}(?:₹|rs\.?|rupees?|money|funds?|amount|safety account|secret account|verification account)\b/i,
      /\b(?:approve|accept|click)\b.{0,24}\b(?:request|collect request|upi|payment|link)\b/i,
      /\b(?:install|download)\b.{0,24}\b(?:anydesk|teamviewer|rustdesk|quicksupport|apk|support app|remote access)\b/i,
      /(?:ओटीपी|पिन|यूपीआई|पासवर्ड|सीवीवी).{0,24}(?:बताओ|बताना|शेयर|भेजो|दर्ज)/i,
      /(?:पैसे|रुपये).{0,24}(?:भेजो|ट्रांसफर|डालो)/i,
    ],
  },
  {
    name: "Urgency",
    shortName: "Urgency",
    patterns: [
      /\b(?:immediately|right now|today only|within \d+ minutes?|urgent|urgently|quickly|last chance|final notice|final warning|before \d+)\b/i,
      /(?:अभी|तुरंत|जल्दी|आज ही|\d+ मिनट)/i,
    ],
  },
  {
    name: "Emotional Trick",
    shortName: "Emotional Trick",
    patterns: [
      /\b(?:your (?:son|daughter|grandchild|family|brother|sister|child)|accident|hospital|emergency|help me|in trouble|custody|kidnap|severe condition)\b/i,
      /(?:बेटा|बेटी|पोता|पोती|अस्पताल|मुसीबत|मदद|एक्सीडेंट|कस्टडी)/i,
    ],
  },
]

const safeOtpLanguage =
  /\b(?:never|do not|don't|won't|will not)\b.{0,24}\b(?:ask|share|tell|read|give)\b.{0,20}\b(?:otp|pin|password|cvv)\b/i

const levelForScore = (score: number): RiskLevel =>
  score >= 70 ? "high" : score >= 40 ? "medium" : "low"

export function analyzeTranscript(
  text: string,
  firstWarningMs = 0,
): CallAnalysis {
  const normalized = text.trim()
  const scores = new Map<TacticName, number>()
  const matches = new Map<TacticName, string>()
  const matchedPhrases: string[] = []

  for (const group of groups) {
    let hits = 0
    for (const pattern of group.patterns) {
      const match = normalized.match(pattern)
      if (match) {
        hits += 1
        const matchedStr = match[0].trim()
        if (!matches.has(group.shortName)) {
          matches.set(group.shortName, matchedStr)
        }
        if (!matchedPhrases.includes(matchedStr)) {
          matchedPhrases.push(matchedStr)
        }
      }
    }
    // Incremental scoring per tactic:
    // 1 hit = 35% (medium alert for that tactic), multiple hits = up to 95%
    scores.set(group.shortName, hits === 0 ? 0 : Math.min(95, 25 + hits * 30))
  }

  // False alarm check: Genuine bank OTP warning phrases
  if (safeOtpLanguage.test(normalized)) {
    scores.set("OTP Request", 0)
    matches.delete("OTP Request")
  }

  const otp = scores.get("OTP Request") ?? 0
  const secrecy = scores.get("Secrecy") ?? 0
  const threat = scores.get("Threat") ?? 0
  const authority = scores.get("Authority") ?? 0
  const urgency = scores.get("Urgency") ?? 0
  const emotion = scores.get("Emotional Trick") ?? 0

  // Count active signals with meaningful weight
  const activeTacticCount = [otp, secrecy, threat, authority, urgency, emotion].filter(
    (s) => s > 0,
  ).length

  // Base weighted score
  let score = Math.round(
    otp * 0.32 +
      threat * 0.22 +
      secrecy * 0.16 +
      authority * 0.14 +
      urgency * 0.10 +
      emotion * 0.06,
  )

  // Compound rules: Avoid declaring a scam from one keyword alone!
  // High risk triggers when dangerous combinations converge:
  if (otp >= 50 && (threat >= 50 || secrecy >= 50 || authority >= 50)) {
    score = Math.max(score, 78 + Math.round((otp + threat + secrecy) / 15))
  } else if (threat >= 50 && authority >= 50 && (urgency >= 50 || secrecy >= 50)) {
    score = Math.max(score, 74 + Math.round((threat + authority) / 20))
  } else if (activeTacticCount <= 1) {
    // Single isolated keyword is capped at 32% (Low Risk) to prevent false positives
    score = Math.min(score, 32)
  }

  if (!normalized) score = 0
  score = Math.min(99, score)

  const tactics: TacticScore[] = groups.map((group) => ({
    name: group.name,
    shortName: group.shortName,
    score: scores.get(group.shortName) ?? 0,
    evidence: matches.get(group.shortName),
  }))

  const detected = tactics.filter((tactic) => tactic.score > 0)
  const level = levelForScore(score)

  let warning = "No dangerous request detected."
  if (level === "high") {
    warning = "POTENTIAL SCAM DETECTED: Caller demands sensitive action under pressure."
  } else if (level === "medium") {
    if (threat > 0) warning = "Suspicious threat or account-blocking claim detected."
    else if (otp > 0) warning = "Possible sensitive credential request detected."
    else warning = "Urgent pressure detected. Verify independently before acting."
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  const transcript: TranscriptSegment[] = sentences.map((sentence, index) => {
    const found = detected.find((tactic) => {
      const phrase = matches.get(tactic.shortName)
      return phrase && sentence.toLowerCase().includes(phrase.toLowerCase())
    })
    return {
      id: index + 1,
      time: new Date(index * 3000).toISOString().slice(14, 19),
      text: sentence,
      highlight: found ? matches.get(found.shortName) : undefined,
      tactic: found?.shortName,
    }
  })

  let explanation = "No manipulation pattern or request for sensitive information was detected."
  if (detected.length > 0) {
    explanation = `The call contains ${detected
      .map((tactic) => tactic.shortName.toLowerCase())
      .join(", ")} signals. High risk occurs when multiple manipulation tactics combine.`
  }

  return {
    score,
    level,
    firstWarningMs,
    transcript,
    tactics,
    warning,
    explanation,
    matchedPhrases,
  }
}

