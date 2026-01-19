# Calendar Application Architecture

## Overview

Multi-import calendar application that aggregates events from Google Calendar, Outlook, and Apple Calendar into a unified view. The system uses Supabase for backend infrastructure and supports web and iOS clients.

**Key Requirements:**
- Support 3 calendar providers: Google Calendar, Outlook, Apple Calendar
- Periodic refresh (daily polling + user-triggered)
- Complete event copy stored in Supabase
- View-only initially (CRUD in future phases)
- Color-coded, toggleable calendar sources
- Scalable architecture for future growth

---

## Database Schema (Supabase)

### 1. `users` (Supabase Auth)
- Provided by Supabase Auth
- Contains standard user authentication fields
- Reference: `auth.users`

### 2. `calendar_connections`

Stores user's connected calendar accounts and OAuth tokens.

```sql
CREATE TABLE calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Provider identification
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'apple')),
  
  -- Provider-specific identifiers
  provider_account_id TEXT NOT NULL, -- Email or account ID from provider
  provider_calendar_id TEXT, -- Specific calendar ID if provider has multiple
  
  -- Calendar metadata
  calendar_name TEXT NOT NULL, -- User-friendly name (e.g., "Work A", "Personal")
  calendar_color TEXT NOT NULL DEFAULT '#3788d8', -- Hex color for UI display
  
  -- OAuth tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT, -- Required for Google/Outlook, may be NULL for Apple
  token_expires_at TIMESTAMPTZ,
  
  -- Sync status
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'success', 'error')),
  sync_error TEXT, -- Last error message if sync failed
  
  -- Sync configuration
  is_active BOOLEAN DEFAULT TRUE, -- User can disable without deleting
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, provider, provider_account_id, provider_calendar_id)
);

-- Indexes
CREATE INDEX idx_calendar_connections_user_id ON calendar_connections(user_id);
CREATE INDEX idx_calendar_connections_active ON calendar_connections(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_calendar_connections_sync ON calendar_connections(last_synced_at) WHERE is_active = TRUE;
```

### 3. `events`

Stores all imported calendar events from all sources.

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_connection_id UUID NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  
  -- Provider identifiers (for deduplication and updates)
  provider_event_id TEXT NOT NULL, -- Unique ID from provider (e.g., Google event ID)
  
  -- Event core data
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  
  -- Date/time
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  is_all_day BOOLEAN DEFAULT FALSE,
  timezone TEXT, -- Store original timezone (e.g., 'America/New_York')
  
  -- Event metadata
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  visibility TEXT DEFAULT 'default',
  
  -- Attendees (stored as JSONB for flexibility)
  attendees JSONB, -- Array of {email, name, status, etc.}
  
  -- Recurrence (stored as JSONB for flexibility)
  recurrence_rule TEXT, -- RRULE string if recurring
  recurrence_data JSONB, -- Parsed recurrence info
  
  -- Extended properties (provider-specific data)
  extended_properties JSONB, -- Store any additional provider-specific fields
  
  -- Sync tracking
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  provider_updated_at TIMESTAMPTZ, -- Last update time from provider
  
  -- Constraints
  UNIQUE(calendar_connection_id, provider_event_id)
);

-- Indexes
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_calendar_connection ON events(calendar_connection_id);
CREATE INDEX idx_events_time_range ON events(user_id, start_time, end_time);
CREATE INDEX idx_events_provider_id ON events(calendar_connection_id, provider_event_id);
CREATE INDEX idx_events_user_time ON events(user_id, start_time) WHERE status != 'cancelled';
```

### 4. `sync_logs` (Optional, for debugging and monitoring)

Tracks sync operations for debugging and analytics.

```sql
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_connection_id UUID NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Sync metadata
  sync_type TEXT NOT NULL CHECK (sync_type IN ('scheduled', 'manual', 'refresh_token')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
  
  -- Results
  events_added INT DEFAULT 0,
  events_updated INT DEFAULT 0,
  events_deleted INT DEFAULT 0,
  events_total INT DEFAULT 0,
  
  -- Error tracking
  error_message TEXT,
  error_details JSONB,
  
  -- Constraints
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX idx_sync_logs_user_id ON sync_logs(user_id);
CREATE INDEX idx_sync_logs_calendar_connection ON sync_logs(calendar_connection_id);
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at DESC);
```

### Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

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
  USING (
    EXISTS (
      SELECT 1 FROM calendar_connections
      WHERE calendar_connections.id = events.calendar_connection_id
      AND calendar_connections.user_id = auth.uid()
    )
  );

-- Sync logs: users can view logs for their calendars
CREATE POLICY "Users can view own sync logs"
  ON sync_logs FOR SELECT
  USING (auth.uid() = user_id);
```

