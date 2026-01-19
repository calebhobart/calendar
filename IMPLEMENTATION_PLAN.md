# Implementation Plan - Calendar Application MVP

## Overview

This document breaks down the architecture into prioritized phases to ship an MVP quickly, then iterate with additional features.

**MVP Goal**: Get a working calendar that displays events from at least one provider (Google Calendar) with manual sync capability.

**Timeline Estimate**: 
- Phase 1-2: 1-2 weeks (MVP)
- Phase 3-4: 1 week (Polish)
- Phase 5+: Future enhancements

---

## Phase 1: Foundation & Database Setup ⚡ (MVP Core)

**Goal**: Set up infrastructure and database schema

**Priority**: 🔴 Critical - Must have for MVP

### Tasks

1. **Supabase Project Setup**
   - [x] Create Supabase project
   - [x] Get API keys and connection strings
   - [x] Set up local development environment

2. **Database Schema**
   - [x] Create `calendar_connections` table (simplified version - see below)
   - [x] Create `events` table (simplified version - see below)
   - [x] Create indexes
   - [x] Set up Row Level Security (RLS) policies
   - [ ] **Skip `sync_logs` table for MVP** (add later if needed)

3. **Simplified Schema for MVP**
   ```sql
   -- Minimal calendar_connections for MVP
   -- Remove: sync_status, sync_error (add later)
   -- Keep: id, user_id, provider, provider_account_id, provider_calendar_id, 
   --       calendar_name, calendar_color, access_token, refresh_token, 
   --       token_expires_at, last_synced_at, is_active, created_at, updated_at
   
   -- Minimal events for MVP
   -- Remove: attendees, recurrence_rule, recurrence_data, extended_properties (add later)
   -- Keep: id, user_id, calendar_connection_id, provider_event_id, title, 
   --       description, location, start_time, end_time, is_all_day, timezone,
   --       status, imported_at, updated_at, provider_updated_at
   ```

4. **Authentication Setup**
   - [x] Enable Supabase Auth
   - [x] Set up email/password authentication (for MVP)
   - [x] Create basic login/signup pages

**Deliverable**: Database ready, user can sign up/login

**Estimated Time**: 2-3 days

---

## Phase 2: Google Calendar Integration (Single Provider) ⚡ (MVP Core)

**Goal**: Connect Google Calendar and sync events manually

**Priority**: 🔴 Critical - Core MVP feature

### Tasks

1. **Google OAuth Setup**
   - [x] Create Google Cloud project
   - [x] Enable Google Calendar API
   - [x] Create OAuth 2.0 credentials
   - [x] Add redirect URIs to Google Console
   - [x] Store client ID/secret in Supabase secrets

2. **OAuth Flow (Frontend)**
   - [ ] Create "Connect Google Calendar" button
   - [ ] Redirect to Google OAuth consent screen
   - [ ] Handle OAuth callback
   - [ ] Extract authorization code

3. **OAuth Callback Handler (Edge Function)**
   - [ ] Create Edge Function: `handle-google-oauth`
   - [ ] Exchange authorization code for tokens
   - [ ] Fetch user's calendar list from Google
   - [ ] Store primary calendar connection in DB
   - [ ] Return success to frontend

4. **Manual Sync Function (Edge Function)**
   - [ ] Create Edge Function: `sync-google-calendar`
   - [ ] Load calendar_connection from DB
   - [ ] Check/refresh token if expired
   - [ ] Fetch events from Google Calendar API (last 30 days to next year)
   - [ ] Diff with existing events in DB
   - [ ] Insert/update/delete events
   - [ ] Update `last_synced_at`

5. **Manual Sync Trigger (Frontend)**
   - [ ] Add "Sync Now" button in calendar settings
   - [ ] Call sync Edge Function
   - [ ] Show loading state
   - [ ] Display success/error message

**Deliverable**: User can connect Google Calendar and manually sync events

**Estimated Time**: 3-4 days

**MVP Checkpoint**: At this point, you have a working calendar connection! 🎉

