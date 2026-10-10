import type { HTMLAttributes, ReactNode } from "react"

export default function Card({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`glass-card ${className}`} {...props}>
      {children}
    </div>
  )
}
