import { createClient } from '@supabase/supabase-js'

// Em desenvolvimento o Vite repassa /supabase-api ao projeto (vite.config.js: VITE_SUPABASE_URL), evitando CORS.
const supabaseUrl = import.meta.env.DEV 
  ? window.location.origin + '/supabase-api'
  : (import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co')
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

