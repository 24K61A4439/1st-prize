import { createClient } from "@supabase/supabase-js"
import { projectId, publicAnonKey, publishableKey } from "../../utils/supabase/info"

export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publishableKey || publicAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