---

## Authentication & OAuth Flow

### Provider-specific OAuth Requirements

#### Google Calendar
- **OAuth 2.0**: Requires `access_token` and `refresh_token`
- **Scopes**: `https://www.googleapis.com/auth/calendar.readonly`
- **Token refresh**: Required when `expires_at` is reached
- **API**: Google Calendar API v3

#### Outlook/Microsoft 365
- **OAuth 2.0**: Requires `access_token` and `refresh_token`
- **Scopes**: `Calendars.Read` or `Calendars.ReadWrite` (read-only for now)
- **Token refresh**: Required when `expires_at` is reached
- **API**: Microsoft Graph API

#### Apple Calendar (iCloud)
- **Challenge**: Apple doesn't provide public OAuth for calendar access
- **Options**:
  1. **iCloud Calendar Sharing**: User shares calendar via public URL (.ics feed)
  2. **App-specific password**: Less reliable, user-dependent
  3. **CalDAV**: More complex, requires CalDAV server access
- **Recommendation**: Start with .ics feed URL (read-only, no OAuth)
  - User provides .ics feed URL in UI
  - Poll feed daily using HTTP request
  - Parse iCalendar format

### OAuth Flow Implementation

```
1. User clicks "Connect Google Calendar" (or Outlook)
2. Frontend redirects to OAuth provider
3. User authorizes app
4. OAuth provider redirects back with authorization code
5. Backend exchanges code for access_token + refresh_token
6. Backend fetches user's calendars from provider
7. User selects which calendar(s) to import (or auto-import primary)
8. Backend stores calendar_connection record
9. Initial sync is triggered automatically
```

**Supabase Implementation:**
- Use Supabase Auth for Google/Outlook OAuth
- Store additional OAuth data in `calendar_connections` table
- Use Edge Function for token exchange and calendar fetching

---

## Sync Architecture

### Sync Flow Diagram

```
┌─────────────────┐
│  Trigger        │
│  (Cron/Manual)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Edge Function  │
│  (sync-calendar)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Check Token    │────▶│  Refresh Token   │
│  Expiration     │     │  (if needed)     │
└────────┬────────┘     └──────────────────┘
         │
         ▼
┌─────────────────┐
│  Fetch Events   │
│  from Provider  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Diff Events    │
│  (Compare with  │
│   stored events)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Update DB      │
│  (Insert/Update/│
│   Delete)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Log Sync       │
│  Results        │
└─────────────────┘
```

### Sync Logic (Pseudocode)

```
syncCalendar(calendar_connection_id):
  1. Load calendar_connection from DB
  2. Check if token is expired
     - If expired: refresh token using refresh_token
     - Update calendar_connection with new tokens
  3. Fetch events from provider API for time range:
     - Start: max(last_synced_at - 30 days, today - 1 year)
     - End: today + 1 year
  4. Load existing events from DB for this calendar_connection
  5. Diff algorithm:
     - New events: provider_event_id not in DB → INSERT
     - Updated events: provider_event_id exists but provider_updated_at > updated_at → UPDATE
     - Deleted events: provider_event_id in DB but not in fetched list → DELETE
  6. Batch insert/update/delete in transaction
  7. Update calendar_connection.last_synced_at
  8. Create sync_log entry
  9. Return sync results
```

### Sync Scheduling

#### Option 1: Supabase pg_cron (Recommended for MVP)