---

## Phase 3: Calendar Display (View Only) ⚡ (MVP Core)

**Goal**: Display synced events in a calendar view

**Priority**: 🔴 Critical - Core MVP feature

### Tasks

1. **Frontend Setup**
   - [ ] Set up React/Vite project (or Next.js)
   - [ ] Install FullCalendar and dependencies
   - [ ] Install Supabase client library
   - [ ] Set up routing (if needed)

2. **Calendar View Component**
   - [ ] Create main calendar component
   - [ ] Fetch events from Supabase (use Supabase client directly)
   - [ ] Transform events to FullCalendar format
   - [ ] Display events with color coding by calendar
   - [ ] Support month view (start simple)

3. **Event Display**
   - [ ] Show event title, time, location
   - [ ] Color code by calendar source
   - [ ] Handle all-day events
   - [ ] Show event details on click (modal or popover)

4. **Date Navigation**
   - [ ] Previous/next month navigation
   - [ ] Today button
   - [ ] Fetch events for visible date range

5. **Basic UI/UX**
   - [ ] Loading states
   - [ ] Empty states (no events)
   - [ ] Error states
   - [ ] Responsive design (mobile-friendly)

**Deliverable**: User can view their Google Calendar events in a calendar interface

**Estimated Time**: 3-4 days

**MVP Checkpoint**: You have a working calendar viewer! 🎉

---

## Phase 4: Calendar Management & Polish 🟡 (MVP Enhancement)

**Goal**: Allow users to manage multiple calendars and improve UX

**Priority**: 🟡 Important - Improves MVP significantly

### Tasks

1. **Calendar Toggle UI**
   - [ ] Display list of connected calendars
   - [ ] Show calendar name and color
   - [ ] Toggle calendar visibility (filter events)
   - [ ] Update calendar color picker

2. **Multiple Calendar Support**
   - [ ] Allow connecting multiple Google calendars
   - [ ] Show calendar selection during OAuth flow
   - [ ] Display all calendars in settings

3. **Calendar Settings Page**
   - [ ] List all connected calendars
   - [ ] Edit calendar name and color
   - [ ] Disconnect calendar (delete connection)
   - [ ] Manual sync per calendar

4. **Additional Views**
   - [ ] Week view (7-day)
   - [ ] Day view
   - [ ] Toggle between views

5. **Sync Status Indicators**
   - [ ] Show last sync time
   - [ ] Display sync status (success/error)
   - [ ] Show sync errors to user

**Deliverable**: User can manage multiple calendars and toggle visibility

**Estimated Time**: 2-3 days

---

## Phase 5: Automated Sync 🟢 (Post-MVP)

**Goal**: Automate daily sync without user intervention

**Priority**: 🟢 Nice to have - Can ship MVP without this

### Tasks

1. **Sync Scheduling**
   - [ ] Create Edge Function: `sync-all-calendars`
   - [ ] Set up external cron (cron-job.org or GitHub Actions)
   - [ ] Call sync function daily at 2 AM UTC
   - [ ] Iterate through all active calendar_connections

2. **Token Refresh Logic**
   - [ ] Implement automatic token refresh
   - [ ] Handle refresh failures gracefully
   - [ ] Notify user if token refresh fails

3. **Error Handling**
   - [ ] Retry logic with exponential backoff
   - [ ] Log sync errors
   - [ ] Email/notify user on persistent failures

**Deliverable**: Calendars sync automatically daily

**Estimated Time**: 2-3 days

---

## Phase 6: Additional Providers 🟢 (Post-MVP)

**Goal**: Add Outlook and Apple Calendar support

**Priority**: 🟢 Future enhancement

### Tasks

1. **Outlook Calendar** ✅ IMPLEMENTED
   - [x] Set up Microsoft Azure app registration
   - [x] Implement Outlook OAuth flow (`handle-microsoft-oauth` Edge Function)
   - [x] Create Outlook sync function (`sync-microsoft-calendar` Edge Function)
   - [x] Add provider selection modal in Dashboard
   - [x] Update OAuthCallback to route to correct handler
   - [x] Test with real Outlook account

