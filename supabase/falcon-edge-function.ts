import { createClient } from "jsr:@supabase/supabase-js@2.49.8"
import { Hono } from "npm:hono"
import { cors } from "npm:hono/cors"

const app = new Hono()
const prefix = "/make-server-409a16ab"
const table = "kv_store_409a16ab"

type User = {
  id: string
  email: string
  phone?: string
  phoneConfirmedAt?: string | null
  metadata: Record<string, unknown>
}
type State = {
  profile: {
    name: string
    phone: string
    email: string
    age: number
    language: string
    memberSince: string
    saveAnalysis: boolean
  }
  trustedContact: null | {
    name: string
    relationship: string
    phone: string
  }
  analyses: unknown[]
  alerts: unknown[]
}

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
)

const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  )

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : ""

const getUser = async (authorization?: string): Promise<User | null> => {
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : ""
  if (!token) return null
  const { data, error } = await admin().auth.getUser(token)
  if (error || (!data.user?.email && !data.user?.phone)) return null
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    phone: data.user.phone ?? "",
    phoneConfirmedAt: data.user.phone_confirmed_at,
    metadata: data.user.user_metadata ?? {},
  }
}

const requireUser = async (c: any, next: () => Promise<void>) => {
  const user = await getUser(c.req.header("Authorization"))
  if (!user) return c.json({ error: "Authentication required." }, 401)
  c.set("user", user)
  await next()
}

const stateKey = (id: string) => `falcon-ai:user:${id}`

const defaultState = (user: User): State => ({
  profile: {
    name:
      typeof user.metadata.full_name === "string"
        ? user.metadata.full_name
        : "Falcon AI member",
    phone: "",
    email: user.email,
    age: 0,
    language: "English",
    memberSince: new Date().toISOString(),
    saveAnalysis: false,
  },
  trustedContact: null,
  analyses: [],
  alerts: [],
})

const readState = async (user: User): Promise<State> => {
  const { data, error } = await admin()
    .from(table)
    .select("value")
    .eq("key", stateKey(user.id))
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data?.value) return data.value as State
  const state = defaultState(user)
  await saveState(user, state)
  return state
}

const saveState = async (user: User, state: State) => {
  const { error } = await admin()
    .from(table)
    .upsert({ key: stateKey(user.id), value: state })
  if (error) throw new Error(error.message)
}

app.get(`${prefix}/health`, (c) =>
  c.json({ status: "ok", service: "falcon-ai-backend" }),
)

app.use(`${prefix}/account`, requireUser)
app.use(`${prefix}/account/*`, requireUser)

app.get(`${prefix}/account`, async (c) => {
  const user = c.get("user") as User
  return c.json(await readState(user))
})

app.get(`${prefix}/account/verify-call-access`, async (c) => {
  const user = c.get("user") as User
  if (!user.phone || !user.phoneConfirmedAt) {
    return c.json(
      {
        authorized: false,
        error: "Phone number has not been verified via SMS OTP.",
      },
      403,
    )
  }

  const rawPhone = user.phone.replace(/\D/g, "").slice(-10)

  // SHA-256 hashes of the authorized team phone numbers
  const authorizedHashes = [
    "0001942723507f043509e3cb58412d1bfbb8b6f6d2bb8d3839b3200c86b65ef4",
    "dddee5fba01d2eaed2296433848061c46057fc07072de770d1f2a69d90acce69",
  ]

  const encoder = new TextEncoder()
  const data = encoder.encode(rawPhone)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

  if (!authorizedHashes.includes(hashHex)) {
    return c.json(
      {
        authorized: false,
        error:
          "Access denied. This phone number is not on the authorized team member allowlist.",
      },
      403,
    )
  }

  return c.json({
    authorized: true,
    message: "Authorized team member verified.",
  })
})

app.put(`${prefix}/account/profile`, async (c) => {
  const user = c.get("user") as User
  const body = await c.req.json()
  const state = await readState(user)
  const name = clean(body.name, 80)
  const phone = clean(body.phone, 24)
  const age = Number(body.age)
  if (!name) return c.json({ error: "Name is required." }, 400)
  if (phone && !/^[+\d Xx()-]{7,24}$/.test(phone))
    return c.json({ error: "Enter a valid phone number." }, 400)
  if (!Number.isInteger(age) || age < 0 || age > 120)
    return c.json({ error: "Enter a valid age." }, 400)
  state.profile = {
    ...state.profile,
    name,
    phone,
    age,
    email: user.email,
    language: clean(body.language, 30) || "English",
    saveAnalysis: Boolean(body.saveAnalysis),
  }
  await saveState(user, state)
  return c.json({ profile: state.profile })
})

app.put(`${prefix}/account/trusted-contact`, async (c) => {
  const user = c.get("user") as User
  const body = await c.req.json()
  const contact = {
    name: clean(body.name, 80),
    relationship: clean(body.relationship, 40),
    phone: clean(body.phone, 24),
  }
  if (!contact.name || !contact.relationship || !contact.phone)
    return c.json({ error: "Complete all trusted contact fields." }, 400)
  const state = await readState(user)
  state.trustedContact = contact
  await saveState(user, state)
  return c.json({ trustedContact: contact })
})

app.delete(`${prefix}/account/trusted-contact`, async (c) => {
  const user = c.get("user") as User
  const state = await readState(user)
  state.trustedContact = null
  await saveState(user, state)
  return c.json({ trustedContact: null })
})

