import { RealtimeChannel } from "@supabase/supabase-js"
import { checkPhoneCallAuthorization, isAuthorizedPhoneHash } from "./auth"
import { supabase } from "./supabase"

export type WebRtcStatus =
  | "idle"
  | "permission_pending"
  | "waiting_for_peer"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "ended"

export interface WebRtcCallbacks {
  onStatusChange: (status: WebRtcStatus) => void
  onRemoteStream: (stream: MediaStream) => void
  onLocalAudioLevel: (level: number) => void
  onRemoteAudioLevel: (level: number) => void
  onPeerJoined?: () => void
  onPeerLeft?: () => void
  onError: (error: string) => void
}

export interface SignalAuth {
  userId: string
  phoneHash: string
  timestamp: number
}

interface SignalPayload {
  type: "presence-join" | "offer" | "answer" | "ice-candidate" | "hangup"
  from: string
  to?: string
  auth?: SignalAuth
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

export class WebRtcCallSession {
  private roomId: string
  private clientId: string
  private remoteClientId: string | null = null
  private myUserId: string = ""
  private myPhoneHash: string = ""
  private remotePhoneHash: string | null = null
  private callbacks: WebRtcCallbacks
  private channel: RealtimeChannel | null = null
  private pc: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private pendingCandidates: RTCIceCandidateInit[] = []
  private audioContext: AudioContext | null = null
  private localAnalyser: AnalyserNode | null = null
  private remoteAnalyser: AnalyserNode | null = null
  private levelAnimFrame: number | null = null
  private isMuted = false
  private isCleanedUp = false

  constructor(roomId: string, callbacks: WebRtcCallbacks) {
    this.roomId = roomId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "falcon-secure-demo"
    this.clientId = `peer-${Math.random().toString(36).slice(2, 9)}`
    this.callbacks = callbacks
  }

  public async start(): Promise<void> {
    this.isCleanedUp = false
    this.callbacks.onStatusChange("permission_pending")

    // Enforce OTP verification and team allowlist check before granting room or mic access
    const authCheck = await checkPhoneCallAuthorization()
    if (!authCheck.authorized || !authCheck.userId || !authCheck.phoneHash) {
      this.callbacks.onError(
        authCheck.error || "Access denied: Verified team phone number required to join call room.",
      )
      this.callbacks.onStatusChange("failed")
      return
    }

    this.myUserId = authCheck.userId
    this.myPhoneHash = authCheck.phoneHash

    if (!window.isSecureContext && location.hostname !== "localhost") {
      this.callbacks.onError(
        "Microphone and WebRTC calling require a secure HTTPS connection.",
      )
      this.callbacks.onStatusChange("failed")
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.callbacks.onError(
        "This browser does not support WebRTC audio calling. Please use Chrome, Edge, or Safari.",
      )
      this.callbacks.onStatusChange("failed")
      return
    }

    try {
      // 1. Acquire Local Microphone Audio
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })

      // Setup Web Audio Analyser for local mic
      this.setupLocalAudioAnalysis(this.localStream)
      this.callbacks.onStatusChange("waiting_for_peer")

      // 2. Setup RTCPeerConnection
      this.setupPeerConnection()

