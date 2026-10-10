import type { CallAnalysis } from "@/types/call"

export const scamCall: CallAnalysis = {
  score: 87,
  level: "high",
  firstWarningMs: 1800,
  warning: "Do not share your OTP.",
  explanation:
    "The caller claims to represent an authority, creates fear, asks you not to tell anyone, and requests sensitive information.",
  transcript: [
    {
      id: 1,
      time: "00:02",
      text: "Hello, I am calling from your bank's KYC department.",
      highlight: "bank's KYC department",
      tactic: "Authority",
    },
    {
      id: 2,
      time: "00:06",
      text: "Your account will be blocked today unless we verify it now.",
      highlight: "blocked today",
      tactic: "Threat",
    },
    {
      id: 3,
      time: "00:11",
      text: "Please do not discuss this verification with anyone.",
      highlight: "do not discuss",
      tactic: "Secrecy",
    },
    {
      id: 4,
      time: "00:15",
      text: "Read the six-digit OTP that was just sent to your phone.",
      highlight: "Read the six-digit OTP",
      tactic: "OTP Request",
    },
  ],
  tactics: [
    { name: "Authority Impersonation", shortName: "Authority", score: 85 },
    { name: "Threat / Fear", shortName: "Threat", score: 92 },
    { name: "Secrecy", shortName: "Secrecy", score: 76 },
    { name: "OTP / Payment", shortName: "OTP Request", score: 96 },
    { name: "Urgency", shortName: "Urgency", score: 58 },
    { name: "Emotional Trick", shortName: "Emotional Trick", score: 20 },
  ],
}

export const genuineCall: CallAnalysis = {
  score: 14,
  level: "low",
  firstWarningMs: 1200,
  warning: "No dangerous request detected.",
  explanation:
    "The caller explains a transaction alert but does not ask for your OTP, PIN, payment, or secrecy.",
  transcript: [
    {
      id: 1,
      time: "00:02",
      text: "This is an automated fraud check from your bank.",
    },
    {
      id: 2,
      time: "00:06",
      text: "Did you make a purchase for ₹2,400? Press 1 for yes or call the number printed on your card.",
    },
    {
      id: 3,
      time: "00:11",
      text: "We will never ask for your OTP, PIN, or password.",
    },
  ],
  tactics: [
    { name: "Authority Impersonation", shortName: "Authority", score: 18 },
    { name: "Threat / Fear", shortName: "Threat", score: 8 },
    { name: "Secrecy", shortName: "Secrecy", score: 0 },
    { name: "OTP / Payment", shortName: "OTP Request", score: 0 },
    { name: "Urgency", shortName: "Urgency", score: 22 },
    { name: "Emotional Trick", shortName: "Emotional Trick", score: 0 },
  ],
}
