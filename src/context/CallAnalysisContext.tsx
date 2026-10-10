import { createContext, useContext, useState, type ReactNode } from "react"
import { accountApi } from "@/lib/api"
import { callAnalysisService } from "@/lib/callAnalysisService"
import { analyzeTranscript } from "@/lib/riskEngine"
import type {
  CallAnalysis,
  DemoScenario,
  PipelineStatus,
  TranscriptSegment,
} from "@/types/call"

export type AnalysisMode = "upload" | "live"

interface AnalysisWorkspace {
  analysis: CallAnalysis
  visibleTranscript: TranscriptSegment[]
  running: boolean
  pipeline: PipelineStatus[]
}

interface CallContextValue {
  workspaces: Record<AnalysisMode, AnalysisWorkspace>
  activeMode: AnalysisMode
  runDemo: (mode: AnalysisMode, scenario: DemoScenario) => Promise<void>
  analyzeFile: (mode: AnalysisMode, file: File) => Promise<void>
  analyzeLiveText: (
    mode: AnalysisMode,
    text: string,
    elapsedMs: number,
  ) => void
  updateLiveConversation: (
    mode: AnalysisMode,
    segments: Array<{ text: string; speaker?: string; time?: string }>,
    elapsedMs?: number,
  ) => void
  resetLiveAnalysis: (mode: AnalysisMode) => void
}

const createWorkspace = (): AnalysisWorkspace => ({
  analysis: analyzeTranscript(""),
  visibleTranscript: [],
  running: false,
  pipeline: ["idle", "idle", "idle"],
})

const CallContext = createContext<CallContextValue | null>(null)

export function CallAnalysisProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<
    Record<AnalysisMode, AnalysisWorkspace>
  >({
    upload: createWorkspace(),
    live: createWorkspace(),
  })
  const [activeMode, setActiveMode] = useState<AnalysisMode>("upload")

  const updateWorkspace = (
    mode: AnalysisMode,
    update: (workspace: AnalysisWorkspace) => AnalysisWorkspace,
  ) => {
    setWorkspaces((current) => ({
      ...current,
      [mode]: update(current[mode]),
    }))
  }

  const runDemo = async (mode: AnalysisMode, scenario: DemoScenario) => {
    if (workspaces[mode].running) return
    setActiveMode(mode)
    updateWorkspace(mode, (workspace) => ({
      ...workspace,
      running: true,
      visibleTranscript: [],
      pipeline: ["active", "idle", "idle"],
    }))
    const result = await callAnalysisService.streamDemo(
      scenario,
      (segment, index) => {
        updateWorkspace(mode, (workspace) => ({
          ...workspace,
          visibleTranscript: [...workspace.visibleTranscript, segment],
          pipeline:
            index === 0
              ? ["done", "active", "idle"]
              : index === 1
                ? ["done", "done", "active"]
                : workspace.pipeline,
        }))
      },
    )
    updateWorkspace(mode, (workspace) => ({
      ...workspace,
      analysis: result,
      running: false,
      pipeline: ["done", "done", "done"],
    }))
    void accountApi.saveAnalysis(result).catch(() => undefined)
  }

  const analyzeFile = async (mode: AnalysisMode, file: File) => {
    setActiveMode(mode)
    updateWorkspace(mode, (workspace) => ({
      ...workspace,
      running: true,
      pipeline: ["active", "idle", "idle"],
    }))
    try {
      const result = await callAnalysisService.analyzeFile(file)
      updateWorkspace(mode, (workspace) => ({
        ...workspace,
        analysis: result,
        visibleTranscript: result.transcript,
        pipeline: ["done", "done", "done"],
      }))
      void accountApi.saveAnalysis(result).catch(() => undefined)
    } catch (error) {
      updateWorkspace(mode, (workspace) => ({
        ...workspace,
        pipeline: ["idle", "idle", "idle"],
      }))
      throw error
    } finally {
      updateWorkspace(mode, (workspace) => ({
        ...workspace,
        running: false,
      }))
    }
  }

  const resetLiveAnalysis = (mode: AnalysisMode) => {
    setActiveMode(mode)
    updateWorkspace(mode, () => ({
      analysis: analyzeTranscript(""),
      visibleTranscript: [],
      running: false,
      pipeline: ["active", "idle", "idle"],
    }))
  }

  const analyzeLiveText = (
    mode: AnalysisMode,
    text: string,
    elapsedMs: number,
  ) => {
    setActiveMode(mode)
    const result = analyzeTranscript(text, elapsedMs)
    updateWorkspace(mode, (workspace) => ({
      ...workspace,
      analysis: result,
      visibleTranscript: result.transcript,
      pipeline: text
        ? ["done", "done", "done"]
        : ["active", "idle", "idle"],
    }))
  }

  const updateLiveConversation = (
    mode: AnalysisMode,
    segments: Array<{ text: string; speaker?: string; time?: string }>,
    elapsedMs = 0,
  ) => {
    setActiveMode(mode)
    const combinedText = segments.map((s) => s.text).join(". ")
    const result = analyzeTranscript(combinedText, elapsedMs)

    const enhancedTranscript: TranscriptSegment[] = segments.map((seg, idx) => {
      const match = result.tactics
        .filter((t) => t.score > 0 && t.evidence)
        .find(
          (t) =>
            t.evidence &&
            seg.text.toLowerCase().includes(t.evidence.toLowerCase()),
        )

      return {
        id: idx + 1,
        time: seg.time || new Date(idx * 3000).toISOString().slice(14, 19),
        text: seg.text,
        speaker: seg.speaker,
        highlight: match?.evidence,
        tactic: match?.shortName,
      }
    })

    const finalAnalysis: CallAnalysis = {
      ...result,
      transcript:
        enhancedTranscript.length > 0
          ? enhancedTranscript
          : result.transcript,
    }

    updateWorkspace(mode, (workspace) => ({
      ...workspace,
      analysis: finalAnalysis,
      visibleTranscript: finalAnalysis.transcript,
      pipeline: combinedText
        ? ["done", "done", "done"]
        : ["active", "idle", "idle"],
    }))
  }

  return (
    <CallContext.Provider
      value={{
        workspaces,
        activeMode,
        runDemo,
        analyzeFile,
        analyzeLiveText,
        updateLiveConversation,
        resetLiveAnalysis,
      }}
    >
      {children}
    </CallContext.Provider>
  )
}

export function useCallAnalysis(mode?: AnalysisMode) {
  const context = useContext(CallContext)
  if (!context)
    throw new Error("useCallAnalysis must be used within CallAnalysisProvider")

  const selectedMode = mode ?? context.activeMode
  return {
    ...context.workspaces[selectedMode],
    mode: selectedMode,
    runDemo: (scenario: DemoScenario) => context.runDemo(selectedMode, scenario),
    analyzeFile: (file: File) => context.analyzeFile(selectedMode, file),
    analyzeLiveText: (text: string, elapsedMs: number) =>
      context.analyzeLiveText(selectedMode, text, elapsedMs),
    updateLiveConversation: (
      segments: Array<{ text: string; speaker?: string; time?: string }>,
      elapsedMs?: number,
    ) => context.updateLiveConversation(selectedMode, segments, elapsedMs),
    resetLiveAnalysis: () => context.resetLiveAnalysis(selectedMode),
  }
}
