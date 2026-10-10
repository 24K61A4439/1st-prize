import { MessageSquareText } from "lucide-react"
import type { TranscriptSegment } from "@/types/call"

export default function Transcript({
  segments,
  running,
  emptyMessage = "Start the demo or upload audio to see the conversation appear here.",
}: {
  segments: TranscriptSegment[]
  running: boolean
  emptyMessage?: string
}) {
  return (
    <section className="transcript-panel" aria-labelledby="transcript-title">
      <div className="section-heading">
        <span className="section-icon">
          <MessageSquareText aria-hidden="true" />
        </span>
        <div>
          <h2 id="transcript-title">Live transcript</h2>
          <p>Risky language is marked as it is heard.</p>
        </div>
        {running && (
          <span className="live-indicator">
            <i /> Listening
          </span>
        )}
      </div>
      <div className="transcript-stream" aria-live="polite">
        {!segments.length && (
          <div className="empty-state">
            <MessageSquareText aria-hidden="true" />
            <p>{emptyMessage}</p>
          </div>
        )}
        {segments.map((segment) => {
          const parts = segment.highlight
            ? segment.text.split(segment.highlight)
            : [segment.text]
          return (
            <div className="transcript-line" key={segment.id}>
              <time>{segment.time}</time>
              <p>
                {segment.speaker && (
                  <strong className="transcript-speaker">
                    {segment.speaker}:{" "}
                  </strong>
                )}
                {parts[0]}
                {segment.highlight && (
                  <mark>
                    {segment.highlight}
                    <small>{segment.tactic}</small>
                  </mark>
                )}
                {parts[1]}
              </p>
            </div>
          )
        })}
        {running && (
          <div className="typing-dots" aria-label="Transcribing">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </section>
  )
}
