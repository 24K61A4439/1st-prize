import { genuineCall, scamCall } from "@/data/demoCall"
import { accountApi } from "@/lib/api"
import { analyzeTranscript } from "@/lib/riskEngine"
import type {
  CallAnalysis,
  DemoScenario,
  TranscriptSegment,
} from "@/types/call"

export interface CallAnalysisService {
  streamDemo(
    scenario: DemoScenario,
    onSegment: (segment: TranscriptSegment, index: number) => void,
  ): Promise<CallAnalysis>
  analyzeFile(file: File): Promise<CallAnalysis>
}

const wait = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms))

export const callAnalysisService: CallAnalysisService = {
  async streamDemo(scenario, onSegment) {
    const result = scenario === "scam" ? scamCall : genuineCall
    for (let index = 0; index < result.transcript.length; index += 1) {
      await wait(760)
      onSegment(result.transcript[index], index)
    }
    return result
  },
  async analyzeFile(file) {
    const startedAt = performance.now()
    const { transcript, semantic } = await accountApi.transcribeAudio(file)
    const local = analyzeTranscript(
      transcript,
      Math.round(performance.now() - startedAt),
    )
    return {
      ...local,
      score: semantic.score,
      level: semantic.level,
      warning: semantic.warning || local.warning,
      explanation: semantic.explanation || local.explanation,
      tactics: local.tactics.map((tactic) => ({
        ...tactic,
        score: Math.max(
          tactic.score,
          Number(semantic.tactics[tactic.shortName]) || 0,
        ),
      })),
    }
  },
}
