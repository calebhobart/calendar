import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for database tables
export interface CalendarConnection {
  id: string
  user_id: string
  provider: 'google' | 'outlook' | 'apple'
  provider_account_id: string
  provider_calendar_id: string | null
  calendar_name: string
  calendar_color: string
  last_synced_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CalendarEvent {
  id: string
  user_id: string
  calendar_connection_id: string
  provider_event_id: string
  title: string
  description: string | null
  location: string | null
  start_time: string
  end_time: string | null
  is_all_day: boolean
  timezone: string | null
  status: 'confirmed' | 'tentative' | 'cancelled'
  imported_at: string
  updated_at: string
  provider_updated_at: string | null
  // Joined from calendar_connections
  calendar_connections?: {
    calendar_name: string
    calendar_color: string
    provider: string
  }
}

// Helper to get Google OAuth URL
export function getGoogleOAuthUrl(redirectUri: string): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID environment variable')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state: 'google', // Used to identify provider in callback
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// Helper to get Microsoft OAuth URL
export function getMicrosoftOAuthUrl(redirectUri: string): string {
  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID
  if (!clientId) {
    throw new Error('Missing VITE_MICROSOFT_CLIENT_ID environment variable')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'Calendars.Read User.Read offline_access',
    response_mode: 'query',
    state: 'microsoft', // Used to identify provider in callback
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}
