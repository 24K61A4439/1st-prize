import { CheckCircle2, X } from "lucide-react"

interface ToastProps {
  message: string
  onClose: () => void
}

export default function Toast({ message, onClose }: ToastProps) {
  return (
    <div className="toast" role="status">
      <CheckCircle2 aria-hidden="true" />
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss notification">
        <X aria-hidden="true" />
      </button>
    </div>
  )
}