2. **Apple Calendar (.ics)**
   - [ ] Create UI for .ics feed URL input
   - [ ] Create Edge Function to fetch and parse .ics
   - [ ] Implement iCalendar parser (use `ical.js` or `node-ical`)
   - [ ] Store .ics URL in calendar_connections (no OAuth tokens)

**Deliverable**: Support for all 3 providers

**Estimated Time**: 3-4 days per provider

### Microsoft/Outlook Environment Variables

The following environment variables are required for Microsoft Calendar integration:

**Supabase Edge Functions (set via Supabase Dashboard > Project Settings > Edge Functions):**
```
MICROSOFT_CLIENT_ID=<your-azure-app-client-id>
MICROSOFT_CLIENT_SECRET=<your-azure-app-client-secret>
```

**Frontend (add to `.env` or `.env.local`):**
```
VITE_MICROSOFT_CLIENT_ID=<your-azure-app-client-id>
```

### Azure App Registration Setup

1. Go to [Azure Portal](https://portal.azure.com) > Azure Active Directory > App registrations
2. Click "New registration"
3. Set name (e.g., "Calendar App")
4. Set "Supported account types" to "Accounts in any organizational directory and personal Microsoft accounts"
5. Add Redirect URI: `https://yourdomain.com/oauth/callback` (Web platform)
6. After creation, note the "Application (client) ID" - this is your `MICROSOFT_CLIENT_ID`
7. Go to "Certificates & secrets" > "New client secret"
8. Copy the secret value - this is your `MICROSOFT_CLIENT_SECRET`
9. Go to "API permissions" > "Add a permission" > "Microsoft Graph"
10. Add these Delegated permissions:
    - `Calendars.Read` - Read user calendars
    - `User.Read` - Sign in and read user profile
    - `offline_access` - Maintain access (for refresh tokens)

---

## Phase 7: Advanced Features 🟢 (Future)

**Priority**: 🟢 Future enhancements

### Features to Add Later

1. **Event Details**
   - [ ] Full event details modal
   - [ ] Show attendees
   - [ ] Show recurrence info
   - [ ] Show description with formatting

2. **Search & Filter**
   - [ ] Search events by title/description
   - [ ] Filter by date range
   - [ ] Filter by calendar
   - [ ] Filter by event type

3. **Sync Logs**
   - [ ] Create `sync_logs` table
   - [ ] Log all sync operations
   - [ ] Display sync history to user
   - [ ] Analytics dashboard

4. **Performance Optimizations**
   - [ ] Implement pagination for events
   - [ ] Cache frequently accessed data
   - [ ] Optimize database queries
   - [ ] Add database connection pooling

5. **Data Retention**
   - [ ] Automated job to delete events > 1 year old
   - [ ] User preference for retention period

6. **Real-time Updates**
   - [ ] Enable Supabase Realtime subscriptions
   - [ ] Update calendar when events change
   - [ ] Show sync progress in real-time

---

## MVP Definition

**Minimum Viable Product includes:**
- ✅ User authentication (email/password)
- ✅ Connect Google Calendar (OAuth)
- ✅ Manual sync of events
- ✅ Display events in calendar view (month view)
- ✅ Color-coded events by calendar
- ✅ Basic event details on click

**MVP does NOT include:**
- ❌ Automated daily sync (Phase 5)
- ❌ Outlook/Apple Calendar (Phase 6)
- ❌ Multiple calendar toggles (Phase 4 - can add quickly if needed)
- ❌ Week/Day views (Phase 4)
- ❌ Event CRUD operations (future)

---

## Recommended Implementation Order

### Week 1: MVP Core
1. **Days 1-2**: Phase 1 (Database & Auth)
2. **Days 3-5**: Phase 2 (Google Calendar Integration)
3. **Days 6-7**: Phase 3 (Calendar Display)

### Week 2: Polish & Ship
4. **Days 8-10**: Phase 4 (Calendar Management)
5. **Days 11-12**: Testing & bug fixes
6. **Day 13**: Deploy MVP

### Week 3+: Enhancements
7. Phase 5 (Automated Sync)
8. Phase 6 (Additional Providers)
9. Phase 7 (Advanced Features)

---

## Quick Start Checklist

Before starting implementation:

- [ ] Supabase account created
- [ ] Google Cloud project created
- [ ] Development environment set up (Node.js, package manager)
- [ ] Code editor configured
- [ ] Git repository initialized
- [ ] Project structure planned

---

## File Structure Recommendation

```
calendar/
├── ARCHITECTURE.md
├── IMPLEMENTATION_PLAN.md
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── functions/
│       ├── handle-google-oauth/
│       └── sync-google-calendar/
├── src/
│   ├── components/
│   │   ├── Calendar.tsx
│   │   ├── CalendarSettings.tsx
│   │   └── EventModal.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   └── Settings.tsx
│   ├── lib/
│   │   └── supabase.ts
│   └── App.tsx
├── package.json
└── README.md
```

---

## Key Decisions for MVP

1. **Start with Google Calendar only** - Simplest OAuth, most common
2. **Manual sync first** - Easier to debug, user has control
3. **Month view only initially** - Simplest to implement
4. **Skip sync_logs table** - Add later if needed for debugging
5. **Use Supabase client directly** - No custom API routes needed initially
6. **Simple error handling** - Show errors to user, don't over-engineer

---

## Testing Strategy

### MVP Testing Checklist

- [ ] User can sign up and log in
- [ ] User can connect Google Calendar
- [ ] Events sync successfully
- [ ] Events display correctly in calendar
- [ ] Events are color-coded
- [ ] Calendar navigation works
- [ ] Event details show on click
- [ ] Manual sync works
- [ ] Error messages display properly
- [ ] Mobile responsive

### Test Accounts Needed

- [ ] Google Calendar test account
- [ ] Multiple calendars in test account
- [ ] Events with various properties (all-day, recurring, etc.)

---

## Deployment Checklist

Before deploying MVP:

- [ ] Environment variables configured
- [ ] Supabase production project set up
- [ ] Google OAuth redirect URIs updated for production
- [ ] Edge Functions deployed
- [ ] Database migrations run
- [ ] RLS policies tested
- [ ] Error logging set up
- [ ] Basic analytics (optional)

---

## Next Steps After MVP

Once MVP is shipped:

1. **Gather user feedback** - What's most important?
2. **Monitor sync reliability** - Are there issues?
3. **Add automated sync** - Phase 5
4. **Add more providers** - Phase 6
5. **Improve UX** - Based on feedback
6. **Add CRUD operations** - If users request it

---

## Questions to Answer During Implementation

1. **Calendar selection**: Auto-import primary calendar or let user choose?
   - **MVP Recommendation**: Auto-import primary, add selection later

2. **Event deduplication**: Handle duplicates now or later?
   - **MVP Recommendation**: Show all events, deduplicate later

3. **Sync frequency for manual**: How often can user trigger?
   - **MVP Recommendation**: No limit, add rate limiting later if needed

4. **Error notifications**: Email, in-app, or both?
   - **MVP Recommendation**: In-app only for MVP

---

## Resources & Documentation

- [Supabase Docs](https://supabase.com/docs)
- [FullCalendar Docs](https://fullcalendar.io/docs)
- [Google Calendar API](https://developers.google.com/calendar/api/v3/reference)
- [Microsoft Graph API](https://learn.microsoft.com/en-us/graph/api/resources/calendar)
- [iCalendar RFC 5545](https://tools.ietf.org/html/rfc5545)

---

## Notes

- **Keep it simple**: MVP should be functional, not perfect
- **Iterate quickly**: Ship MVP, then improve based on feedback
- **Focus on one provider**: Google Calendar is enough for MVP
- **Manual sync is fine**: Automated sync can wait
- **Month view is enough**: Add other views later