app.post(`${prefix}/account/analyses`, async (c) => {
  const user = c.get("user") as User
  const state = await readState(user)
  if (!state.profile.saveAnalysis)
    return c.json({ saved: false, reason: "opt_in_required" })
  const body = await c.req.json()
  state.analyses = [
    {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      score: Math.max(0, Math.min(100, Number(body.score) || 0)),
      level: clean(body.level, 10),
      firstWarningMs: Math.max(0, Number(body.firstWarningMs) || 0),
      tactics: Array.isArray(body.tactics) ? body.tactics.slice(0, 10) : [],
      redactedSnippet: clean(body.redactedSnippet, 180).replace(
        /\b\d{4,}\b/g,
        "[redacted]",
      ),
    },
    ...state.analyses,
  ].slice(0, 50)
  await saveState(user, state)
  return c.json({ saved: true }, 201)
})

app.post(`${prefix}/account/family-alerts`, async (c) => {
  const user = c.get("user") as User
  const state = await readState(user)
  if (!state.trustedContact)
    return c.json({ error: "Add a trusted family contact first." }, 409)
  const body = await c.req.json()
  state.alerts = [
    {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      riskLevel: clean(body.riskLevel, 10),
      status: "queued",
    },
    ...state.alerts,
  ].slice(0, 50)
  await saveState(user, state)
  return c.json(
    {
      message:
        "High-risk alert queued for your trusted contact. No audio was shared.",
    },
    202,
  )
})

app.post(`${prefix}/account/transcribe`, async (c) => {
  const apiKey = Deno.env.get("GROQ_API_KEY")
  if (!apiKey)
    return c.json({ error: "Audio transcription is not configured." }, 503)

  const incoming = await c.req.raw.formData()
  const audio = incoming.get("audio")
  if (!(audio instanceof File))
    return c.json({ error: "Choose an audio file to analyze." }, 400)
  if (audio.size > 25 * 1024 * 1024)
    return c.json({ error: "Audio files must be smaller than 25 MB." }, 413)

  const retryFetch = async (url: string, init: RequestInit) => {
    let response: Response | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(url, init)
      if (![429, 500, 502, 503, 504].includes(response.status)) break
      if (attempt < 2)
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * 2 ** attempt + Math.random() * 400),
        )
    }
    return response
  }

  const audioForm = new FormData()
  audioForm.append("file", audio, audio.name)
  audioForm.append("model", "whisper-large-v3-turbo")
  audioForm.append("response_format", "json")
  audioForm.append(
    "prompt",
    "Indian phone call with Hindi, Hinglish, banking, OTP, UPI, KYC, and payment terms.",
  )
  const transcriptResponse = await retryFetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: audioForm,
    },
  )
  if (!transcriptResponse)
    return c.json({ error: "Groq did not return a response." }, 502)
  const transcriptBody = await transcriptResponse.json()
  if (!transcriptResponse.ok)
    return c.json(
      {
        error: [429, 500, 502, 503, 504].includes(transcriptResponse.status)
          ? "Groq is busy. Falcon AI tried three times; please retry in a minute."
          : transcriptBody?.error?.message ??
            "The recording could not be transcribed.",
      },
      502,
    )

  const transcript = clean(transcriptBody.text, 20000)
  if (!transcript)
    return c.json({ error: "No speech was detected in this recording." }, 422)

  const classifierModels = [
    "openai/gpt-oss-20b",
    "llama-3.1-8b-instant",
  ]
  let classifyResponse: Response | null = null
  let classifyBody: any = null
  for (const model of classifierModels) {
    classifyResponse = await retryFetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a conservative Indian scam-call risk classifier. Urgency alone is not high risk. Calls requesting OTP, PIN, CVV, money, secrecy, or compliance with threats are dangerous. Return JSON only with score 0-100, explanation, warning, and tactics object containing numeric 0-100 keys: Authority, Threat, Secrecy, OTP Request, Urgency, Emotional Trick.",
            },
            { role: "user", content: transcript },
          ],
        }),
      },
    )
    if (!classifyResponse) continue
    classifyBody = await classifyResponse.json()
    if (classifyResponse.ok) break
    if (![400, 404].includes(classifyResponse.status)) break
  }
  if (!classifyResponse)
    return c.json({ error: "Groq did not return a risk result." }, 502)
  if (!classifyResponse.ok)
    return c.json(
      {
        error: [429, 500, 502, 503, 504].includes(classifyResponse.status)
          ? "Groq is busy. Falcon AI tried three times; please retry in a minute."
          : classifyBody?.error?.message ??
            "The transcript could not be classified.",
      },
      502,
    )

  let semantic: any
  try {
    semantic = JSON.parse(classifyBody.choices?.[0]?.message?.content ?? "{}")
  } catch {
    return c.json({ error: "Groq returned an invalid risk result." }, 502)
  }
  const score = Math.max(0, Math.min(100, Number(semantic.score) || 0))
  return c.json({
    transcript,
    semantic: {
      score,
      level: score >= 75 ? "high" : score >= 40 ? "medium" : "low",
      explanation: clean(semantic.explanation, 500),
      warning: clean(semantic.warning, 180),
      tactics:
        typeof semantic.tactics === "object" && semantic.tactics
          ? semantic.tactics
          : {},
    },
  })
})

app.delete(`${prefix}/account/data`, async (c) => {
  const user = c.get("user") as User
  const state = await readState(user)
  state.analyses = []
  state.alerts = []
  await saveState(user, state)
  return c.json({ deleted: true })
})

Deno.serve(app.fetch)