      // 3. Connect to Supabase Realtime Signalling
      this.setupSignaling()
    } catch (err) {
      const error = err as Error
      let userFriendlyMessage = "Could not access microphone."
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        userFriendlyMessage =
          "Microphone permission was denied. Please allow microphone access in your browser site settings."
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        userFriendlyMessage = "No microphone was found on this device."
      } else if (error.name === "NotReadableError") {
        userFriendlyMessage =
          "Microphone is currently in use by another app. Please close other calling apps."
      }
      this.callbacks.onError(userFriendlyMessage)
      this.callbacks.onStatusChange("failed")
      this.cleanup()
    }
  }

  private setupPeerConnection() {
    const iceServers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ]

    const turnUrl = import.meta.env.VITE_TURN_URL
    const turnUsername = import.meta.env.VITE_TURN_USERNAME
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL

    if (turnUrl) {
      iceServers.push({
        urls: turnUrl,
        username: turnUsername,
        credential: turnCredential,
      })
    }

    this.pc = new RTCPeerConnection({ iceServers })

    // Add local tracks to RTCPeerConnection
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        this.pc.addTrack(track, this.localStream)
      }
    }

    // Handle incoming remote audio stream
    this.pc.ontrack = (event) => {
      const [stream] = event.streams
      if (stream) {
        this.remoteStream = stream
        this.callbacks.onRemoteStream(stream)
        this.setupRemoteAudioAnalysis(stream)
      }
    }

    // Handle ICE Candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.channel) {
        this.sendSignal({
          type: "ice-candidate",
          from: this.clientId,
          to: this.remoteClientId ?? undefined,
          candidate: event.candidate.toJSON(),
        })
      }
    }

    // Actual Genuine Connection State Tracking
    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return
      const state = this.pc.connectionState
      if (state === "connected") {
        this.callbacks.onStatusChange("connected")
      } else if (state === "connecting") {
        this.callbacks.onStatusChange("connecting")
      } else if (state === "disconnected") {
        this.callbacks.onStatusChange("disconnected")
      } else if (state === "failed") {
        this.callbacks.onStatusChange("failed")
      } else if (state === "closed") {
        this.callbacks.onStatusChange("ended")
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return
      const iceState = this.pc.iceConnectionState
      if (iceState === "connected" || iceState === "completed") {
        this.callbacks.onStatusChange("connected")
      } else if (iceState === "failed") {
        this.callbacks.onStatusChange("failed")
      } else if (iceState === "disconnected") {
        this.callbacks.onStatusChange("disconnected")
      }
    }
  }

  private setupSignaling() {
    const channelName = `falcon-call-room-${this.roomId}`
    this.channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    })

    this.channel.on("broadcast", { event: "signal" }, async (event) => {
      if (this.isCleanedUp) return
      const payload = event.payload as SignalPayload
      if (!payload || payload.from === this.clientId) return

      // Enforce authorization: drop any signaling attempt from unauthorized / unverified participants
      if (!payload.auth || !isAuthorizedPhoneHash(payload.auth.phoneHash)) {
        console.warn("Blocked unauthorized signaling attempt in room", this.roomId)
        return
      }

      // Enforce timestamp freshness (drop stale replay signals older than 5 minutes)
      if (Math.abs(Date.now() - (payload.auth.timestamp || 0)) > 5 * 60 * 1000) {
        console.warn("Blocked expired signaling payload from peer", payload.from)
        return
      }

      // Ignore signals addressed to someone else
      if (payload.to && payload.to !== this.clientId) return

      this.remotePhoneHash = payload.auth.phoneHash
      await this.handleIncomingSignal(payload)
    })

    this.channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        // Announce presence so any already-waiting peer knows we arrived
        this.sendSignal({
          type: "presence-join",
          from: this.clientId,
        })
      } else if (status === "CHANNEL_ERROR") {
        this.callbacks.onError("Signalling channel error. Check internet connection.")
      }
    })
  }

  private async handleIncomingSignal(payload: SignalPayload) {
    if (!this.pc) return

    switch (payload.type) {
      case "presence-join": {
        this.remoteClientId = payload.from
        this.callbacks.onPeerJoined?.()

        // Deterministic initiator: the client with lower lexical id initiates the offer
        if (this.clientId < payload.from) {
          await this.createAndSendOffer()
        } else {
          // Send acknowledgment of presence back so the lower client can initiate
          this.sendSignal({
            type: "presence-join",
            from: this.clientId,
            to: payload.from,
          })
        }
        break
      }

      case "offer": {
        if (!payload.sdp) return
        this.remoteClientId = payload.from
        this.callbacks.onStatusChange("connecting")

        try {
          await this.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          await this.drainPendingCandidates()

          const answer = await this.pc.createAnswer()
          await this.pc.setLocalDescription(answer)

          this.sendSignal({
            type: "answer",
            from: this.clientId,
            to: payload.from,
            sdp: this.pc.localDescription ?? answer,
          })
        } catch (err) {
          console.error("Error handling WebRTC offer:", err)
        }
        break
      }

      case "answer": {
        if (!payload.sdp) return
        try {
          await this.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          await this.drainPendingCandidates()
        } catch (err) {
          console.error("Error handling WebRTC answer:", err)
        }
        break
      }

      case "ice-candidate": {
        if (!payload.candidate) return
        try {
          if (this.pc.remoteDescription && this.pc.remoteDescription.type) {
            await this.pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
          } else {
            this.pendingCandidates.push(payload.candidate)
          }
        } catch (err) {
          console.error("Error adding ICE candidate:", err)
        }
        break
      }

      case "hangup": {
        this.callbacks.onPeerLeft?.()
        this.callbacks.onStatusChange("ended")
        break
      }
    }
  }

  private async createAndSendOffer() {
    if (!this.pc) return
    this.callbacks.onStatusChange("connecting")
    try {
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
      })
      await this.pc.setLocalDescription(offer)

      this.sendSignal({
        type: "offer",
        from: this.clientId,
        to: this.remoteClientId ?? undefined,
        sdp: this.pc.localDescription ?? offer,
      })
    } catch (err) {
      console.error("Failed to create WebRTC offer:", err)
    }
  }

  private async drainPendingCandidates() {
    if (!this.pc) return
    for (const cand of this.pendingCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand))
      } catch (e) {
        console.warn("Failed to add buffered candidate:", e)
      }
    }
    this.pendingCandidates = []
  }

  private sendSignal(payload: SignalPayload) {
    if (this.channel && !this.isCleanedUp) {
      const securedPayload: SignalPayload = {
        ...payload,
        auth: {
          userId: this.myUserId,
          phoneHash: this.myPhoneHash,
          timestamp: Date.now(),
        },
      }
      this.channel.send({
        type: "broadcast",
        event: "signal",
        payload: securedPayload,
      })
    }
  }

  private setupLocalAudioAnalysis(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!this.audioContext) {
        this.audioContext = new AudioCtx()
      }
      if (this.audioContext.state === "suspended") {
        void this.audioContext.resume()
      }

      const source = this.audioContext.createMediaStreamSource(stream)
      this.localAnalyser = this.audioContext.createAnalyser()
      this.localAnalyser.fftSize = 64
      source.connect(this.localAnalyser)

      this.startAudioLevelLoop()
    } catch (e) {
      console.warn("AudioContext setup failed:", e)
    }
  }

  private setupRemoteAudioAnalysis(stream: MediaStream) {
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        this.audioContext = new AudioCtx()
      }
      if (this.audioContext.state === "suspended") {
        void this.audioContext.resume()
      }

      const source = this.audioContext.createMediaStreamSource(stream)
      this.remoteAnalyser = this.audioContext.createAnalyser()
      this.remoteAnalyser.fftSize = 64
      source.connect(this.remoteAnalyser)
    } catch (e) {
      console.warn("Remote AudioContext setup failed:", e)
    }
  }

  private startAudioLevelLoop() {
    const localData = new Uint8Array(32)
    const remoteData = new Uint8Array(32)

    const sample = () => {
      if (this.isCleanedUp) return

      if (this.localAnalyser && !this.isMuted) {
        this.localAnalyser.getByteFrequencyData(localData)
        let sum = 0
        for (let i = 0; i < localData.length; i++) sum += localData[i]
        const avg = sum / localData.length
        const normalized = Math.min(100, Math.round((avg / 128) * 100))
        this.callbacks.onLocalAudioLevel(normalized)
      } else {
        this.callbacks.onLocalAudioLevel(0)
      }

      if (this.remoteAnalyser) {
        this.remoteAnalyser.getByteFrequencyData(remoteData)
        let sum = 0
        for (let i = 0; i < remoteData.length; i++) sum += remoteData[i]
        const avg = sum / remoteData.length
        const normalized = Math.min(100, Math.round((avg / 128) * 100))
        this.callbacks.onRemoteAudioLevel(normalized)
      } else {
        this.callbacks.onRemoteAudioLevel(0)
      }

      this.levelAnimFrame = window.setTimeout(sample, 80)
    }

    sample()
  }

  public toggleMute(): boolean {
    if (!this.localStream) return false
    this.isMuted = !this.isMuted
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !this.isMuted
    }
    return this.isMuted
  }

  public cleanup() {
    this.isCleanedUp = true

    if (this.channel) {
      try {
        this.sendSignal({ type: "hangup", from: this.clientId })
      } catch {
        // channel may already be closed
      }
      void this.channel.unsubscribe()
      this.channel = null
    }

    if (this.levelAnimFrame !== null) {
      clearTimeout(this.levelAnimFrame)
      this.levelAnimFrame = null
    }

    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined)
      this.audioContext = null
    }

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop()
      }
      this.localStream = null
    }

    if (this.remoteStream) {
      for (const track of this.remoteStream.getTracks()) {
        track.stop()
      }
      this.remoteStream = null
    }

    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    this.callbacks.onStatusChange("ended")
  }
}
