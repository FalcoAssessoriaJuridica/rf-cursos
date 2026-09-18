import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.DEV 
  ? window.location.origin + '/supabase-api'
  : (import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co')
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

