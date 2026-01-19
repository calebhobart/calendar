-- Calendar Application MVP - Initial Database Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Calendar Connections Table
-- ============================================
CREATE TABLE IF NOT EXISTS calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Provider identification
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'apple')),
  
  -- Provider-specific identifiers
  provider_account_id TEXT NOT NULL,
  provider_calendar_id TEXT,
  
  -- Calendar metadata
  calendar_name TEXT NOT NULL,
  calendar_color TEXT NOT NULL DEFAULT '#3788d8',
  
  -- OAuth tokens (for Google/Outlook)
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  
  -- For Apple Calendar (.ics feeds)
  ics_feed_url TEXT,
  
  -- Sync status
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, provider, provider_account_id, provider_calendar_id)
);

-- Indexes for calendar_connections
CREATE INDEX IF NOT EXISTS idx_calendar_connections_user_id 
  ON calendar_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_connections_active 
  ON calendar_connections(user_id, is_active) 
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_calendar_connections_sync 
  ON calendar_connections(last_synced_at) 
  WHERE is_active = TRUE;

-- ============================================
-- 2. Events Table
-- ============================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_connection_id UUID NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  
  -- Provider identifiers (for deduplication and updates)
  provider_event_id TEXT NOT NULL,
  
  -- Event core data
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  
  -- Date/time
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  is_all_day BOOLEAN DEFAULT FALSE,
  timezone TEXT,
  
  -- Event metadata
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  
  -- Sync tracking
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  provider_updated_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(calendar_connection_id, provider_event_id)
);

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_events_user_id 
  ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_calendar_connection 
  ON events(calendar_connection_id);
CREATE INDEX IF NOT EXISTS idx_events_time_range 
  ON events(user_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_events_provider_id 
  ON events(calendar_connection_id, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_events_user_time 
  ON events(user_id, start_time) 
  WHERE status != 'cancelled';

-- ============================================
-- 3. Row Level Security (RLS) Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Calendar connections: users can only access their own
CREATE POLICY "Users can view own calendar connections"
  ON calendar_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calendar connections"
  ON calendar_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calendar connections"
  ON calendar_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own calendar connections"
  ON calendar_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Events: users can only access events from their calendars
CREATE POLICY "Users can view own events"
  ON events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own events"
  ON events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own events"
  ON events FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 4. Helper Functions
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
DROP TRIGGER IF EXISTS update_calendar_connections_updated_at ON calendar_connections;
CREATE TRIGGER update_calendar_connections_updated_at
  BEFORE UPDATE ON calendar_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. Comments (Documentation)
-- ============================================

COMMENT ON TABLE calendar_connections IS 'Stores user calendar account connections and OAuth tokens';
COMMENT ON TABLE events IS 'Stores imported calendar events from all connected calendars';
COMMENT ON COLUMN calendar_connections.ics_feed_url IS 'For Apple Calendar: public .ics feed URL (no OAuth)';
COMMENT ON COLUMN events.provider_event_id IS 'Unique event ID from provider API, used for deduplication';
