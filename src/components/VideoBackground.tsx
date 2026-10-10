import { useEffect, useRef } from "react"

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104036_bd6924f6-3c8e-417e-8465-6d03c8c2e9e6.mp4"
const POSTER_URL =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/82e7eb75-c65f-490a-99b5-f3d1cad54200.webp"
const FADE = 0.9

export default function VideoBackground() {
  const aRef = useRef<HTMLVideoElement>(null)
  const bRef = useRef<HTMLVideoElement>(null)
  const activeRef = useRef<"a" | "b">("a")
  const swappingRef = useRef(false)

  useEffect(() => {
    const a = aRef.current
    const b = bRef.current
    if (!a || !b) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")

    const holdFirstFrame = () => {
      a.pause()
      b.pause()
      a.currentTime = 0
      b.currentTime = 0
      a.classList.add("is-active")
      b.classList.remove("is-active")
    }

    const swap = () => {
      if (reduced.matches || swappingRef.current) return
      const current = activeRef.current === "a" ? a : b
      const next = activeRef.current === "a" ? b : a
      if (!current.duration || current.duration - current.currentTime > FADE)
        return
      swappingRef.current = true
      next.currentTime = 0
      void next.play().catch(() => undefined)
      next.classList.add("is-active")
      current.classList.remove("is-active")
      activeRef.current = activeRef.current === "a" ? "b" : "a"
      window.setTimeout(
        () => {
          current.pause()
          current.currentTime = 0
          swappingRef.current = false
        },
        FADE * 1000 + 100,
      )
    }

    const onMotionChange = () => {
      if (reduced.matches) holdFirstFrame()
      else void a.play().catch(() => undefined)
    }

    a.addEventListener("timeupdate", swap)
    b.addEventListener("timeupdate", swap)
    reduced.addEventListener("change", onMotionChange)
    onMotionChange()
    return () => {
      a.removeEventListener("timeupdate", swap)
      b.removeEventListener("timeupdate", swap)
      reduced.removeEventListener("change", onMotionChange)
    }
  }, [])

  return (
    <div className="video-layer" aria-hidden="true">
      <div className="video-bleed">
        <video
          ref={aRef}
          className="bg-video is-active"
          src={VIDEO_URL}
          poster={POSTER_URL}
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          autoPlay
          aria-hidden="true"
        />
        <video
          ref={bRef}
          className="bg-video"
          src={VIDEO_URL}
          poster={POSTER_URL}
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          aria-hidden="true"
        />
        <div className="video-scrim" />
      </div>
    </div>
  )
}