```sql
-- Create function to trigger sync for all active calendars
CREATE OR REPLACE FUNCTION trigger_daily_sync()
RETURNS void AS $$
BEGIN
  -- Call Edge Function via HTTP (using pg_net extension)
  -- Or use Supabase REST API client
END;
$$ LANGUAGE plpgsql;

-- Schedule daily at 2 AM UTC
SELECT cron.schedule(
  'daily-calendar-sync',
  '0 2 * * *', -- 2 AM daily
  $$SELECT trigger_daily_sync()$$
);
```

**Limitation**: pg_cron can't directly call Edge Functions. Need workaround:
- Use HTTP extension (pg_net) to call Edge Function
- Or use external cron service (e.g., cron-job.org) to hit Edge Function endpoint

#### Option 2: Edge Function + External Cron (Alternative)

- Create Edge Function endpoint: `/api/cron/sync-all-calendars`
- Use external service (cron-job.org, GitHub Actions, etc.) to call endpoint daily
- Function iterates through all active calendar_connections and syncs

**Recommendation**: Option 2 is simpler initially. Move to pg_cron later if needed.

---

## API Endpoints

### Authentication Endpoints

```
POST   /api/auth/google/callback
POST   /api/auth/outlook/callback
GET    /api/auth/apple/setup          # Returns instructions for .ics URL
```

### Calendar Connection Endpoints

```
GET    /api/calendars                 # List user's calendar connections
POST   /api/calendars                 # Connect new calendar (initiates OAuth)
GET    /api/calendars/:id             # Get specific calendar connection
PUT    /api/calendars/:id             # Update calendar (name, color, active status)
DELETE /api/calendars/:id             # Disconnect calendar (deletes connection + events)
POST   /api/calendars/:id/sync        # Trigger manual sync for calendar
```

### Event Endpoints

```
GET    /api/events                    # Get user's events
  Query params:
    - start: ISO date (default: today - 30 days)
    - end: ISO date (default: today + 1 year)
    - calendar_ids: comma-separated UUIDs (filter by calendars)
    - all_day: boolean (filter all-day events)
    
GET    /api/events/:id                # Get specific event
```

**Note**: Using Supabase PostgREST, endpoints are auto-generated. Can use Supabase client directly:

```javascript
// Instead of custom API routes, use Supabase client:
const { data: events } = await supabase
  .from('events')
  .select(`
    *,
    calendar_connections!inner(
      calendar_name,
      calendar_color,
      provider
    )
  `)
  .eq('user_id', userId)
  .gte('start_time', startDate)
  .lte('start_time', endDate)
  .eq('status', 'confirmed')
```

**Recommendation**: Use Supabase client directly for events endpoint. Create Edge Functions only for:
- OAuth callbacks
- Sync operations
- Token refresh

### Sync Endpoints (Internal/Admin)

```
POST   /api/sync/all                  # Trigger sync for all active calendars (cron endpoint)
POST   /api/sync/:calendar_id         # Trigger sync for specific calendar
GET    /api/sync/logs                 # Get sync history for user
```

---

## Frontend Architecture (Web)

### State Management

- **Calendar connections**: Fetch on mount, store in context/state
- **Events**: Fetch on mount + subscribe to realtime updates (Supabase Realtime)
- **UI state**: Active calendar filters, current view (month/week/day), date range

### Data Fetching Strategy

```javascript
// Initial load
1. Fetch calendar_connections (filter by is_active = true)
2. Fetch events for visible date range
3. Subscribe to events table changes (realtime)

// On calendar toggle
- Filter events client-side by calendar_connection_id

// On date navigation
- Fetch events for new date range
```

### FullCalendar Integration

```javascript
// Event source format for FullCalendar
const events = calendarEvents.map(event => ({
  id: event.id,
  title: event.title,
  start: event.start_time,
  end: event.end_time,
  allDay: event.is_all_day,
  backgroundColor: event.calendar_connections.calendar_color,
  extendedProps: {
    calendarName: event.calendar_connections.calendar_name,
    provider: event.calendar_connections.provider,
    location: event.location,
    description: event.description
  }
}));
```

---

## Error Handling & Edge Cases

