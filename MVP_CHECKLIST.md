# MVP Implementation Checklist

Quick reference checklist for building the calendar application MVP.

## 🎯 MVP Goal
Working calendar that displays Google Calendar events with manual sync capability.

---

## Phase 1: Foundation & Database ✅

### Supabase Setup
- [ ] Create Supabase project at https://supabase.com
- [ ] Copy project URL and anon key
- [ ] Set up local environment variables

### Database Schema
- [ ] Run `supabase/migrations/001_initial_schema.sql` in Supabase SQL Editor
- [ ] Verify tables created: `calendar_connections`, `events`
- [ ] Verify RLS policies are active
- [ ] Test RLS by creating a test user

### Authentication
- [ ] Enable Email/Password auth in Supabase Dashboard
- [ ] Create basic login page
- [ ] Create basic signup page
- [ ] Test user registration and login

**✅ Phase 1 Complete When**: User can sign up, log in, and database is ready

---

## Phase 2: Google Calendar Integration ✅

### Google Cloud Setup
- [ ] Create Google Cloud project
- [ ] Enable Google Calendar API
- [ ] Create OAuth 2.0 credentials (Web application)
- [ ] Add authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`
- [ ] Copy Client ID and Client Secret
- [ ] Store secrets in Supabase: Settings → Edge Functions → Secrets

### OAuth Flow (Frontend)
- [ ] Install Supabase client library
- [ ] Create "Connect Google Calendar" button component
- [ ] Implement OAuth redirect to Google
- [ ] Handle OAuth callback page

### OAuth Handler (Edge Function)
- [ ] Create Edge Function: `handle-google-oauth`
- [ ] Exchange authorization code for tokens
- [ ] Fetch user's primary calendar from Google
- [ ] Insert `calendar_connection` record
- [ ] Test OAuth flow end-to-end

### Sync Function (Edge Function)
- [ ] Create Edge Function: `sync-google-calendar`
- [ ] Load `calendar_connection` from DB
- [ ] Check token expiration
- [ ] Refresh token if needed
- [ ] Fetch events from Google Calendar API
- [ ] Diff with existing events
- [ ] Insert/update/delete events in batch
- [ ] Update `last_synced_at`

### Manual Sync UI
- [ ] Add "Sync Now" button to settings page
- [ ] Call sync Edge Function
- [ ] Show loading state
- [ ] Display success/error message
- [ ] Test manual sync

**✅ Phase 2 Complete When**: User can connect Google Calendar and manually sync events

---

## Phase 3: Calendar Display ✅

### Frontend Setup
- [ ] Initialize React/Vite project (or Next.js)
- [ ] Install dependencies:
  ```bash
  npm install @supabase/supabase-js @fullcalendar/react @fullcalendar/daygrid
  ```
- [ ] Set up Supabase client
- [ ] Create basic routing structure

### Calendar Component
- [ ] Create `Calendar.tsx` component
- [ ] Fetch events from Supabase:
  ```javascript
  const { data } = await supabase
    .from('events')
    .select(`
      *,
      calendar_connections!inner(calendar_name, calendar_color, provider)
    `)
    .eq('user_id', userId)
    .gte('start_time', startDate)
    .lte('start_time', endDate)
  ```
- [ ] Transform events to FullCalendar format
- [ ] Render FullCalendar with events
- [ ] Color code events by calendar

### Event Details
- [ ] Create `EventModal.tsx` component
- [ ] Show event details on click
- [ ] Display: title, time, location, description, calendar source

### Navigation
- [ ] Add previous/next month buttons
- [ ] Add "Today" button
- [ ] Update date range when navigating
- [ ] Refetch events for new date range

### UI Polish
- [ ] Add loading spinner
- [ ] Add empty state (no events)
- [ ] Add error state
- [ ] Make responsive (mobile-friendly)
- [ ] Style calendar to match your design

**✅ Phase 3 Complete When**: User can view their Google Calendar events in a calendar interface

---

## Phase 4: Calendar Management (Optional for MVP)

### Calendar List
- [ ] Create calendar settings page
- [ ] Fetch all `calendar_connections` for user
- [ ] Display calendar list with name and color

### Toggle Visibility
- [ ] Add toggle switch for each calendar
- [ ] Filter events by active calendars
- [ ] Update UI when toggling

### Calendar Settings
- [ ] Edit calendar name
- [ ] Change calendar color
- [ ] Disconnect calendar (delete connection)
- [ ] Show last sync time

### Additional Views
- [ ] Add week view (7-day)
- [ ] Add day view
- [ ] Add view switcher

**✅ Phase 4 Complete When**: User can manage multiple calendars and toggle visibility

---

## Testing Checklist

### Core Functionality
- [ ] User can sign up and log in
- [ ] User can connect Google Calendar
- [ ] OAuth flow completes successfully
- [ ] Events sync from Google Calendar
- [ ] Events display in calendar view
- [ ] Events are color-coded correctly
- [ ] Calendar navigation works
- [ ] Event details show on click
- [ ] Manual sync works
- [ ] Multiple calendars can be connected

### Error Handling
- [ ] OAuth errors display properly
- [ ] Sync errors show to user
- [ ] Network errors handled gracefully
- [ ] Invalid date ranges handled

### Edge Cases
- [ ] All-day events display correctly
- [ ] Events spanning multiple days
- [ ] Events with no end time
- [ ] Empty calendar (no events)
- [ ] Very long event titles
- [ ] Events in different timezones

### Mobile Testing
- [ ] Calendar displays on mobile
- [ ] Navigation works on touch
- [ ] Event details accessible on mobile
- [ ] Buttons are tappable

---

## Deployment Checklist

### Pre-Deployment
- [ ] All environment variables set
- [ ] Supabase production project created
- [ ] Google OAuth redirect URIs updated for production
- [ ] Edge Functions deployed to production
- [ ] Database migrations run in production
- [ ] RLS policies tested in production

### Post-Deployment
- [ ] Test OAuth flow in production
- [ ] Test sync in production
- [ ] Monitor error logs
- [ ] Check Supabase dashboard for issues
- [ ] Verify analytics (if added)

---

## Quick Commands Reference

### Supabase CLI (if using locally)
```bash
# Initialize Supabase
supabase init