### OAuth Token Expiration
- **Detection**: Check `token_expires_at` before each sync
- **Action**: Refresh token using `refresh_token` before API calls
- **Failure**: Mark sync_status = 'error', notify user

### Provider API Rate Limits
- **Google**: 1,000,000 quota units/day (default)
- **Outlook**: Varies by plan (typically 10,000 requests/10 minutes)
- **Action**: Implement exponential backoff, log rate limit errors

### Network Failures
- **Action**: Retry with exponential backoff (3 attempts)
- **Failure**: Mark sync_status = 'error', store error_message

### Duplicate Events
- **Current**: Display all events (even duplicates)
- **Future**: Implement deduplication logic based on title + start_time + calendar

### Deleted Events in Provider
- **Detection**: Event exists in DB but not in provider fetch
- **Action**: Mark as deleted or soft-delete (status = 'cancelled')

---

## Scalability Considerations

### Database Optimization
- **Indexes**: Already defined on key query fields
- **Partitioning**: Consider partitioning `events` table by year if > 100M rows
- **Archiving**: Delete events older than 1 year (per requirement)

### Sync Performance
- **Parallel syncs**: Process multiple calendar_connections in parallel
- **Batch operations**: Batch insert/update/delete events in single transaction
- **Incremental sync**: Only fetch events changed since last_synced_at (if provider supports)

### Caching Strategy
- **Edge Functions**: Cache provider API responses for short duration (5-10 min)
- **Frontend**: Cache events in memory, invalidate on realtime updates

### Future Enhancements
- **Webhooks**: Subscribe to Google/Outlook webhooks for real-time updates (when available)
- **Background workers**: Move sync to dedicated worker queue (e.g., Inngest, BullMQ)
- **CDN**: Serve static calendar data via CDN if needed

---

## Security Considerations

### Token Storage
- **Encryption**: Supabase encrypts data at rest by default
- **RLS**: Row Level Security ensures users can only access their own data
- **Secrets**: Store OAuth client secrets in Supabase secrets (not in code)

### API Security
- **Authentication**: All endpoints require valid Supabase JWT
- **Rate limiting**: Implement rate limits on public endpoints (Supabase provides this)
- **Input validation**: Validate all inputs (dates, IDs, etc.)

### Privacy
- **Data retention**: Delete events older than 1 year (automated job)
- **User deletion**: Cascade delete on user deletion (handled by foreign keys)

---

## Monitoring & Observability

### Metrics to Track
- Sync success rate (per provider)
- Sync duration (average, p95, p99)
- Events synced per day
- API error rates
- Token refresh failures

### Logging
- Use `sync_logs` table for structured logging
- Log sync operations with timestamps and results
- Store error details in JSONB for debugging

### Alerts
- Sync failures for > 3 consecutive attempts
- Token refresh failures
- High error rates (> 10% failures)

---

## Next Steps

1. **Database Setup**: Create tables and RLS policies in Supabase
2. **OAuth Implementation**: Set up Google/Outlook OAuth flows
3. **Edge Functions**: Create sync function and OAuth callbacks
4. **Frontend MVP**: Build calendar connection UI and event display
5. **Sync Scheduling**: Set up daily sync job
6. **Testing**: Test with real calendar accounts
7. **Error Handling**: Implement robust error handling and retries

---

## Appendix: Provider API Details

### Google Calendar API
- **Base URL**: `https://www.googleapis.com/calendar/v3`
- **Events endpoint**: `GET /calendars/{calendarId}/events`
- **Time range params**: `timeMin`, `timeMax`
- **Event ID**: Unique per calendar, stable across syncs

### Microsoft Graph API
- **Base URL**: `https://graph.microsoft.com/v1.0`
- **Events endpoint**: `GET /me/calendars/{id}/events`
- **Time range params**: `$filter=start/dateTime ge '{start}' and start/dateTime le '{end}'`
- **Event ID**: Unique per calendar, stable across syncs

### Apple iCalendar (.ics)
- **Format**: iCalendar (RFC 5545)
- **Parsing**: Use library like `ical.js` or `node-ical`
- **Event ID**: `UID` field in .ics file
- **Limitation**: Read-only, no real-time updates