# Start local Supabase
supabase start

# Create migration
supabase migration new initial_schema

# Deploy functions
supabase functions deploy handle-google-oauth
supabase functions deploy sync-google-calendar
```

### Google Calendar API
```bash
# Test API call (replace with your token)
curl "https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=2024-01-01T00:00:00Z" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Common Issues & Solutions

### Issue: RLS blocking queries
**Solution**: Verify user is authenticated and policies are correct

### Issue: OAuth redirect not working
**Solution**: Check redirect URI matches exactly in Google Console

### Issue: Token refresh failing
**Solution**: Verify refresh_token is stored and client secret is correct

### Issue: Events not displaying
**Solution**: Check date range, verify events exist in DB, check FullCalendar format

### Issue: Sync taking too long
**Solution**: Limit date range, batch database operations, add progress indicator

---

## Next Steps After MVP

1. **Gather feedback** - What do users want most?
2. **Add automated sync** - Phase 5
3. **Add Outlook** - Phase 6
4. **Add Apple Calendar** - Phase 6
5. **Improve UX** - Based on feedback
6. **Add CRUD** - If users request it

---

## Resources

- [Supabase Docs](https://supabase.com/docs)
- [FullCalendar Docs](https://fullcalendar.io/docs)
- [Google Calendar API](https://developers.google.com/calendar/api/v3/reference)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

---

## Notes

- **Start simple**: MVP doesn't need to be perfect
- **Test frequently**: Test each feature as you build it
- **One provider first**: Google Calendar is enough for MVP
- **Manual sync is fine**: Automated sync can wait
- **Iterate**: Ship MVP, then improve based on feedback

